import numpy as np

from agent.liveness import LivenessChecker


class TestLivenessChecker:
    def test_static_landmarks_fail_after_history(self):
        checker = LivenessChecker(history_size=4, min_motion=0.01)
        bbox = np.array([10, 10, 110, 110])
        frame = np.zeros((200, 200, 3), dtype=np.uint8)
        kps = np.array([[30, 50], [70, 50], [50, 70], [35, 90], [65, 90]], dtype=np.float32)

        result = None
        for _ in range(5):
            result = checker.check(frame, bbox, kps)

        assert result is not None
        assert result.passed is False
        assert "đứng yên" in result.reason

    def test_moving_landmarks_pass(self):
        checker = LivenessChecker(history_size=4, min_motion=0.001)
        bbox = np.array([10, 10, 110, 110])
        frame = np.zeros((200, 200, 3), dtype=np.uint8)

        passed = False
        for i in range(6):
            offset = i * 2.0
            kps = np.array(
                [
                    [30 + offset, 50],
                    [70 + offset, 50],
                    [50 + offset, 70],
                    [35 + offset, 90],
                    [65 + offset, 90],
                ],
                dtype=np.float32,
            )
            result = checker.check(frame, bbox, kps)
            if result.passed:
                passed = True
                break

        assert passed is True
