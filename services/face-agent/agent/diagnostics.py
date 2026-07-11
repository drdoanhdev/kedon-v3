"""Chẩn đoán camera/mạng — cho biết TẠI SAO camera không mở được, không chỉ báo lỗi chung chung."""
from __future__ import annotations

import platform
import shutil
import socket
import subprocess
from dataclasses import dataclass, field
from urllib.parse import urlparse

from agent.camera import CameraConfig


@dataclass
class DiagnosticCheck:
    name: str
    ok: bool
    message: str


@dataclass
class DiagnosticReport:
    checks: list[DiagnosticCheck] = field(default_factory=list)

    @property
    def all_ok(self) -> bool:
        return all(c.ok for c in self.checks)

    @property
    def failures(self) -> list[DiagnosticCheck]:
        return [c for c in self.checks if not c.ok]

    def add(self, name: str, ok: bool, message: str) -> DiagnosticCheck:
        check = DiagnosticCheck(name=name, ok=ok, message=message)
        self.checks.append(check)
        return check

    def summary_line(self) -> str:
        if self.all_ok:
            return "✅ Tất cả kiểm tra đều ổn"
        reasons = "; ".join(c.message for c in self.failures)
        return f"❌ {len(self.failures)} vấn đề: {reasons}"

    def print_report(self) -> None:
        for check in self.checks:
            icon = "✅" if check.ok else "❌"
            print(f"{icon} {check.message}")


def check_ffmpeg() -> DiagnosticCheck:
    path = shutil.which("ffmpeg")
    if path:
        return DiagnosticCheck("ffmpeg", True, f"FFmpeg đã cài ({path})")
    return DiagnosticCheck(
        "ffmpeg",
        False,
        "Chưa cài FFmpeg — cần cho camera IP (RTSP). Chạy: winget install Gyan.FFmpeg rồi mở terminal mới.",
    )


def _extract_host(camera_url: str) -> str | None:
    try:
        parsed = urlparse(camera_url)
        return parsed.hostname
    except Exception:
        return None


def check_ping(host: str, timeout_sec: float = 2.0) -> DiagnosticCheck:
    is_windows = platform.system().lower() == "windows"
    count_flag = "-n" if is_windows else "-c"
    timeout_flag = "-w" if is_windows else "-W"
    timeout_value = str(int(timeout_sec * 1000)) if is_windows else str(int(timeout_sec))
    try:
        result = subprocess.run(
            ["ping", count_flag, "1", timeout_flag, timeout_value, host],
            capture_output=True,
            timeout=timeout_sec + 3,
        )
        if result.returncode == 0:
            return DiagnosticCheck("ping", True, f"Ping tới {host} thành công — camera có trên mạng")
        return DiagnosticCheck(
            "ping",
            False,
            f"Không ping được {host} — kiểm tra dây mạng/nguồn camera, hoặc IP đã đổi (DHCP).",
        )
    except (subprocess.TimeoutExpired, OSError):
        return DiagnosticCheck("ping", False, f"Không ping được {host} — camera có thể mất mạng hoặc đổi IP.")


def check_tcp_port(host: str, port: int, timeout_sec: float = 2.0) -> DiagnosticCheck:
    try:
        with socket.create_connection((host, port), timeout=timeout_sec):
            return DiagnosticCheck(
                "tcp_port", True, f"Cổng {port} trên {host} đang mở — camera đang chạy dịch vụ RTSP/HTTP"
            )
    except (socket.timeout, OSError):
        return DiagnosticCheck(
            "tcp_port",
            False,
            f"Không kết nối được cổng {port} trên {host} — camera offline, sai IP, hoặc cổng RTSP khác 554.",
        )


def classify_camera_open_error(cam_cfg: CameraConfig, error: Exception | None = None) -> str:
    """Suy đoán nguyên nhân dựa trên loại camera và lỗi bắt được."""
    if not cam_cfg.uses_network_stream:
        return (
            f"Không mở được webcam USB index {cam_cfg.camera_index}. "
            "Thử đổi camera_index (0, 1, 2...) bằng cau-hinh-camera.bat, "
            "hoặc kiểm tra webcam có bị ứng dụng khác (Zoom, Teams...) chiếm dụng."
        )
    text = str(error or "").lower()
    if "401" in text or "unauthorized" in text or "auth" in text:
        return "Camera từ chối đăng nhập — sai tên đăng nhập hoặc mật khẩu RTSP."
    if "timeout" in text or "timed out" in text:
        return "Kết nối camera bị timeout — camera có thể offline, đổi IP, hoặc mạng chậm."
    return (
        "Không mở được camera IP. Nguyên nhân thường gặp: sai IP (camera đổi IP qua DHCP), "
        "chưa cài FFmpeg, camera offline, hoặc sai đường dẫn RTSP cho hãng camera."
    )


def run_camera_doctor(cam_cfg: CameraConfig, raw_camera_url: str | None = None) -> DiagnosticReport:
    """Chạy đầy đủ kiểm tra: FFmpeg, ping, cổng RTSP — trả về báo cáo có thể in ra console."""
    report = DiagnosticReport()

    if cam_cfg.uses_network_stream:
        report.checks.append(check_ffmpeg())
        host = _extract_host(raw_camera_url or cam_cfg.camera_url or "")
        if host:
            report.checks.append(check_ping(host))
            port = 554
            try:
                parsed = urlparse(raw_camera_url or cam_cfg.camera_url or "")
                port = parsed.port or 554
            except Exception:
                pass
            report.checks.append(check_tcp_port(host, port))
        else:
            report.add("url_parse", False, "Không đọc được IP từ URL RTSP — kiểm tra định dạng URL.")
    else:
        report.add(
            "usb_camera",
            True,
            f"Chế độ webcam USB (index {cam_cfg.camera_index}) — không cần kiểm tra mạng.",
        )

    return report
