"""Xác nhận nhận diện liên tiếp trước check-in — giảm nhận nhầm."""
from __future__ import annotations


class RecognitionTracker:
    """
    Yêu cầu N lần nhận diện liên tiếp cùng bệnh nhân trước khi check-in.
    Sau check-in, cooldown dài hơn để tránh spam khi BN đứng trước camera.
    """

    def __init__(
        self,
        required_matches: int = 3,
        match_window_sec: float = 2.5,
        post_checkin_cooldown_sec: float = 1800,
    ) -> None:
        self.required_matches = max(1, required_matches)
        self.match_window_sec = match_window_sec
        self.post_checkin_cooldown_sec = post_checkin_cooldown_sec
        self._streak_pid: int | None = None
        self._streak_count = 0
        self._streak_start = 0.0
        self._last_checkin: dict[int, float] = {}

    def reset_streak(self) -> None:
        self._streak_pid = None
        self._streak_count = 0
        self._streak_start = 0.0

    def observe(self, patient_id: int | None, now: float) -> bool:
        """Trả về True khi đủ điều kiện check-in."""
        if patient_id is None:
            self.reset_streak()
            return False

        last = self._last_checkin.get(patient_id, 0.0)
        if now - last < self.post_checkin_cooldown_sec:
            return False

        if self._streak_pid != patient_id:
            self._streak_pid = patient_id
            self._streak_count = 1
            self._streak_start = now
            return False

        if now - self._streak_start > self.match_window_sec:
            self._streak_count = 1
            self._streak_start = now
            return False

        self._streak_count += 1
        return self._streak_count >= self.required_matches

    def mark_checked_in(self, patient_id: int, now: float) -> None:
        self._last_checkin[patient_id] = now
        self.reset_streak()
