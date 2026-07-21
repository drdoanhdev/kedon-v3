"""Optigo face recognition edge agent."""
import argparse
import base64
import json
import os
import platform
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import requests

from agent.config import load_config, save_config
from agent.camera import CameraStream, parse_camera_config, prepare_camera_url_in_config
from agent.diagnostics import classify_camera_open_error, run_camera_doctor
from agent.discovery import DiscoveredCamera, discover_cameras
from agent.preview_profile import apply_low_power_settings
from agent.rtsp_presets import RTSP_PRESETS, build_rtsp_url
from agent.preview_server import FrameStore, LiveCapture, start_preview_server
from agent.face_overlay import OverlayState
from agent.recognizer import FaceRecognizer
from agent.recognition_tracker import RecognitionTracker

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


def _bootstrap_cfg(cfg: dict) -> dict:
    """Chuẩn hóa URL RTSP (vd Dahua subtype=0 → 1) và lưu nếu đổi."""
    warnings = prepare_camera_url_in_config(cfg)
    if warnings:
        save_config(CONFIG_PATH, cfg)
        for msg in warnings:
            print(f"⚠️  {msg}")
    return cfg


def _print_preview_mode(cfg: dict, uses_rtsp: bool) -> None:
    from agent.preview_profile import resolve_preview_profile

    profile = resolve_preview_profile(cfg, uses_rtsp=uses_rtsp)
    if profile.max_width <= 480:
        print(
            f"⚡ Chế độ tối ưu PC yếu: preview {profile.max_width}px, "
            f"~{max(1, int(1 / profile.capture_interval_sec))}fps capture"
        )
    if uses_rtsp:
        print("   Camera IP: dùng substream (subtype=1) — đừng dùng luồng chính subtype=0")


def _configure_stdio() -> None:
    """Tránh lỗi Unicode khi in emoji trên console Windows."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


_configure_stdio()


def api_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def cmd_pair(args: argparse.Namespace) -> None:
    cfg = load_config(CONFIG_PATH)
    base = args.api_url or cfg.get("api_base_url") or "http://localhost:3000"
    code = args.code.strip().upper()

    url = f"{base.rstrip('/')}/api/face-devices/pair"
    res = requests.post(
        url,
        json={
            "pairing_code": code,
            "device_label": args.label or "PC Camera",
            "agent_version": cfg.get("agent_version", "1.0.0"),
        },
        timeout=30,
    )
    if res.status_code == 404:
        print(f"❌ Không tìm thấy API: {url}")
        print("   Nguyên nhân thường gặp:")
        print("   1. Code nhận diện khuôn mặt CHƯA deploy lên server này")
        print("   2. Đang dev local → dùng: python main.py pair --code ... --api-url http://localhost:3000")
        print("      (cần chạy npm run dev trong thư mục kedon-v3 trước)")
        sys.exit(1)
    if not res.ok:
        detail = res.text[:300] if res.text else res.reason
        print(f"❌ Ghép nối thất bại ({res.status_code}): {detail}")
        sys.exit(1)
    data = res.json()

    cfg["device_token"] = data["device_token"]
    # URL dùng khi pair (--api-url) là nguồn tin cậy; server có thể trả NEXT_PUBLIC_APP_URL sai khi dev local
    cfg["api_base_url"] = base.rstrip("/")
    cfg["tenant_id"] = data.get("tenant_id")
    cfg["branch_id"] = data.get("branch_id")
    save_config(CONFIG_PATH, cfg)

    print("✅ Ghép nối thành công!")
    print(f"   Tenant: {data.get('tenant_id')}")
    print(f"   API: {cfg['api_base_url']}")
    print(f"   Config saved: {CONFIG_PATH}")


def sync_embeddings(cfg: dict, recognizer: FaceRecognizer, *, force_full: bool = False) -> None:
    base = cfg["api_base_url"].rstrip("/")
    token = cfg["device_token"]
    since = None if force_full else cfg.get("last_sync_at")

    params = {}
    if since:
        params["since"] = since

    res = requests.get(
        f"{base}/api/face-embeddings/sync",
        headers=api_headers(token),
        params=params,
        timeout=60,
    )
    if res.status_code == 404:
        print(f"❌ Không tìm thấy sync API: {base}/api/face-embeddings/sync")
        print(f"   Kiểm tra api_base_url trong config.json (hiện: {base})")
        print("   Dev local: pair lại với --api-url http://localhost:3000")
        raise SystemExit(1)
    res.raise_for_status()
    payload = res.json()
    rows = payload.get("data") or []

    for row in rows:
        emb = row.get("embedding")
        pid = row.get("patient_id")
        name = row.get("name") or f"BN#{pid}"
        if pid and emb:
            if isinstance(emb, str):
                emb = json.loads(emb)
            recognizer.register(pid, name, emb)

    if not force_full and recognizer.count() == 0 and since:
        print("⚠️  Cache trống sau khởi động — tải lại toàn bộ khuôn mặt...")
        sync_embeddings(cfg, recognizer, force_full=True)
        return

    cfg["last_sync_at"] = payload.get("synced_at")
    save_config(CONFIG_PATH, cfg)
    label = "Full sync" if force_full else "Synced"
    print(f"🔄 {label}: {len(rows)} embeddings (total cache: {recognizer.count()})")
    if recognizer.count() == 0:
        print("   ⚠️  Chưa có khuôn mặt đăng ký — đăng ký bệnh nhân trên web trước.")


def cmd_enroll(args: argparse.Namespace) -> None:
    cfg = load_config(CONFIG_PATH)
    if not cfg.get("device_token"):
        print("❌ Chưa ghép nối. Chạy: python main.py pair --code XXXXXXXX")
        sys.exit(1)

    recognizer = FaceRecognizer()
    camera = CameraStream(parse_camera_config(cfg))
    print(f"📷 Mở camera ({camera.label}), nhìn thẳng vào lens (BN #{args.patient_id})...")
    try:
        camera.open()
        embedding = recognizer.capture_embedding_from_stream(camera, samples=5)
    finally:
        camera.close()

    if embedding is None:
        print("❌ Không detect được khuôn mặt")
        sys.exit(1)

    base = cfg["api_base_url"].rstrip("/")
    res = requests.post(
        f"{base}/api/face-embeddings/enroll",
        headers=api_headers(cfg["device_token"]),
        json={"patient_id": args.patient_id, "embedding": embedding},
        timeout=30,
    )
    res.raise_for_status()
    print(f"✅ Đã đăng ký khuôn mặt cho bệnh nhân #{args.patient_id}")


def check_in(
    cfg: dict,
    patient_id: int,
    name: str,
    confidence: float,
    embedding: list | None = None,
    image_data: str | None = None,
) -> None:
    base = cfg["api_base_url"].rstrip("/")
    payload: dict = {
        "patient_id": patient_id,
        "name": name,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "action": "check_in",
        "confidence": confidence,
    }
    if embedding:
        payload["embedding"] = embedding
    if image_data:
        payload["image_data"] = image_data
    res = requests.post(
        f"{base}/api/nhan-dien",
        headers=api_headers(cfg["device_token"]),
        json=payload,
        timeout=15,
    )
    if res.status_code >= 400:
        print(f"⚠️ Check-in failed: {res.text}")
        return
    data = res.json()
    print(f"✅ {data.get('message', 'Check-in OK')}")


def report_unknown(cfg: dict, embedding: list, quality: float, snapshot_b64: str | None = None) -> None:
    base = cfg["api_base_url"].rstrip("/")
    payload: dict = {"embedding": embedding, "quality_score": quality}
    if snapshot_b64:
        payload["snapshot_base64"] = snapshot_b64
    try:
        res = requests.post(
            f"{base}/api/face-devices/report-unknown",
            headers=api_headers(cfg["device_token"]),
            json=payload,
            timeout=30,
        )
        if res.status_code >= 400:
            print(f"⚠️ report-unknown failed ({res.status_code}): {res.text[:200]}")
            return
        data = res.json() if res.text else {}
        if data.get("had_snapshot_payload") and not data.get("snapshot_stored") and not data.get("snapshot_updated"):
            print("⚠️ Server không lưu được ảnh snapshot — kiểm tra R2 env trên app.optigo.vn (Vercel)")
        elif data.get("snapshot_stored") or data.get("snapshot_updated"):
            print(f"📸 Đã gửi ảnh khuôn mặt lạ (pending #{data.get('pending_face_id', '?')})")
    except requests.RequestException as err:
        print(f"⚠️ report-unknown lỗi mạng: {err}")


def heartbeat(
    cfg: dict,
    *,
    camera_status: str = "ok",
    last_error: str | None = None,
    applied_camera_url: str | None = None,
) -> dict | None:
    """Báo trạng thái agent. Trả về JSON server (có thể chứa pending_camera_url nếu admin
    đã đẩy cấu hình camera mới từ web — xem PATCH /api/face-devices/[id])."""
    base = cfg["api_base_url"].rstrip("/")
    payload = {"agent_version": cfg.get("agent_version", "1.0.0"), "camera_status": camera_status}
    if last_error:
        payload["last_error"] = last_error[:300]
    if applied_camera_url:
        payload["applied_camera_url"] = applied_camera_url
    try:
        res = requests.post(
            f"{base}/api/face-devices/heartbeat",
            headers=api_headers(cfg["device_token"]),
            json=payload,
            timeout=10,
        )
        if res.ok and res.text:
            return res.json()
    except requests.RequestException as err:
        print(f"⚠️ heartbeat lỗi mạng: {err}")
    except ValueError:
        pass
    return None


def _apply_pending_camera_url(cfg: dict, camera: CameraStream, pending_url: str) -> bool:
    """Thử mở camera mới do admin đẩy từ web trước khi áp dụng — không làm gián đoạn nếu sai."""
    from agent.camera import CameraConfig, mask_camera_url, normalize_rtsp_url

    fixed, warnings = normalize_rtsp_url(pending_url.strip())
    for msg in warnings:
        print(f"⚠️  {msg}")
    print(f"🌐 Web yêu cầu đổi camera: {mask_camera_url(fixed)} — đang kiểm tra...")

    new_cfg = CameraConfig(camera_url=fixed, camera_index=cfg.get("camera_index", 0))
    test_cam = CameraStream(new_cfg)
    ok = False
    try:
        test_cam.open()
        read_ok, frame = test_cam.read()
        ok = bool(read_ok and frame is not None)
    except RuntimeError as err:
        print(f"❌ Camera mới từ web lỗi: {err} — giữ nguyên camera hiện tại.")
    finally:
        test_cam.close()

    if not ok:
        print(f"❌ Không mở được camera mới ({mask_camera_url(fixed)}) — giữ nguyên camera hiện tại.")
        return False

    camera.reconfigure(new_cfg)
    cfg["camera_url"] = fixed
    save_config(CONFIG_PATH, cfg)
    print("✅ Đã áp dụng camera mới từ web.")
    heartbeat(cfg, applied_camera_url=fixed)
    return True


def start_embed_server(recognizer: FaceRecognizer, host: str, port: int) -> ThreadingHTTPServer:
    """HTTP embedding service for web enroll — shares recognizer with run loop."""

    class EmbedHandler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *log_args) -> None:
            print(f"[serve] {self.address_string()} - {fmt % log_args}")

        def _send_json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self) -> None:
            if self.path.rstrip("/") == "/health":
                self._send_json(200, {"ok": True, "service": "embed", "model": "buffalo_l"})
                return
            self._send_json(404, {"error": "Not found"})

        def do_POST(self) -> None:
            if self.path != "/embed":
                self._send_json(404, {"error": "Not found"})
                return

            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            try:
                data = json.loads(raw.decode("utf-8"))
                image_b64 = data.get("image_base64") or ""
                jpeg_bytes = base64.b64decode(image_b64)
            except (json.JSONDecodeError, ValueError):
                self._send_json(400, {"error": "Payload không hợp lệ"})
                return

            emb_list, quality = recognizer.embedding_from_jpeg(jpeg_bytes)
            if emb_list is None:
                if quality is not None:
                    hint = (
                        f"Chất lượng ảnh chưa đủ (điểm {quality:.2f}). "
                        "Thử bật thêm đèn, nhìn thẳng camera."
                    )
                    self._send_json(422, {"error": hint, "quality": quality})
                else:
                    self._send_json(422, {"error": "Không detect được khuôn mặt trong ảnh"})
                return

            self._send_json(200, {"embedding": emb_list, "quality": quality})

    server = ThreadingHTTPServer((host, port), EmbedHandler)
    import threading

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"🌐 Embedding service: http://{host}:{port}/embed")
    return server


def cmd_serve(args: argparse.Namespace) -> None:
    """HTTP embedding service for web enroll (InsightFace buffalo_l)."""
    recognizer = FaceRecognizer()
    host = args.host or "127.0.0.1"
    port = int(args.port or 8765)
    server = start_embed_server(recognizer, host, port)
    print("   Dùng cho đăng ký khuôn mặt trên web Optigo. Nhấn Ctrl+C để dừng.")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\n👋 Dừng embedding service.")
        server.shutdown()


def _prompt_choice(prompt: str, choices: dict[str, str], default_key: str | None = None) -> str:
    keys = list(choices.keys())
    print(prompt)
    for i, key in enumerate(keys, 1):
        print(f"  {i}. {choices[key]}")
    default_idx = keys.index(default_key) + 1 if default_key in keys else None
    hint = f" [{default_idx}]" if default_idx else ""
    while True:
        raw = input(f"Chọn (1-{len(keys)}){hint}: ").strip()
        if not raw and default_key:
            return default_key
        if raw.isdigit():
            idx = int(raw)
            if 1 <= idx <= len(keys):
                return keys[idx - 1]
        if raw in choices:
            return raw
        print("Lựa chọn không hợp lệ, thử lại.")


def _build_rtsp_from_preset(preset_key: str, ip: str | None = None) -> str:
    print()
    print("Nhập thông tin camera (lấy từ nhãn camera hoặc app NVR):")
    if not ip:
        ip = input("  IP camera (vd 192.168.1.100): ").strip()
    else:
        print(f"  IP camera: {ip} (đã dò được)")
    user = input("  Tên đăng nhập [admin]: ").strip() or "admin"
    password = input("  Mật khẩu: ").strip()
    if not ip or not password:
        print("❌ Thiếu IP hoặc mật khẩu.")
        sys.exit(1)
    return build_rtsp_url(preset_key, ip, user, password)


def _run_discovery_scan(timeout_sec: float = 3.0) -> list[DiscoveredCamera]:
    print()
    print("🔎 Đang dò camera trong mạng LAN (vài giây)...")
    cameras = discover_cameras(timeout_sec=timeout_sec)
    if not cameras:
        print("❌ Không tìm thấy camera nào. Camera có thể ở mạng khác, hoặc chặn ONVIF/RTSP.")
        print("   Hãy nhập IP thủ công (xem nhãn camera hoặc app NVR).")
    return cameras


def _pick_discovered_camera(cameras: list[DiscoveredCamera]) -> DiscoveredCamera | None:
    print()
    print(f"Tìm thấy {len(cameras)} camera:")
    for i, cam in enumerate(cameras, 1):
        print(f"  {i}. {cam.label}")
    print(f"  {len(cameras) + 1}. Không có trong danh sách — nhập IP thủ công")
    while True:
        raw = input(f"Chọn (1-{len(cameras) + 1}): ").strip()
        if raw.isdigit():
            idx = int(raw)
            if 1 <= idx <= len(cameras):
                return cameras[idx - 1]
            if idx == len(cameras) + 1:
                return None
        print("Lựa chọn không hợp lệ, thử lại.")


def cmd_config_camera(args: argparse.Namespace) -> None:
    """Hướng dẫn đổi camera USB / RTSP — không cần sửa file thủ công."""
    from agent.camera import mask_camera_url

    cfg = load_config(CONFIG_PATH)
    current_url = (cfg.get("camera_url") or "").strip()
    current_index = cfg.get("camera_index", 0)

    print()
    print("=" * 48)
    print("  CẤU HÌNH CAMERA — Optigo Face Agent")
    print("=" * 48)
    print()
    if current_url:
        print(f"Hiện tại: Camera IP — {mask_camera_url(current_url)}")
    else:
        print(f"Hiện tại: Webcam USB — camera_index = {current_index}")
    print()

    if args.rtsp_url:
        cfg["camera_url"] = args.rtsp_url.strip()
        save_config(CONFIG_PATH, cfg)
        print(f"✅ Đã lưu camera IP: {mask_camera_url(cfg['camera_url'])}")
        if args.test:
            cmd_test_camera(argparse.Namespace())
        return

    if args.usb_index is not None:
        cfg["camera_url"] = ""
        cfg["camera_index"] = int(args.usb_index)
        save_config(CONFIG_PATH, cfg)
        print(f"✅ Đã chuyển sang webcam USB — camera_index = {cfg['camera_index']}")
        if args.test:
            cmd_test_camera(argparse.Namespace())
        return

    mode = _prompt_choice(
        "Chọn loại camera:",
        {
            "usb": "Webcam USB (gắn trực tiếp vào PC)",
            "rtsp": "Camera IP qua mạng LAN (RTSP)",
        },
        "usb" if not current_url else "rtsp",
    )

    if mode == "usb":
        raw_index = input(f"  Số thứ tự webcam [0] (thử 0, 1, 2 nếu không mở được): ").strip()
        try:
            camera_index = int(raw_index) if raw_index else 0
        except ValueError:
            print("❌ Số không hợp lệ.")
            sys.exit(1)
        cfg["camera_url"] = ""
        cfg["camera_index"] = camera_index
        save_config(CONFIG_PATH, cfg)
        print(f"✅ Đã lưu webcam USB — camera_index = {camera_index}")
    else:
        print()
        print("Khuyến nghị dùng substream 720p (nhẹ, đủ cho nhận diện mặt).")
        print("Cần cài FFmpeg trên Windows: winget install Gyan.FFmpeg")
        print()
        source = _prompt_choice(
            "Cách nhập URL RTSP:",
            {
                "auto": "Tự động dò camera trong mạng LAN (khuyến nghị)",
                "preset": "Chọn hãng camera (Hikvision / Dahua / Reolink)",
                "custom": "Dán URL RTSP đầy đủ (copy từ VLC hoặc app camera)",
            },
            "auto",
        )
        discovered_ip: str | None = None
        if source == "auto":
            cameras = _run_discovery_scan()
            if cameras:
                picked = _pick_discovered_camera(cameras)
                if picked is not None:
                    discovered_ip = picked.ip
                    source = "preset"
                    default_brand = picked.brand_guess or "dahua"
                else:
                    source = "preset"
                    default_brand = "dahua"
            else:
                source = "preset"
                default_brand = "dahua"
        else:
            default_brand = "dahua"

        if source == "preset":
            brand = _prompt_choice(
                "Chọn hãng:",
                {
                    "hikvision": "Hikvision",
                    "dahua": "Dahua",
                    "reolink": "Reolink",
                },
                default_brand,
            )
            rtsp_url = _build_rtsp_from_preset(brand, ip=discovered_ip)
        else:
            print()
            print("Ví dụ:")
            print("  rtsp://admin:matkhau@192.168.1.100:554/cam/realmonitor?channel=1&subtype=1")
            rtsp_url = input("Dán URL RTSP: ").strip()
            if not rtsp_url.lower().startswith("rtsp://"):
                print("❌ URL phải bắt đầu bằng rtsp://")
                sys.exit(1)

        cfg["camera_url"] = rtsp_url
        from agent.camera import normalize_rtsp_url

        fixed, url_warnings = normalize_rtsp_url(rtsp_url)
        cfg["camera_url"] = fixed
        for msg in url_warnings:
            print(f"⚠️  {msg}")
        save_config(CONFIG_PATH, cfg)
        print(f"✅ Đã lưu camera IP: {mask_camera_url(fixed)}")

        low = input("Máy tính yếu / hay bị đơ lag? [Y/n]: ").strip().lower()
        if low in ("", "y", "yes"):
            cfg = apply_low_power_settings(cfg)
            save_config(CONFIG_PATH, cfg)
            print("⚡ Đã bật chế độ tối ưu PC yếu (preview 480p, ít tải CPU).")
        else:
            cfg["low_power_mode"] = False
            cfg["high_quality_preview"] = True
            save_config(CONFIG_PATH, cfg)

    print()
    test = input("Kiểm tra camera ngay? [Y/n]: ").strip().lower()
    if test in ("", "y", "yes"):
        print()
        cmd_test_camera(argparse.Namespace())
    else:
        print()
        print("Chạy lại chay-agent.bat để áp dụng cấu hình mới.")


def cmd_discover_camera(_args: argparse.Namespace) -> None:
    """Dò camera IP trong mạng LAN (ONVIF + quét cổng RTSP) — không cần biết trước IP."""
    print()
    print("=" * 48)
    print("  DÒ CAMERA TRONG MẠNG LAN")
    print("=" * 48)
    cameras = _run_discovery_scan()
    if not cameras:
        sys.exit(1)
    print()
    print(f"Tìm thấy {len(cameras)} camera:")
    for cam in cameras:
        print(f"  - {cam.label}")
    print()
    print("Chạy 'python main.py config-camera' để chọn và cấu hình camera này.")


def cmd_test_camera(_args: argparse.Namespace) -> None:
    cfg = _bootstrap_cfg(load_config(CONFIG_PATH))
    cam_cfg = parse_camera_config(cfg)
    camera = CameraStream(cam_cfg)
    print(f"🔍 Kiểm tra camera: {camera.label}")
    try:
        camera.open()
        ok, frame = camera.read()
        if ok and frame is not None:
            h, w = frame.shape[:2]
            print(f"✅ Đọc được khung hình {w}x{h}")
        else:
            print("❌ Mở được stream nhưng không đọc được frame")
            _print_camera_diagnostics(cfg, cam_cfg)
            sys.exit(1)
    except RuntimeError as err:
        print(f"❌ {classify_camera_open_error(cam_cfg, err)}")
        _print_camera_diagnostics(cfg, cam_cfg)
        sys.exit(1)
    finally:
        camera.close()


def _print_camera_diagnostics(cfg: dict, cam_cfg) -> None:
    print()
    print("🩺 Đang chẩn đoán nguyên nhân...")
    report = run_camera_doctor(cam_cfg, raw_camera_url=cfg.get("camera_url"))
    report.print_report()


def cmd_doctor(_args: argparse.Namespace) -> None:
    """Kiểm tra toàn diện: FFmpeg, mạng, camera — cho biết chính xác vấn đề nằm ở đâu."""
    cfg = _bootstrap_cfg(load_config(CONFIG_PATH))
    cam_cfg = parse_camera_config(cfg)

    print()
    print("=" * 48)
    print("  CHẨN ĐOÁN — Optigo Face Agent")
    print("=" * 48)
    print()

    print(f"Ghép nối: {'✅ Đã ghép nối' if cfg.get('device_token') else '❌ Chưa ghép nối'}")
    print(f"Camera:   {CameraStream(cam_cfg).label}")
    print()

    report = run_camera_doctor(cam_cfg, raw_camera_url=cfg.get("camera_url"))
    report.print_report()

    print()
    camera = CameraStream(cam_cfg)
    try:
        camera.open()
        ok, frame = camera.read()
        if ok and frame is not None:
            h, w = frame.shape[:2]
            print(f"✅ Camera mở và đọc được khung hình {w}x{h}")
        else:
            print("❌ Mở được stream nhưng không đọc được khung hình")
            report.add("frame_read", False, "Không đọc được khung hình từ camera")
    except RuntimeError as err:
        print(f"❌ {classify_camera_open_error(cam_cfg, err)}")
        report.add("camera_open", False, str(err))
    finally:
        camera.close()

    print()
    print(report.summary_line())
    if not report.all_ok:
        sys.exit(1)


def cmd_preview(_args: argparse.Namespace) -> None:
    """Chỉ mở camera + HTTP preview cho web (không nhận diện)."""
    cfg = _bootstrap_cfg(load_config(CONFIG_PATH))
    cam_cfg = parse_camera_config(cfg)
    camera = CameraStream(cam_cfg)
    frame_store = FrameStore.from_config(cfg, uses_rtsp=cam_cfg.uses_network_stream)
    host = cfg.get("preview_host") or "127.0.0.1"
    port = int(cfg.get("preview_port") or 8766)

    _print_preview_mode(cfg, cam_cfg.uses_network_stream)
    print(f"🔍 Camera: {camera.label}")
    try:
        camera.open()
    except RuntimeError as err:
        print(f"❌ {err}")
        sys.exit(1)

    start_preview_server(host, port, frame_store)
    print(f"🖥️  Preview web: http://{host}:{port}/snapshot")
    print(f"    MJPEG:       http://{host}:{port}/mjpeg")
    print("   Mở tab Kiểm tra camera trên web Optigo. Nhấn Ctrl+C để dừng.")

    live = LiveCapture.from_config(camera, frame_store, cfg)
    live.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Dừng preview.")
    finally:
        live.stop()
        camera.close()


def cmd_run(args: argparse.Namespace) -> None:
    cfg = _bootstrap_cfg(load_config(CONFIG_PATH))
    if not cfg.get("device_token"):
        print("❌ Chưa ghép nối. Chạy: python main.py pair --code XXXXXXXX")
        sys.exit(1)

    from agent.preview_profile import resolve_preview_profile

    liveness_enabled = bool(cfg.get("liveness_enabled", True))
    recognizer = FaceRecognizer(liveness_enabled=liveness_enabled)
    threshold = float(cfg.get("match_threshold", 0.5))
    cooldown = int(cfg.get("check_in_cooldown_sec", 60))
    min_face_quality = float(cfg.get("min_face_quality", 0.35))
    confirm_matches = int(cfg.get("confirm_matches", 3))
    sync_interval = int(cfg.get("sync_interval_sec", 300))
    cam_cfg = parse_camera_config(cfg)
    camera = CameraStream(cam_cfg)
    uses_rtsp = cam_cfg.uses_network_stream
    profile = resolve_preview_profile(cfg, uses_rtsp=uses_rtsp)
    frame_store = FrameStore.from_config(cfg, uses_rtsp=uses_rtsp)
    preview_host = cfg.get("preview_host") or "127.0.0.1"
    preview_port = int(cfg.get("preview_port") or 8766)
    tracker = RecognitionTracker(
        required_matches=confirm_matches,
        match_window_sec=float(cfg.get("confirm_window_sec", 2.5)),
        post_checkin_cooldown_sec=float(cfg.get("post_checkin_cooldown_sec", 1800)),
    )
    if preview_port > 0:
        if preview_host not in ("127.0.0.1", "localhost", "::1"):
            print(
                f"⚠️  CẢNH BÁO BẢO MẬT: preview_host={preview_host} — "
                "preview không có auth, chỉ nên bind 127.0.0.1"
            )
        start_preview_server(preview_host, preview_port, frame_store)
        print(f"🖥️  Preview web: http://{preview_host}:{preview_port}/snapshot")

    _print_preview_mode(cfg, uses_rtsp)

    embed_host = cfg.get("embed_host") or "127.0.0.1"
    embed_port = int(cfg.get("embed_port") or 8765)
    if embed_port > 0:
        if embed_host not in ("127.0.0.1", "localhost", "::1"):
            print(
                f"⚠️  CẢNH BÁO BẢO MẬT: embed_host={embed_host} — "
                "embed API không có auth, chỉ nên bind 127.0.0.1"
            )
        start_embed_server(recognizer, embed_host, embed_port)

    last_check_in: dict[int, float] = {}
    last_sync = 0.0
    last_unknown = 0.0
    last_liveness_warning_log = 0.0
    camera_ok = True
    recognize_interval = profile.recognize_interval_sec

    print("🚀 Agent đang chạy. Nhấn Ctrl+C để dừng.")
    if confirm_matches > 1:
        print(f"   Xác nhận nhận diện: {confirm_matches} lần liên tiếp trước check-in")
    if liveness_enabled:
        print("   Chống giả mạo (liveness) tối thiểu: bật — ảnh in/màn hình đứng yên sẽ bị chặn")
    try:
        camera.open()
        print(f"📷 Camera: {camera.label}")
    except RuntimeError as err:
        print(f"❌ {err}")
        sys.exit(1)

    overlay_state = OverlayState()
    live = LiveCapture.from_config(camera, frame_store, cfg, overlay_state=overlay_state)
    live.start()

    sync_embeddings(cfg, recognizer, force_full=True)
    last_sync = time.time()

    try:
        while True:
            now = time.time()
            if now - last_sync >= sync_interval:
                sync_embeddings(cfg, recognizer)
                last_sync = now
                if camera.last_read_ok or not uses_rtsp:
                    hb_response = heartbeat(cfg)
                else:
                    hb_response = heartbeat(
                        cfg,
                        camera_status="error",
                        last_error=classify_camera_open_error(cam_cfg),
                    )

                pending_url = (hb_response or {}).get("pending_camera_url")
                if pending_url and pending_url.strip() != (cfg.get("camera_url") or "").strip():
                    if _apply_pending_camera_url(cfg, camera, pending_url):
                        cam_cfg = parse_camera_config(cfg)
                        uses_rtsp = cam_cfg.uses_network_stream

            frame = live.get_latest_copy()
            match = None
            if frame is not None:
                match = recognizer.recognize_from_frame(frame, threshold, min_face_quality)
                overlay_state.set(recognizer.last_annotations)
            else:
                overlay_state.clear()

            if match:
                pid, name, score = match
                if tracker.observe(pid, now):
                    if now - last_check_in.get(pid, 0) >= cooldown:
                        match_info = recognizer.last_match or {}
                        check_in(
                            cfg,
                            pid,
                            name,
                            score,
                            embedding=match_info.get("embedding"),
                            image_data=match_info.get("snapshot_b64"),
                        )
                        last_check_in[pid] = now
                        tracker.mark_checked_in(pid, now)
                camera_ok = True
            else:
                tracker.reset_streak()

                liveness_warning = recognizer.last_liveness_warning
                if liveness_warning and now - last_liveness_warning_log >= 30:
                    print(f"🛡️ Liveness check chặn check-in: {liveness_warning}")
                    last_liveness_warning_log = now

                if not camera.last_read_ok and camera.config.uses_network_stream:
                    if camera_ok:
                        print("⚠️ Mất tín hiệu camera IP, đang thử kết nối lại...")
                    camera_ok = False
                elif camera.last_read_ok:
                    camera_ok = True

                unknown = recognizer.last_unknown
                if unknown and now - last_unknown >= 120:
                    report_unknown(
                        cfg,
                        unknown["embedding"],
                        unknown["quality"],
                        unknown.get("snapshot_b64"),
                    )
                    last_unknown = now

            time.sleep(recognize_interval)
    except KeyboardInterrupt:
        print("\n👋 Dừng agent.")
    finally:
        live.stop()
        camera.close()


def _register_windows_autostart() -> None:
    """Đăng ký chạy chay-agent.bat mỗi khi Windows đăng nhập — khỏi cần double-click mỗi lần bật máy."""
    if platform.system().lower() != "windows":
        print("⚠️  Tự khởi động cùng hệ thống hiện chỉ hỗ trợ Windows.")
        return

    bat_path = Path(__file__).resolve().parent / "chay-agent.bat"
    task_name = "OptigoFaceAgent"
    cmd = [
        "schtasks", "/Create", "/TN", task_name,
        "/TR", f'"{bat_path}"',
        "/SC", "ONLOGON", "/RL", "LIMITED", "/F",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode == 0:
            print(f"✅ Đã đăng ký tự khởi động cùng Windows (Task Scheduler: {task_name})")
        else:
            print(f"⚠️  Không đăng ký được tự khởi động: {(result.stderr or result.stdout).strip()[:200]}")
    except (OSError, subprocess.TimeoutExpired) as err:
        print(f"⚠️  Lỗi đăng ký tự khởi động: {err}")


def cmd_setup(_args: argparse.Namespace) -> None:
    """Wizard hợp nhất: ghép nối → dò/cấu hình camera → kiểm tra → tự khởi động → chạy agent.

    Gộp 4 bước rời rạc (ghep-noi.bat / cau-hinh-camera.bat / test-camera / chay-agent.bat)
    thành một luồng duy nhất cho lần cài đặt đầu tiên.
    """
    from agent.camera import mask_camera_url

    print()
    print("=" * 48)
    print("  CÀI ĐẶT NHANH — Optigo Face Agent")
    print("=" * 48)

    cfg = load_config(CONFIG_PATH)

    print()
    print("Bước 1/3 — Ghép nối thiết bị")
    if cfg.get("device_token"):
        print("✅ Đã ghép nối trước đó, bỏ qua.")
    else:
        print("Lấy mã 8 ký tự từ web: Quản lý phòng khám → Nhận diện khuôn mặt → Tạo mã ghép nối")
        print()
        code = input("Nhập mã ghép nối: ").strip()
        if not code:
            print("❌ Cần mã ghép nối để tiếp tục. Chạy lại: python main.py setup")
            sys.exit(1)
        default_url = cfg.get("api_base_url") or "https://app.optigo.vn"
        api_url_in = input(f"URL Optigo [{default_url}]: ").strip()
        cmd_pair(argparse.Namespace(code=code, api_url=api_url_in or default_url, label="PC Camera"))
        cfg = load_config(CONFIG_PATH)

    print()
    print("Bước 2/3 — Cấu hình camera")
    cam_cfg = parse_camera_config(cfg)
    has_camera = bool(cam_cfg.camera_url) or "camera_index" in cfg
    reconfigure = "y"
    if has_camera:
        label = mask_camera_url(cam_cfg.camera_url) if cam_cfg.camera_url else f"webcam USB index {cam_cfg.camera_index}"
        print(f"Camera hiện tại: {label}")
        reconfigure = input("Cấu hình lại camera? [y/N]: ").strip().lower()
    if not has_camera or reconfigure in ("y", "yes"):
        cmd_config_camera(argparse.Namespace(rtsp_url=None, usb_index=None, test=False))
    else:
        print("Bỏ qua — dùng cấu hình camera hiện tại.")

    print()
    print("Bước 3/3 — Kiểm tra & khởi động")
    cfg = _bootstrap_cfg(load_config(CONFIG_PATH))
    cam_cfg = parse_camera_config(cfg)
    camera = CameraStream(cam_cfg)
    ok_camera = False
    try:
        camera.open()
        read_ok, frame = camera.read()
        ok_camera = bool(read_ok and frame is not None)
        if ok_camera:
            h, w = frame.shape[:2]
            print(f"✅ Camera hoạt động tốt — khung hình {w}x{h}")
    except RuntimeError as err:
        print(f"❌ {classify_camera_open_error(cam_cfg, err)}")
    finally:
        camera.close()

    if not ok_camera:
        print()
        print("🩺 Chẩn đoán nguyên nhân...")
        _print_camera_diagnostics(cfg, cam_cfg)
        print()
        print("❌ Camera chưa hoạt động. Sửa lỗi trên rồi chạy lại: python main.py setup")
        sys.exit(1)

    print()
    autostart = input("Tự khởi động agent mỗi khi bật máy? [Y/n]: ").strip().lower()
    if autostart in ("", "y", "yes"):
        _register_windows_autostart()

    print()
    print("🎉 Cài đặt hoàn tất!")
    start_now = input("Chạy agent ngay bây giờ? [Y/n]: ").strip().lower()
    if start_now in ("", "y", "yes"):
        cmd_run(argparse.Namespace())
    else:
        print("Chạy 'chay-agent.bat' bất cứ lúc nào để bắt đầu nhận diện.")


def cmd_setup_ui(_args: argparse.Namespace) -> None:
    """Mở giao diện web cục bộ để ghép nối + dò/chọn camera — thay cho trả lời câu hỏi console."""
    import webbrowser

    from agent.setup_server import start_setup_server

    host = "127.0.0.1"
    port = 8767
    server = start_setup_server(CONFIG_PATH, host=host, port=port)
    url = f"http://{host}:{port}"

    print()
    print("=" * 48)
    print("  GIAO DIỆN CÀI ĐẶT — Optigo Face Agent")
    print("=" * 48)
    print(f"🖥️  {url}")
    print("   Đang mở trình duyệt... (nếu không tự mở, dán link trên vào trình duyệt)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    print("   Sau khi ghép nối + chọn camera xong, đóng cửa sổ này (Ctrl+C) rồi chạy chay-agent.bat.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Đóng giao diện cài đặt.")
    finally:
        server.shutdown()


def main() -> None:
    parser = argparse.ArgumentParser(description="Optigo Face Agent")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser(
        "setup",
        help="Wizard hợp nhất (console): ghép nối + dò/cấu hình camera + kiểm tra + tự khởi động + chạy",
    )

    sub.add_parser(
        "setup-ui",
        help="Giao diện web cục bộ để ghép nối + dò/chọn camera (thay console)",
    )

    p_pair = sub.add_parser("pair", help="Ghép nối thiết bị với mã từ web")
    p_pair.add_argument("--code", required=True, help="Mã ghép nối 8 ký tự")
    p_pair.add_argument("--api-url", default=None, help="URL app (mặc định từ config)")
    p_pair.add_argument("--label", default="PC Camera")

    p_enroll = sub.add_parser("enroll", help="Đăng ký khuôn mặt bệnh nhân")
    p_enroll.add_argument("--patient-id", type=int, required=True)

    sub.add_parser("run", help="Chạy nhận diện liên tục")

    sub.add_parser("test-camera", help="Kiểm tra camera USB hoặc RTSP")

    sub.add_parser("doctor", help="Chẩn đoán toàn diện: FFmpeg, mạng, camera")

    sub.add_parser("discover-camera", help="Dò camera IP trong mạng LAN (ONVIF + quét cổng RTSP)")

    p_cfg_cam = sub.add_parser("config-camera", help="Cấu hình webcam USB hoặc camera IP (RTSP)")
    p_cfg_cam.add_argument("--rtsp-url", default=None, help="URL RTSP đầy đủ (bỏ qua hướng dẫn tương tác)")
    p_cfg_cam.add_argument("--usb-index", type=int, default=None, help="Chuyển sang webcam USB theo index")
    p_cfg_cam.add_argument("--test", action="store_true", help="Kiểm tra camera sau khi lưu")

    sub.add_parser("preview", help="Mở camera + preview HTTP cho web (port 8766)")

    p_serve = sub.add_parser("serve", help="Chạy HTTP embedding service cho web enroll")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8765)

    args = parser.parse_args()
    if args.command == "setup":
        cmd_setup(args)
    elif args.command == "setup-ui":
        cmd_setup_ui(args)
    elif args.command == "pair":
        cmd_pair(args)
    elif args.command == "enroll":
        cmd_enroll(args)
    elif args.command == "run":
        cmd_run(args)
    elif args.command == "test-camera":
        cmd_test_camera(args)
    elif args.command == "doctor":
        cmd_doctor(args)
    elif args.command == "discover-camera":
        cmd_discover_camera(args)
    elif args.command == "config-camera":
        cmd_config_camera(args)
    elif args.command == "preview":
        cmd_preview(args)
    elif args.command == "serve":
        cmd_serve(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
