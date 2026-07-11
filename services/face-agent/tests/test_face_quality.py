import numpy as np

from agent.face_quality import FaceQualityAnalyzer


class TestFaceQualityAnalyzer:
    def test_frontal_from_landmarks_straight_face(self):
        analyzer = FaceQualityAnalyzer()
        # Mắt ngang, mũi giữa, miệng đối xứng
        kps = np.array(
            [
                [100, 100],  # mắt trái
                [200, 100],  # mắt phải
                [150, 140],  # mũi
                [120, 180],  # miệng trái
                [180, 180],  # miệng phải
            ],
            dtype=np.float32,
        )
        bbox = np.array([80, 80, 220, 200])
        score = analyzer._frontal_from_landmarks(kps)
        assert score >= 0.85

    def test_frontal_fallback_bbox(self):
        analyzer = FaceQualityAnalyzer()
        bbox = np.array([0, 0, 80, 100])  # ratio 0.8
        score = analyzer._frontal_from_bbox(bbox)
        assert score == 1.0
