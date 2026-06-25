"""Đánh giá chất lượng khuôn mặt — chọn khung hình sắc nét, rõ mặt nhất khi đăng ký."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np


@dataclass
class FaceQualityScore:
    sharpness: float
    brightness: float
    face_size: float
    frontal: float
    overall: float

    def is_good_quality(self, threshold: float = 0.5) -> bool:
        return self.overall >= threshold


class FaceQualityAnalyzer:
    def __init__(self) -> None:
        self.min_face_width = 80
        self.ideal_face_width = 200
        self.min_sharpness = 50
        self.ideal_sharpness = 200
        self.min_brightness = 40
        self.max_brightness = 220
        self.ideal_brightness = 130
        self.weights = {
            "sharpness": 0.35,
            "brightness": 0.15,
            "face_size": 0.25,
            "frontal": 0.25,
        }

    def analyze(
        self,
        frame: np.ndarray,
        bbox: np.ndarray,
        landmarks: Optional[np.ndarray] = None,
    ) -> FaceQualityScore:
        x1, y1, x2, y2 = map(int, bbox[:4])
        face_img = frame[max(0, y1) : min(frame.shape[0], y2), max(0, x1) : min(frame.shape[1], x2)]
        if face_img.size == 0:
            return FaceQualityScore(0, 0, 0, 0, 0)

        sharpness = self._calculate_sharpness(face_img)
        brightness = self._calculate_brightness(face_img)
        face_size = self._calculate_face_size(x2 - x1, y2 - y1)
        frontal = self._calculate_frontal_score(bbox, landmarks)
        overall = (
            sharpness * self.weights["sharpness"]
            + brightness * self.weights["brightness"]
            + face_size * self.weights["face_size"]
            + frontal * self.weights["frontal"]
        )
        return FaceQualityScore(
            sharpness=round(sharpness, 3),
            brightness=round(brightness, 3),
            face_size=round(face_size, 3),
            frontal=round(frontal, 3),
            overall=round(overall, 3),
        )

    def _calculate_sharpness(self, face_img: np.ndarray) -> float:
        try:
            gray = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            if laplacian_var < self.min_sharpness:
                return 0.0
            if laplacian_var > self.ideal_sharpness:
                return 1.0
            return (laplacian_var - self.min_sharpness) / (self.ideal_sharpness - self.min_sharpness)
        except Exception:
            return 0.5

    def _calculate_brightness(self, face_img: np.ndarray) -> float:
        try:
            gray = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)
            mean_brightness = float(np.mean(gray))
            if mean_brightness < self.min_brightness or mean_brightness > self.max_brightness:
                return 0.0
            distance = abs(mean_brightness - self.ideal_brightness)
            max_distance = max(
                self.ideal_brightness - self.min_brightness,
                self.max_brightness - self.ideal_brightness,
            )
            return 1.0 - (distance / max_distance)
        except Exception:
            return 0.5

    def _calculate_face_size(self, width: int, height: int) -> float:
        face_width = max(width, height)
        if face_width < self.min_face_width:
            return 0.0
        if face_width >= self.ideal_face_width:
            return 1.0
        return (face_width - self.min_face_width) / (self.ideal_face_width - self.min_face_width)

    def _calculate_frontal_score(
        self, bbox: np.ndarray, landmarks: Optional[np.ndarray] = None
    ) -> float:
        _ = landmarks
        x1, y1, x2, y2 = bbox[:4]
        width = x2 - x1
        height = y2 - y1
        if height == 0:
            return 0.5
        ratio = width / height
        if 0.7 <= ratio <= 0.9:
            return 1.0
        if 0.5 <= ratio <= 1.1:
            if ratio < 0.7:
                return 0.5 + (ratio - 0.5) / 0.4
            return 1.0 - (ratio - 0.9) / 0.4
        return 0.3


_analyzer: FaceQualityAnalyzer | None = None


def get_quality_analyzer() -> FaceQualityAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = FaceQualityAnalyzer()
    return _analyzer
