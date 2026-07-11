"""Kiểm tra 'còn sống' (liveness) tối thiểu — chống giả mạo bằng ảnh tĩnh/màn hình.

Không dùng model liveness riêng (tránh tải thêm model nặng cho PC yếu ở phòng khám).
Kết hợp 2 tín hiệu nhẹ, đủ nâng cao rào cản cho các kiểu giả mạo phổ biến nhất:

  1. Chuyển động vi mô của landmark khuôn mặt qua nhiều khung hình liên tiếp —
     người thật luôn có rung động nhẹ/nháy mắt/hơi thở; ảnh in gắn cố định trước
     camera thì gần như đứng yên tuyệt đối theo thời gian.
  2. Năng lượng tần số cao bất thường (hoa văn moiré) — dấu hiệu điển hình khi
     giả mạo bằng cách chiếu ảnh/video qua màn hình điện thoại hoặc máy tính.

Đây là biện pháp giảm thiểu rủi ro ở mức tối thiểu, KHÔNG phải giải pháp chống
giả mạo hoàn chỉnh (không thay thế được model liveness chuyên dụng). Ngưỡng có
thể chỉnh qua config.json nếu gây từ chối nhầm ở một số điều kiện ánh sáng/camera.
"""
from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class LivenessResult:
    passed: bool
    motion_score: float
    moire_score: float
    reason: str


class LivenessChecker:
    """Theo dõi lịch sử landmark ngắn hạn của MỘT danh tính đang được xác nhận
    để phát hiện khung hình 'đứng yên tuyệt đối' (ảnh tĩnh) hoặc hoa văn màn hình
    (screen replay). Phải gọi `reset()` khi danh tính đang theo dõi thay đổi.
    """

    def __init__(
        self,
        history_size: int = 6,
        min_motion: float = 0.0018,
        max_moire: float = 8.0,
    ) -> None:
        self.history_size = history_size
        self.min_motion = min_motion
        self.max_moire = max_moire
        self._landmark_history: deque[np.ndarray] = deque(maxlen=history_size)
        self._last_update = 0.0

    def reset(self) -> None:
        self._landmark_history.clear()
        self._last_update = 0.0

    def _record_landmarks(self, landmarks: np.ndarray, face_width: float) -> float:
        """Độ lệch trung bình chuẩn hoá theo bề rộng mặt so với khung hình liền trước
        (0 = đứng yên tuyệt đối, giá trị càng lớn càng nhiều chuyển động)."""
        if face_width <= 0:
            return 1.0  # không đánh giá được -> không chặn

        normalized = np.asarray(landmarks, dtype=np.float32).reshape(-1) / face_width
        self._landmark_history.append(normalized)
        self._last_update = time.time()

        if len(self._landmark_history) < 2:
            return 1.0  # chưa đủ dữ liệu -> chưa chặn

        diffs = [
            float(np.mean(np.abs(self._landmark_history[i] - self._landmark_history[i - 1])))
            for i in range(1, len(self._landmark_history))
        ]
        return float(np.mean(diffs))

    def _moire_score(self, face_img: np.ndarray) -> float:
        """Tỉ lệ năng lượng tần số cao/thấp trong ảnh mặt — cao bất thường gợi ý
        đang chụp lại một màn hình hiển thị (moiré) thay vì khuôn mặt thật."""
        try:
            gray = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)
            gray = cv2.resize(gray, (128, 128))
            spectrum = np.fft.fftshift(np.fft.fft2(gray.astype(np.float32)))
            magnitude = np.abs(spectrum)

            h, w = magnitude.shape
            cy, cx = h // 2, w // 2
            low = magnitude[cy - 12 : cy + 12, cx - 12 : cx + 12].mean()
            high = magnitude.mean()
            if low <= 1e-6:
                return 0.0
            return float(high / low)
        except Exception:
            return 0.0

    def check(
        self,
        frame: np.ndarray,
        bbox: np.ndarray,
        landmarks: np.ndarray | None,
    ) -> LivenessResult:
        x1, y1, x2, y2 = map(int, bbox[:4])
        face_width = max(1.0, float(x2 - x1))
        face_img = frame[max(0, y1) : min(frame.shape[0], y2), max(0, x1) : min(frame.shape[1], x2)]

        if face_img.size == 0:
            return LivenessResult(True, 1.0, 0.0, "khung hình không hợp lệ — bỏ qua kiểm tra")

        motion_score = 1.0
        if landmarks is not None:
            motion_score = self._record_landmarks(landmarks, face_width)

        moire_score = self._moire_score(face_img)

        # Chỉ chặn vì "đứng yên tuyệt đối" khi đã có đủ lịch sử (tránh false positive
        # ở lần quan sát đầu do vừa chuyển danh tính).
        if len(self._landmark_history) >= self.history_size and motion_score < self.min_motion:
            return LivenessResult(
                False,
                motion_score,
                moire_score,
                "khuôn mặt đứng yên tuyệt đối nhiều khung hình liên tiếp — nghi ảnh tĩnh/ảnh in",
            )

        if moire_score > self.max_moire:
            return LivenessResult(
                False,
                motion_score,
                moire_score,
                "phát hiện hoa văn tần số cao bất thường — nghi phát lại qua màn hình",
            )

        return LivenessResult(True, motion_score, moire_score, "ok")


_checker: LivenessChecker | None = None


def get_liveness_checker() -> LivenessChecker:
    global _checker
    if _checker is None:
        _checker = LivenessChecker()
    return _checker
