"""Tự động dò camera IP trong mạng LAN — ONVIF WS-Discovery + quét cổng RTSP dự phòng."""
from __future__ import annotations

import ipaddress
import socket
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

ONVIF_MULTICAST_ADDR = "239.255.255.250"
ONVIF_MULTICAST_PORT = 3702

_WSD_PROBE = """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:{msg_id}</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>"""

_WSD_SCOPES_TAG = "{http://schemas.xmlsoap.org/ws/2005/04/discovery}Scopes"
_WSD_XADDRS_TAG = "{http://schemas.xmlsoap.org/ws/2005/04/discovery}XAddrs"

_BRAND_HINTS: dict[str, str] = {
    "hikvision": "hikvision",
    "hik-connect": "hikvision",
    "dahua": "dahua",
    "dh-": "dahua",
    "reolink": "reolink",
}


@dataclass
class DiscoveredCamera:
    ip: str
    source: str  # "onvif" hoặc "port_scan"
    brand_guess: str | None = None
    onvif_scopes: list[str] = field(default_factory=list)

    @property
    def label(self) -> str:
        brand = self.brand_guess.capitalize() if self.brand_guess else "Không rõ hãng"
        tag = "ONVIF" if self.source == "onvif" else "RTSP mở"
        return f"{self.ip} — {brand} ({tag})"


def _guess_brand(text: str) -> str | None:
    lower = text.lower()
    for hint, brand in _BRAND_HINTS.items():
        if hint in lower:
            return brand
    return None


def discover_onvif(timeout_sec: float = 3.0) -> list[DiscoveredCamera]:
    """Gửi WS-Discovery multicast probe — hầu hết camera Hikvision/Dahua/Reolink hỗ trợ ONVIF."""
    msg = _WSD_PROBE.format(msg_id=uuid.uuid4())
    found: dict[str, DiscoveredCamera] = {}

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.settimeout(timeout_sec)
        sock.sendto(msg.encode("utf-8"), (ONVIF_MULTICAST_ADDR, ONVIF_MULTICAST_PORT))

        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            remaining = deadline - time.time()
            if remaining <= 0:
                break
            sock.settimeout(remaining)
            try:
                data, addr = sock.recvfrom(65535)
            except socket.timeout:
                break
            except OSError:
                break

            ip = addr[0]
            if ip in found:
                continue

            scopes: list[str] = []
            xaddrs: list[str] = []
            try:
                root = ET.fromstring(data)
                for scopes_el in root.iter(_WSD_SCOPES_TAG):
                    scopes = (scopes_el.text or "").split()
                for xaddrs_el in root.iter(_WSD_XADDRS_TAG):
                    xaddrs = (xaddrs_el.text or "").split()
            except ET.ParseError:
                pass

            found[ip] = DiscoveredCamera(
                ip=ip,
                source="onvif",
                brand_guess=_guess_brand(" ".join(scopes + xaddrs)),
                onvif_scopes=scopes,
            )
    except OSError:
        pass
    finally:
        sock.close()

    return list(found.values())


def _local_ipv4() -> str | None:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def _local_subnet_hosts() -> list[str]:
    """Suy ra dải /24 từ IP LAN hiện tại (bỏ chính máy mình)."""
    local_ip = _local_ipv4()
    if not local_ip:
        return []
    try:
        network = ipaddress.ip_network(f"{local_ip}/24", strict=False)
    except ValueError:
        return []
    return [str(ip) for ip in network.hosts() if str(ip) != local_ip]


def _probe_tcp_port(ip: str, port: int, timeout_sec: float) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout_sec):
            return True
    except OSError:
        return False


def scan_subnet_for_rtsp(timeout_sec: float = 0.35, max_workers: int = 60) -> list[DiscoveredCamera]:
    """Dò cổng 554 (RTSP) trên toàn dải /24 LAN — dự phòng khi mạng chặn multicast ONVIF."""
    hosts = _local_subnet_hosts()
    if not hosts:
        return []

    found: list[DiscoveredCamera] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_probe_tcp_port, ip, 554, timeout_sec): ip for ip in hosts}
        for future in as_completed(futures):
            ip = futures[future]
            try:
                if future.result():
                    found.append(DiscoveredCamera(ip=ip, source="port_scan"))
            except Exception:
                pass
    return found


def discover_cameras(timeout_sec: float = 3.0) -> list[DiscoveredCamera]:
    """Kết hợp ONVIF WS-Discovery và quét cổng RTSP — trả về danh sách theo IP, ONVIF ưu tiên."""
    by_ip: dict[str, DiscoveredCamera] = {}

    for cam in discover_onvif(timeout_sec=timeout_sec):
        by_ip[cam.ip] = cam

    for cam in scan_subnet_for_rtsp():
        if cam.ip not in by_ip:
            by_ip[cam.ip] = cam

    def _sort_key(cam: DiscoveredCamera) -> tuple[int, ...]:
        try:
            return tuple(int(p) for p in cam.ip.split("."))
        except ValueError:
            return (999, 999, 999, 999)

    return sorted(by_ip.values(), key=_sort_key)
