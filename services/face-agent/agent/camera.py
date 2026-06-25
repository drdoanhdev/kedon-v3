"""Open USB webcam or IP camera (RTSP/HTTP) for face-agent."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse, urlunparse

try:
    import cv2
    import numpy as np
except ImportError as e:
    raise ImportError("Cài dependencies: pip install -r requirements.txt") from e


@dataclass(frozen=True)
class CameraConfig:
    camera_url: str | None = None
    camera_index: int = 0

    @property
    def uses_network_stream(self) -> bool:
        return bool(self.camera_url)


def parse_camera_config(cfg: dict[str, Any]) -> CameraConfig:
    raw_url = cfg.get("camera_url") or cfg.get("camera_rtsp_url")
    url = raw_url.strip() if isinstance(raw_url, str) and raw_url.strip() else None
    if url:
        url, _warnings = normalize_rtsp_url(url)
    index = cfg.get("camera_index", 0)
    try:
        camera_index = int(index)
    except (TypeError, ValueError):
        camera_index = 0
    return CameraConfig(camera_url=url, camera_index=camera_index)


def mask_camera_url(url: str) -> str:
    """Ẩn mật khẩu khi in log."""
    try:
        parsed = urlparse(url)
        if not parsed.username:
            return url
        host = parsed.hostname or ""
        if parsed.port:
            host = f"{host}:{parsed.port}"
        user = parsed.username
        netloc = f"{user}:***@{host}"
        return urlunparse(
            (parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment)
        )
    except Exception:
        return re.sub(r"://([^:/@]+):([^@]+)@", r"://\1:***@", url)


def normalize_rtsp_url(url: str) -> tuple[str, list[str]]:
    """Sửa URL RTSP hay gặp — Dahua subtype=0 (main stream) quá nặng cho PC yếu."""
    warnings: list[str] = []
    fixed = url

    lower = fixed.lower()
    if "realmonitor" in lower and "subtype=0" in lower:
        fixed = re.sub(r"subtype=0", "subtype=1", fixed, flags=re.IGNORECASE)
        warnings.append(
            "Dahua subtype=0 là luồng chính (2K/3MP, rất nặng). "
            "Đã đổi sang subtype=1 (substream 720p) — phù hợp PC yếu."
        )

    return fixed, warnings


def prepare_camera_url_in_config(cfg: dict[str, Any]) -> list[str]:
    """Chuẩn hóa camera_url trong config, trả về danh sách cảnh báo."""
    raw = cfg.get("camera_url")
    if not isinstance(raw, str) or not raw.strip():
        return []
    fixed, warnings = normalize_rtsp_url(raw.strip())
    if fixed != raw.strip():
        cfg["camera_url"] = fixed
    return warnings


class CameraStream:
    """Giữ kết nối camera mở — quan trọng với RTSP IP camera."""

    MAX_RECONNECT_FAILURES = 3

    def __init__(self, config: CameraConfig) -> None:
        self.config = config
        self._cap: cv2.VideoCapture | None = None
        self._read_failures = 0
        self.last_read_ok = False

    @property
    def label(self) -> str:
        if self.config.camera_url:
            return mask_camera_url(self.config.camera_url)
        return f"USB index {self.config.camera_index}"

    def open(self) -> None:
        self.close()

        if self.config.camera_url:
            cap = cv2.VideoCapture(self.config.camera_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            open_timeout = getattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC", None)
            if open_timeout is not None:
                cap.set(open_timeout, 15000)
            read_timeout = getattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC", None)
            if read_timeout is not None:
                cap.set(read_timeout, 10000)
        else:
            cap = cv2.VideoCapture(self.config.camera_index)

        if not cap.isOpened():
            if self.config.camera_url:
                raise RuntimeError(
                    f"Không mở được camera IP: {self.label}. "
                    "Kiểm tra URL RTSP, mạng LAN và cài FFmpeg."
                )
            raise RuntimeError(
                f"Không mở được camera index {self.config.camera_index}. "
                "Thử đổi camera_index trong config.json."
            )

        self._cap = cap
        self._read_failures = 0
        self._flush_buffer()

    def _flush_buffer(self) -> None:
        if not self._cap:
            return
        flush_count = 12 if self.config.uses_network_stream else 2
        for _ in range(flush_count):
            self._cap.grab()

    def read_fresh(self, flush_grabs: int = 0) -> tuple[bool, np.ndarray | None]:
        """Đọc khung mới nhất — bỏ qua buffer RTSP cũ (giảm độ trễ)."""
        if self._cap is None or not self._cap.isOpened():
            try:
                self.open()
            except RuntimeError:
                self.last_read_ok = False
                return False, None

        if flush_grabs > 0 and self.config.uses_network_stream:
            for _ in range(flush_grabs):
                self._cap.grab()

        return self.read()

    def read(self) -> tuple[bool, np.ndarray | None]:
        if self._cap is None or not self._cap.isOpened():
            try:
                self.open()
            except RuntimeError:
                self.last_read_ok = False
                return False, None

        ok, frame = self._cap.read()
        if ok and frame is not None:
            self._read_failures = 0
            self.last_read_ok = True
            return True, frame

        self.last_read_ok = False
        self._read_failures += 1
        if self._read_failures >= self.MAX_RECONNECT_FAILURES:
            try:
                self.open()
                ok, frame = self._cap.read() if self._cap else (False, None)
                if ok and frame is not None:
                    self._read_failures = 0
                    self.last_read_ok = True
                    return True, frame
            except RuntimeError:
                pass

        self.last_read_ok = False
        return False, None

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self._read_failures = 0

    def __enter__(self) -> CameraStream:
        self.open()
        return self

    def __exit__(self, *_args) -> None:
        self.close()
