"""Giao diện web cục bộ cho lần cài đặt đầu tiên — thay console bằng trình duyệt.

Chạy: python main.py setup-ui  → mở http://127.0.0.1:8767
Không cần build frontend riêng: HTML/JS được nhúng thẳng trong file này và phục vụ
qua http.server có sẵn trong thư viện chuẩn Python (không thêm dependency).
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

try:
    import cv2
except ImportError as e:
    raise ImportError("Cài dependencies: pip install -r requirements.txt") from e

import requests

from agent.camera import CameraConfig, CameraStream, mask_camera_url, normalize_rtsp_url
from agent.config import load_config, save_config
from agent.diagnostics import classify_camera_open_error, run_camera_doctor
from agent.discovery import discover_cameras
from agent.preview_profile import apply_low_power_settings
from agent.rtsp_presets import build_rtsp_url

_PAGE_HTML = """<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cài đặt Optigo Face Agent</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 720px; margin: 32px auto; padding: 0 16px; color: #1f2937; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; }
  .sub { color: #6b7280; margin-bottom: 24px; }
  .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; background: #fff; }
  .card h2 { font-size: 1rem; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
  .card.done { border-color: #86efac; background: #f0fdf4; }
  .card.disabled { opacity: 0.5; pointer-events: none; }
  label { display: block; font-size: 0.8rem; color: #6b7280; margin: 10px 0 4px; }
  input, select { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; }
  button { background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 9px 16px; font-size: 0.9rem; cursor: pointer; margin-top: 12px; margin-right: 8px; }
  button.secondary { background: #f3f4f6; color: #374151; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .msg { margin-top: 10px; padding: 8px 10px; border-radius: 8px; font-size: 0.85rem; white-space: pre-wrap; }
  .msg.ok { background: #dcfce7; color: #166534; }
  .msg.err { background: #fee2e2; color: #991b1b; }
  .cam-list { list-style: none; padding: 0; margin: 10px 0; max-height: 220px; overflow-y: auto; }
  .cam-list li { padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 6px; cursor: pointer; font-size: 0.88rem; }
  .cam-list li:hover { background: #f9fafb; }
  .cam-list li.selected { border-color: #2563eb; background: #eff6ff; }
  img.preview { max-width: 100%; border-radius: 8px; margin-top: 10px; border: 1px solid #e5e7eb; }
  .step-badge { display: inline-flex; width: 22px; height: 22px; border-radius: 999px; background: #e5e7eb; color: #374151; align-items: center; justify-content: center; font-size: 0.75rem; }
  .card.done .step-badge { background: #22c55e; color: #fff; }
</style>
</head>
<body>
  <h1>Cài đặt Optigo Face Agent</h1>
  <p class="sub">Ghép nối và cấu hình camera ngay trên trình duyệt — không cần gõ lệnh.</p>

  <div class="card" id="card-pair">
    <h2><span class="step-badge">1</span> Ghép nối thiết bị</h2>
    <div id="pair-form">
      <label>Mã ghép nối (8 ký tự, lấy từ web Optigo)</label>
      <input id="pair-code" placeholder="ABCD1234" />
      <label>URL Optigo</label>
      <input id="pair-url" value="https://app.optigo.vn" />
      <button onclick="doPair()">Ghép nối</button>
      <div id="pair-msg"></div>
    </div>
    <div id="pair-done" style="display:none;">✅ Đã ghép nối.</div>
  </div>

  <div class="card" id="card-camera">
    <h2><span class="step-badge">2</span> Chọn camera</h2>
    <button onclick="doDiscover()">🔎 Dò camera trong mạng LAN</button>
    <button class="secondary" onclick="toggleManual()">Nhập thủ công</button>
    <div id="discover-msg"></div>
    <ul class="cam-list" id="cam-list"></ul>

    <div id="manual-form" style="display:none;">
      <label>Hãng camera</label>
      <select id="brand">
        <option value="hikvision">Hikvision</option>
        <option value="dahua" selected>Dahua</option>
        <option value="reolink">Reolink</option>
        <option value="custom">Dán URL RTSP đầy đủ</option>
        <option value="usb">Webcam USB</option>
      </select>

      <div id="ip-fields">
        <label>IP camera</label>
        <input id="cam-ip" placeholder="192.168.1.100" />
        <label>Tên đăng nhập</label>
        <input id="cam-user" value="admin" />
        <label>Mật khẩu</label>
        <input id="cam-pass" type="password" />
      </div>
      <div id="custom-field" style="display:none;">
        <label>URL RTSP đầy đủ</label>
        <input id="cam-url" placeholder="rtsp://admin:matkhau@192.168.1.100:554/..." />
      </div>
      <div id="usb-field" style="display:none;">
        <label>Số thứ tự webcam (thử 0, 1, 2)</label>
        <input id="cam-usb-index" value="0" />
      </div>
    </div>

    <button onclick="doPreview()">📷 Xem thử</button>
    <img class="preview" id="preview-img" style="display:none;" />
    <div id="preview-msg"></div>

    <button onclick="doSave()">💾 Lưu & kiểm tra</button>
    <div id="save-msg"></div>
  </div>

  <p class="sub" id="footer-msg">Xong bước 2 → chạy <code>chay-agent.bat</code> để bắt đầu nhận diện.</p>

<script>
let selectedCamera = null;

function setMsg(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}

async function refreshState() {
  const res = await fetch('/api/state');
  const state = await res.json();
  if (state.paired) {
    document.getElementById('pair-form').style.display = 'none';
    document.getElementById('pair-done').style.display = 'block';
    document.getElementById('card-pair').classList.add('done');
  }
}

async function doPair() {
  const code = document.getElementById('pair-code').value.trim();
  const api_url = document.getElementById('pair-url').value.trim();
  if (!code) { setMsg('pair-msg', 'Nhập mã ghép nối', false); return; }
  const res = await fetch('/api/pair', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({code, api_url}) });
  const data = await res.json();
  if (data.ok) {
    setMsg('pair-msg', '✅ Ghép nối thành công!', true);
    refreshState();
  } else {
    setMsg('pair-msg', '❌ ' + (data.error || 'Lỗi không rõ'), false);
  }
}

function toggleManual() {
  const el = document.getElementById('manual-form');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  selectedCamera = null;
  renderCamList(window.__lastCameras || []);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('brand').addEventListener('change', (e) => {
    const v = e.target.value;
    document.getElementById('ip-fields').style.display = (v !== 'custom' && v !== 'usb') ? 'block' : 'none';
    document.getElementById('custom-field').style.display = v === 'custom' ? 'block' : 'none';
    document.getElementById('usb-field').style.display = v === 'usb' ? 'block' : 'none';
  });
});

function renderCamList(cameras) {
  window.__lastCameras = cameras;
  const ul = document.getElementById('cam-list');
  ul.innerHTML = '';
  cameras.forEach((cam) => {
    const li = document.createElement('li');
    li.textContent = cam.label;
    li.onclick = () => {
      selectedCamera = cam;
      document.getElementById('manual-form').style.display = 'block';
      document.getElementById('brand').value = cam.brand_guess || 'dahua';
      document.getElementById('brand').dispatchEvent(new Event('change'));
      document.getElementById('cam-ip').value = cam.ip;
      [...ul.children].forEach((c) => c.classList.remove('selected'));
      li.classList.add('selected');
    };
    ul.appendChild(li);
  });
}

async function doDiscover() {
  setMsg('discover-msg', 'Đang dò camera trong mạng LAN (vài giây)...', true);
  const res = await fetch('/api/discover');
  const data = await res.json();
  if (!data.cameras || data.cameras.length === 0) {
    setMsg('discover-msg', 'Không tìm thấy camera. Hãy nhập thủ công bên dưới.', false);
    renderCamList([]);
    document.getElementById('manual-form').style.display = 'block';
    return;
  }
  setMsg('discover-msg', `Tìm thấy ${data.cameras.length} camera. Chọn 1 camera bên dưới.`, true);
  renderCamList(data.cameras);
}

function buildPayload() {
  const brand = document.getElementById('brand').value;
  if (brand === 'usb') {
    return { usb_index: parseInt(document.getElementById('cam-usb-index').value || '0', 10) };
  }
  if (brand === 'custom') {
    return { rtsp_url: document.getElementById('cam-url').value.trim() };
  }
  return {
    preset: brand,
    ip: document.getElementById('cam-ip').value.trim(),
    user: document.getElementById('cam-user').value.trim() || 'admin',
    password: document.getElementById('cam-pass').value,
  };
}

async function doPreview() {
  const payload = buildPayload();
  setMsg('preview-msg', 'Đang mở camera...', true);
  const res = await fetch('/api/camera/test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  if (data.ok) {
    setMsg('preview-msg', `✅ Camera hoạt động — khung hình ${data.width}x${data.height}`, true);
    const img = document.getElementById('preview-img');
    const qs = new URLSearchParams();
    if (payload.rtsp_url) qs.set('rtsp_url', payload.rtsp_url);
    else if (payload.usb_index !== undefined) qs.set('usb_index', payload.usb_index);
    else qs.set('rtsp_url', await buildRtspFromPresetLocally(payload));
    img.src = '/api/snapshot?' + qs.toString() + '&t=' + Date.now();
    img.style.display = 'block';
  } else {
    setMsg('preview-msg', '❌ ' + (data.error || 'Không mở được camera') + (data.diagnostics ? '\\n' + data.diagnostics.join('\\n') : ''), false);
  }
}

async function buildRtspFromPresetLocally(payload) {
  // Server tự build URL từ preset khi lưu; để xem trước ta chỉ cần server trả JPEG trực tiếp qua /api/camera/test payload,
  // nên gọi lại /api/camera/save?dry=1 đơn giản hơn — ở đây build tối thiểu để test nhanh nếu preset.
  const res = await fetch('/api/camera/preview-url', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  return data.rtsp_url || '';
}

async function doSave() {
  const payload = buildPayload();
  const res = await fetch('/api/camera/save', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  if (data.ok) {
    setMsg('save-msg', '✅ Đã lưu cấu hình camera. Chạy chay-agent.bat để bắt đầu nhận diện.', true);
    document.getElementById('card-camera').classList.add('done');
  } else {
    setMsg('save-msg', '❌ ' + (data.error || 'Lỗi lưu cấu hình'), false);
  }
}

refreshState();
</script>
</body>
</html>
"""


def _camera_config_from_payload(data: dict[str, Any]) -> CameraConfig | None:
    if data.get("preset") and data.get("ip") and data.get("password") is not None:
        url = build_rtsp_url(
            data["preset"], str(data["ip"]).strip(), str(data.get("user") or "admin"), str(data["password"])
        )
        fixed, _ = normalize_rtsp_url(url)
        return CameraConfig(camera_url=fixed)
    if data.get("rtsp_url"):
        fixed, _ = normalize_rtsp_url(str(data["rtsp_url"]).strip())
        return CameraConfig(camera_url=fixed)
    if data.get("usb_index") is not None:
        try:
            return CameraConfig(camera_index=int(data["usb_index"]))
        except (TypeError, ValueError):
            return None
    return None


def _test_camera_config(cam_cfg: CameraConfig) -> dict[str, Any]:
    camera = CameraStream(cam_cfg)
    try:
        camera.open()
        ok, frame = camera.read()
        if ok and frame is not None:
            h, w = frame.shape[:2]
            return {"ok": True, "width": w, "height": h}
        report = run_camera_doctor(cam_cfg)
        return {
            "ok": False,
            "error": "Mở được nhưng không đọc được khung hình",
            "diagnostics": [c.message for c in report.checks],
        }
    except RuntimeError as err:
        report = run_camera_doctor(cam_cfg, raw_camera_url=cam_cfg.camera_url)
        return {
            "ok": False,
            "error": classify_camera_open_error(cam_cfg, err),
            "diagnostics": [c.message for c in report.checks],
        }
    finally:
        camera.close()


def _snapshot_jpeg(cam_cfg: CameraConfig) -> bytes | None:
    camera = CameraStream(cam_cfg)
    try:
        camera.open()
        ok, frame = camera.read()
        if not (ok and frame is not None):
            return None
        ok2, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        return buf.tobytes() if ok2 else None
    except RuntimeError:
        return None
    finally:
        camera.close()


def start_setup_server(config_path: Path, host: str = "127.0.0.1", port: int = 8767) -> ThreadingHTTPServer:
    """Chạy HTTP server nội bộ phục vụ giao diện cài đặt — không expose ra ngoài (127.0.0.1)."""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:
            pass

        def _json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_json(self) -> dict:
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0:
                return {}
            raw = self.rfile.read(length)
            try:
                return json.loads(raw.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return {}

        def do_GET(self) -> None:
            path = urlparse(self.path).path

            if path == "/":
                body = _PAGE_HTML.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            if path == "/api/state":
                cfg = load_config(config_path)
                cam_url = cfg.get("camera_url") or ""
                self._json(
                    200,
                    {
                        "paired": bool(cfg.get("device_token")),
                        "tenant_id": cfg.get("tenant_id"),
                        "camera_configured": bool(cam_url) or "camera_index" in cfg,
                        "camera_label": mask_camera_url(cam_url)
                        if cam_url
                        else f"Webcam USB index {cfg.get('camera_index', 0)}",
                        "api_base_url": cfg.get("api_base_url"),
                    },
                )
                return

            if path == "/api/discover":
                cameras = discover_cameras(timeout_sec=3.0)
                self._json(
                    200,
                    {
                        "cameras": [
                            {"ip": c.ip, "source": c.source, "brand_guess": c.brand_guess, "label": c.label}
                            for c in cameras
                        ]
                    },
                )
                return

            if path == "/api/snapshot":
                qs = parse_qs(urlparse(self.path).query)
                rtsp_url = (qs.get("rtsp_url") or [""])[0]
                usb_index = (qs.get("usb_index") or [None])[0]
                if rtsp_url:
                    fixed, _ = normalize_rtsp_url(rtsp_url)
                    cam_cfg = CameraConfig(camera_url=fixed)
                elif usb_index is not None:
                    try:
                        cam_cfg = CameraConfig(camera_index=int(usb_index))
                    except ValueError:
                        self._json(400, {"error": "usb_index không hợp lệ"})
                        return
                else:
                    self._json(400, {"error": "Thiếu rtsp_url hoặc usb_index"})
                    return
                jpeg = _snapshot_jpeg(cam_cfg)
                if jpeg is None:
                    self.send_response(503)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(jpeg)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(jpeg)
                return

            self._json(404, {"error": "Not found"})

        def do_POST(self) -> None:
            path = urlparse(self.path).path

            if path == "/api/pair":
                data = self._read_json()
                code = str(data.get("code") or "").strip().upper()
                api_url = str(data.get("api_url") or "https://app.optigo.vn").strip().rstrip("/")
                if not code:
                    self._json(400, {"ok": False, "error": "Thiếu mã ghép nối"})
                    return
                cfg = load_config(config_path)
                try:
                    res = requests.post(
                        f"{api_url}/api/face-devices/pair",
                        json={
                            "pairing_code": code,
                            "device_label": "PC Camera",
                            "agent_version": cfg.get("agent_version", "1.0.0"),
                        },
                        timeout=30,
                    )
                except requests.RequestException as err:
                    self._json(200, {"ok": False, "error": f"Lỗi mạng: {err}"})
                    return
                if not res.ok:
                    detail = res.text[:300] if res.text else res.reason
                    self._json(200, {"ok": False, "error": f"Ghép nối thất bại ({res.status_code}): {detail}"})
                    return
                payload = res.json()
                cfg["device_token"] = payload["device_token"]
                cfg["api_base_url"] = api_url
                cfg["tenant_id"] = payload.get("tenant_id")
                cfg["branch_id"] = payload.get("branch_id")
                save_config(config_path, cfg)
                self._json(200, {"ok": True, "tenant_id": payload.get("tenant_id")})
                return

            if path == "/api/camera/preview-url":
                data = self._read_json()
                cam_cfg = _camera_config_from_payload(data)
                self._json(200, {"rtsp_url": cam_cfg.camera_url if cam_cfg else ""})
                return

            if path == "/api/camera/test":
                data = self._read_json()
                cam_cfg = _camera_config_from_payload(data)
                if cam_cfg is None:
                    self._json(400, {"ok": False, "error": "Thiếu thông tin camera"})
                    return
                self._json(200, _test_camera_config(cam_cfg))
                return

            if path == "/api/camera/save":
                data = self._read_json()
                cam_cfg = _camera_config_from_payload(data)
                if cam_cfg is None:
                    self._json(400, {"ok": False, "error": "Thiếu thông tin camera"})
                    return
                cfg = load_config(config_path)
                if cam_cfg.camera_url:
                    cfg["camera_url"] = cam_cfg.camera_url
                else:
                    cfg["camera_url"] = ""
                    cfg["camera_index"] = cam_cfg.camera_index
                cfg = apply_low_power_settings(cfg) if data.get("low_power", True) else cfg
                save_config(config_path, cfg)
                self._json(200, {"ok": True})
                return

            self._json(404, {"error": "Not found"})

    server = ThreadingHTTPServer((host, port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server
