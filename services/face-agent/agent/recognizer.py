"""InsightFace wrapper for detection + embedding."""
from __future__ import annotations

import base64
import numpy as np

try:
    import cv2
    from insightface.app import FaceAnalysis
except ImportError as e:
    raise ImportError(
        "Cài dependencies: pip install -r requirements.txt"
    ) from e

from agent.camera import CameraStream


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

    def embedding_from_jpeg(self, jpeg_bytes: bytes) -> list | None:
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        emb = self._embedding_from_frame(frame)
        return emb.tolist() if emb is not None else None

    def capture_embedding_from_stream(
        self, stream: CameraStream, samples: int = 5
    ) -> list | None:
        collected: list[np.ndarray] = []
        max_attempts = samples * 30 if stream.config.uses_network_stream else samples * 20

        for _ in range(max_attempts):
            ok, frame = stream.read()
            if not ok or frame is None:
                continue
            emb = self._embedding_from_frame(frame)
            if emb is not None:
                collected.append(emb)
            if len(collected) >= samples:
                break

        if len(collected) < 2:
            return None

        mean = np.mean(collected, axis=0)
        mean = mean / (np.linalg.norm(mean) + 1e-8)
        return mean.tolist()

    def _face_jpeg_b64(self, frame: np.ndarray, face) -> str | None:
        try:
            bbox = face.bbox
            x1, y1, x2, y2 = map(int, bbox[:4])
            h, w = frame.shape[:2]
            pad = int(max(x2 - x1, y2 - y1) * 0.25)
            x1 = max(0, x1 - pad)
            y1 = max(0, y1 - pad)
            x2 = min(w, x2 + pad)
            y2 = min(h, y2 + pad)
            if x2 <= x1 or y2 <= y1:
                return None
            crop = frame[y1:y2, x1:x2]
            ok, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            if not ok:
                return None
            return base64.b64encode(buf.tobytes()).decode("ascii")
        except Exception:
            return None

    def _unknown_payload(self, frame: np.ndarray, emb: np.ndarray, quality: float) -> dict:
        face = self._best_face(frame)
        snapshot_b64 = self._face_jpeg_b64(frame, face) if face is not None else None
        payload: dict = {"embedding": emb.tolist(), "quality": quality}
        if snapshot_b64:
            payload["snapshot_b64"] = snapshot_b64
        return payload

    def recognize_from_frame(
        self, frame: np.ndarray, threshold: float
    ) -> tuple[int, str, float] | None:
        emb = self._embedding_from_frame(frame)
        if emb is None:
            self.last_unknown = None
            return None

        if not self._cache:
            self.last_unknown = self._unknown_payload(frame, emb, 0.5)
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

        self.last_unknown = self._unknown_payload(frame, emb, max(0, best_score))
        return None

    def recognize_from_stream(
        self, stream: CameraStream, threshold: float
    ) -> tuple[int, str, float] | None:
        ok, frame = stream.read()
        if not ok or frame is None:
            return None
        return self.recognize_from_frame(frame, threshold)
