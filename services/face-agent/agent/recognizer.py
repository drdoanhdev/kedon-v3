"""InsightFace wrapper for detection + embedding."""
from __future__ import annotations

import numpy as np

try:
    import cv2
    from insightface.app import FaceAnalysis
except ImportError as e:
    raise ImportError(
        "Cài dependencies: pip install -r requirements.txt"
    ) from e


class FaceRecognizer:
    def __init__(self) -> None:
        self.app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        self._cache: dict[int, dict] = {}
        self.last_unknown: dict | None = None

    def count(self) -> int:
        return len(self._cache)

    def register(self, patient_id: int, name: str, embedding: list | np.ndarray) -> None:
        vec = np.array(embedding, dtype=np.float32)
        vec = vec / (np.linalg.norm(vec) + 1e-8)
        self._cache[int(patient_id)] = {"name": name, "embedding": vec}

    def _best_face(self, frame: np.ndarray):
        faces = self.app.get(frame)
        if not faces:
            return None
        return max(faces, key=lambda f: float(getattr(f, "det_score", 0)))

    def _embedding_from_frame(self, frame: np.ndarray) -> np.ndarray | None:
        face = self._best_face(frame)
        if face is None or face.embedding is None:
            return None
        vec = np.array(face.embedding, dtype=np.float32)
        return vec / (np.linalg.norm(vec) + 1e-8)

    def capture_embedding(self, camera_index: int = 0, samples: int = 5) -> list | None:
        cap = cv2.VideoCapture(camera_index)
        if not cap.isOpened():
            raise RuntimeError(f"Không mở được camera index {camera_index}")

        collected: list[np.ndarray] = []
        try:
            for _ in range(samples * 20):
                ok, frame = cap.read()
                if not ok:
                    continue
                emb = self._embedding_from_frame(frame)
                if emb is not None:
                    collected.append(emb)
                if len(collected) >= samples:
                    break
        finally:
            cap.release()

        if len(collected) < 2:
            return None

        mean = np.mean(collected, axis=0)
        mean = mean / (np.linalg.norm(mean) + 1e-8)
        return mean.tolist()

    def recognize_from_camera(
        self, camera_index: int, threshold: float
    ) -> tuple[int, str, float] | None:
        cap = cv2.VideoCapture(camera_index)
        if not cap.isOpened():
            return None
        try:
            ok, frame = cap.read()
            if not ok:
                return None
            emb = self._embedding_from_frame(frame)
            if emb is None:
                self.last_unknown = None
                return None

            if not self._cache:
                self.last_unknown = {"embedding": emb.tolist(), "quality": 0.5}
                return None

            best_pid = None
            best_name = ""
            best_score = -1.0

            for pid, item in self._cache.items():
                score = float(np.dot(emb, item["embedding"]))
                if score > best_score:
                    best_score = score
                    best_pid = pid
                    best_name = item["name"]

            if best_pid is not None and best_score >= threshold:
                self.last_unknown = None
                return best_pid, best_name, best_score

            self.last_unknown = {"embedding": emb.tolist(), "quality": max(0, best_score)}
            return None
        finally:
            cap.release()
