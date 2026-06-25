"""Preview tuning — profiles for weak PCs and RTSP IP cameras."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

try:
    import cv2
except ImportError:
    cv2 = None  # type: ignore


@dataclass(frozen=True)
class PreviewProfile:
    max_width: int
    jpeg_quality: int
    capture_interval_sec: float
    encode_every_n: int
    recognize_interval_sec: float
    recognize_max_width: int
    rtsp_grab_flush: int
    web_snapshot_interval_ms: int


NORMAL = PreviewProfile(
    max_width=640,
    jpeg_quality=68,
    capture_interval_sec=0.06,
    encode_every_n=1,
    recognize_interval_sec=0.4,
    recognize_max_width=640,
    rtsp_grab_flush=3,
    web_snapshot_interval_ms=80,
)

LOW_POWER = PreviewProfile(
    max_width=480,
    jpeg_quality=52,
    capture_interval_sec=0.14,
    encode_every_n=2,
    recognize_interval_sec=0.75,
    recognize_max_width=480,
    rtsp_grab_flush=6,
    web_snapshot_interval_ms=130,
)


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "y")
    return bool(value)


def resolve_preview_profile(cfg: dict | None, uses_rtsp: bool = False) -> PreviewProfile:
    cfg = cfg or {}
    base = LOW_POWER if _as_bool(cfg.get("low_power_mode")) else NORMAL
    if uses_rtsp and cfg.get("low_power_mode") is None and not _as_bool(cfg.get("high_quality_preview")):
        base = LOW_POWER

    def pick(key: str, default: float | int) -> float | int:
        if key in cfg and cfg[key] is not None:
            return cfg[key]
        return default

    return PreviewProfile(
        max_width=int(pick("preview_max_width", base.max_width)),
        jpeg_quality=int(pick("preview_jpeg_quality", base.jpeg_quality)),
        capture_interval_sec=float(pick("preview_capture_interval_sec", base.capture_interval_sec)),
        encode_every_n=max(1, int(pick("preview_encode_every_n", base.encode_every_n))),
        recognize_interval_sec=float(pick("recognize_interval_sec", base.recognize_interval_sec)),
        recognize_max_width=int(pick("recognize_max_width", base.recognize_max_width)),
        rtsp_grab_flush=max(0, int(pick("rtsp_grab_flush", base.rtsp_grab_flush))),
        web_snapshot_interval_ms=int(pick("web_snapshot_interval_ms", base.web_snapshot_interval_ms)),
    )


def apply_low_power_settings(cfg: dict) -> dict:
    cfg = dict(cfg)
    cfg["low_power_mode"] = True
    cfg["preview_max_width"] = LOW_POWER.max_width
    cfg["preview_jpeg_quality"] = LOW_POWER.jpeg_quality
    cfg["preview_capture_interval_sec"] = LOW_POWER.capture_interval_sec
    cfg["preview_encode_every_n"] = LOW_POWER.encode_every_n
    cfg["recognize_interval_sec"] = LOW_POWER.recognize_interval_sec
    cfg["recognize_max_width"] = LOW_POWER.recognize_max_width
    cfg["rtsp_grab_flush"] = LOW_POWER.rtsp_grab_flush
    cfg["web_snapshot_interval_ms"] = LOW_POWER.web_snapshot_interval_ms
    return cfg


def resize_frame(frame, max_width: int):
    if cv2 is None or max_width <= 0:
        return frame
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    return cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)
