"""Vẽ khung mặt + tên lên preview camera."""
from __future__ import annotations

import threading
from dataclasses import dataclass

import cv2
import numpy as np

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    Image = None  # type: ignore

# Màu BGR
COLOR_RECOGNIZED = (0, 220, 0)
COLOR_UNKNOWN = (0, 140, 255)
COLOR_SCANNING = (0, 220, 220)


@dataclass
class FaceAnnotation:
    """bbox chuẩn hóa 0–1 theo kích thước khung hình nhận diện."""
    bbox_norm: tuple[float, float, float, float]
    label: str
    sublabel: str = ""
    color: tuple[int, int, int] = COLOR_RECOGNIZED


class OverlayState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._annotations: list[FaceAnnotation] = []

    def set(self, annotations: list[FaceAnnotation]) -> None:
        with self._lock:
            self._annotations = list(annotations)

    def clear(self) -> None:
        with self._lock:
            self._annotations = []

    def get(self) -> list[FaceAnnotation]:
        with self._lock:
            return list(self._annotations)


_font_cache: dict[int, object] = {}


def _get_font(size: int):
    if Image is None:
        return None
    if size in _font_cache:
        return _font_cache[size]
    try:
        font = ImageFont.truetype("arial.ttf", size)
    except OSError:
        font = ImageFont.load_default()
    _font_cache[size] = font
    return font


def _draw_text(frame: np.ndarray, text: str, pos: tuple[int, int], color: tuple[int, int, int], size: int = 22) -> np.ndarray:
    if not text:
        return frame
    if Image is None:
        cv2.putText(frame, text, pos, cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2, cv2.LINE_AA)
        return frame
    try:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        draw = ImageDraw.Draw(pil)
        font = _get_font(size)
        rgb_color = (color[2], color[1], color[0])
        bbox = draw.textbbox(pos, text, font=font)
        pad = 4
        draw.rectangle(
            [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad],
            fill=(0, 0, 0),
        )
        draw.text(pos, text, font=font, fill=rgb_color)
        return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        cv2.putText(frame, text, pos, cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2, cv2.LINE_AA)
        return frame


def draw_overlays(frame: np.ndarray, annotations: list[FaceAnnotation]) -> np.ndarray:
    if frame is None or not annotations:
        return frame

    out = frame.copy()
    h, w = out.shape[:2]

    for ann in annotations:
        x1 = int(max(0, ann.bbox_norm[0] * w))
        y1 = int(max(0, ann.bbox_norm[1] * h))
        x2 = int(min(w - 1, ann.bbox_norm[2] * w))
        y2 = int(min(h - 1, ann.bbox_norm[3] * h))
        if x2 <= x1 or y2 <= y1:
            continue

        cv2.rectangle(out, (x1, y1), (x2, y2), ann.color, 2)

        label_y = max(24, y1 - 8)
        out = _draw_text(out, ann.label, (x1, label_y - 22), ann.color, size=22)
        if ann.sublabel:
            out = _draw_text(out, ann.sublabel, (x1, label_y), ann.color, size=16)

    return out
