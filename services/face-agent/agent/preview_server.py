"""HTTP preview of the latest camera frame (RTSP/USB) for web UI."""
from __future__ import annotations

import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import cv2
except ImportError as e:
    raise ImportError("Cài opencv-python") from e

from agent.preview_profile import PreviewProfile, resolve_preview_profile, resize_frame
from agent.face_overlay import OverlayState, draw_overlays

DEFAULT_MJPEG_MAX_FPS = 12


class FrameStore:
    """Latest JPEG frame with versioning — MJPEG only pushes when frame changes."""

    def __init__(self, profile: PreviewProfile) -> None:
        self._profile = profile
        self._cond = threading.Condition()
        self._jpeg: bytes | None = None
        self._version = 0
        self._updated_at = 0.0

    @classmethod
    def from_config(cls, cfg: dict | None, uses_rtsp: bool = False) -> FrameStore:
        return cls(resolve_preview_profile(cfg, uses_rtsp=uses_rtsp))

    def update(self, frame) -> None:
        frame = resize_frame(frame, self._profile.max_width)
        ok, buf = cv2.imencode(
            ".jpg",
            frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), self._profile.jpeg_quality],
        )
        if not ok:
            return

        data = buf.tobytes()
        with self._cond:
            self._jpeg = data
            self._version += 1
            self._updated_at = time.time()
            self._cond.notify_all()

    def get_jpeg(self) -> bytes | None:
        with self._cond:
            return self._jpeg

    def get_jpeg_version(self) -> tuple[bytes | None, int]:
        with self._cond:
            return self._jpeg, self._version

    def wait_for_version(self, after_version: int, timeout: float) -> tuple[bytes | None, int]:
        deadline = time.time() + timeout
        with self._cond:
            while self._version <= after_version:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self._cond.wait(remaining)
            return self._jpeg, self._version

    @property
    def age_sec(self) -> float:
        with self._cond:
            if self._updated_at <= 0:
                return 9999.0
            return time.time() - self._updated_at

    @property
    def profile(self) -> PreviewProfile:
        return self._profile


class LiveCapture:
    """Background thread: read camera for preview + latest frame for recognition."""

    def __init__(
        self,
        camera,
        frame_store: FrameStore,
        profile: PreviewProfile,
        overlay_state: OverlayState | None = None,
    ) -> None:
        self._camera = camera
        self._frame_store = frame_store
        self._profile = profile
        self._overlay_state = overlay_state
        self._lock = threading.Lock()
        self._latest = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="live-capture", daemon=True)

    @classmethod
    def from_config(
        cls,
        camera,
        frame_store: FrameStore,
        cfg: dict | None,
        overlay_state: OverlayState | None = None,
    ) -> LiveCapture:
        uses_rtsp = camera.config.uses_network_stream
        profile = resolve_preview_profile(cfg, uses_rtsp=uses_rtsp)
        return cls(camera, frame_store, profile, overlay_state)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=2.0)

    def get_latest_copy(self):
        with self._lock:
            if self._latest is None:
                return None
            return self._latest.copy()

    def _loop(self) -> None:
        frame_count = 0
        while not self._stop.is_set():
            ok, frame = self._camera.read_fresh(
                flush_grabs=self._profile.rtsp_grab_flush
                if self._camera.config.uses_network_stream
                else 0
            )
            if ok and frame is not None:
                frame_count += 1
                small = resize_frame(frame, self._profile.recognize_max_width)
                with self._lock:
                    self._latest = small
                if frame_count % self._profile.encode_every_n == 0:
                    display = frame
                    if self._overlay_state is not None:
                        annotations = self._overlay_state.get()
                        if annotations:
                            display = draw_overlays(frame, annotations)
                    self._frame_store.update(display)

            self._stop.wait(self._profile.capture_interval_sec)


def start_preview_server(
    host: str,
    port: int,
    frame_store: FrameStore,
    max_fps: float = DEFAULT_MJPEG_MAX_FPS,
) -> ThreadingHTTPServer:
    min_frame_interval = 1.0 / max(4.0, min(20.0, max_fps))
    profile = frame_store.profile

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            pass

        def _cors(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")

        def do_GET(self) -> None:
            if self.path.startswith("/snapshot"):
                jpeg = frame_store.get_jpeg()
                if not jpeg:
                    self.send_response(503)
                    self.end_headers()
                    self.wfile.write(b"No frame yet")
                    return
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(jpeg)))
                self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self._cors()
                self.end_headers()
                self.wfile.write(jpeg)
                return

            if self.path.startswith("/mjpeg"):
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-store")
                self._cors()
                self.end_headers()
                try:
                    last_sent_version = -1
                    while True:
                        jpeg, version = frame_store.wait_for_version(
                            last_sent_version,
                            timeout=min_frame_interval,
                        )
                        if jpeg and version > last_sent_version:
                            self.wfile.write(b"--frame\r\n")
                            self.wfile.write(b"Content-Type: image/jpeg\r\n")
                            self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode())
                            self.wfile.write(jpeg)
                            self.wfile.write(b"\r\n")
                            self.wfile.flush()
                            last_sent_version = version
                except (BrokenPipeError, ConnectionResetError):
                    return

            if self.path.startswith("/health"):
                age = frame_store.age_sec
                body = (
                    '{"ok": '
                    + ("true" if age < 5 else "false")
                    + ', "frame_age_sec": '
                    + str(round(age, 2))
                    + ', "web_snapshot_interval_ms": '
                    + str(profile.web_snapshot_interval_ms)
                    + ', "low_power_mode": '
                    + ("true" if profile.max_width <= 480 else "false")
                    + "}"
                ).encode()
                self.send_response(200 if age < 5 else 503)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self._cors()
                self.end_headers()
                self.wfile.write(body)
                return

            self.send_response(404)
            self.end_headers()

    server = ThreadingHTTPServer((host, port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server
