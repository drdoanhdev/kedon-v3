"""Unit tests cho face-agent (chạy: pytest từ services/face-agent)."""

from agent.recognition_tracker import RecognitionTracker


class TestRecognitionTracker:
    def test_requires_consecutive_matches(self):
        tracker = RecognitionTracker(
            required_matches=3,
            match_window_sec=5.0,
            post_checkin_cooldown_sec=0,
        )
        t0 = 10_000.0
        assert tracker.observe(42, t0) is False
        assert tracker.observe(42, t0 + 0.5) is False
        assert tracker.observe(42, t0 + 1.0) is True

    def test_resets_on_different_patient(self):
        tracker = RecognitionTracker(
            required_matches=2,
            match_window_sec=5.0,
            post_checkin_cooldown_sec=0,
        )
        t0 = 20_000.0
        tracker.observe(1, t0)
        assert tracker.observe(2, t0 + 0.2) is False

    def test_post_checkin_cooldown_blocks(self):
        tracker = RecognitionTracker(
            required_matches=1,
            match_window_sec=5.0,
            post_checkin_cooldown_sec=60,
        )
        t0 = 30_000.0
        # Lần đầu khởi tạo streak (count=1) → False; lần 2 đạt required_matches=1.
        assert tracker.observe(7, t0) is False
        assert tracker.observe(7, t0 + 0.1) is True
        tracker.mark_checked_in(7, t0 + 0.1)
        assert tracker.observe(7, t0 + 10) is False
