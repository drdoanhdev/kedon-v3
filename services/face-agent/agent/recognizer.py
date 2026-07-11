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
from agent.face_quality import FaceQualityScore, get_quality_analyzer
from agent.face_overlay import COLOR_RECOGNIZED, COLOR_SCANNING, COLOR_UNKNOWN, FaceAnnotation
from agent.liveness import LivenessChecker, get_liveness_checker


class FaceRecognizer:
    def __init__(self, *, liveness_enabled: bool = True) -> None:
        self.app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        self._cache: dict[int, dict] = {}
        self._cache_matrix: np.ndarray | None = None
        self._cache_pids: list[int] = []
        self.last_unknown: dict | None = None
        self.last_match: dict | None = None
        self.last_annotations: list[FaceAnnotation] = []
        self._quality = get_quality_analyzer()
        self.liveness_enabled = liveness_enabled
        self._liveness: LivenessChecker = get_liveness_checker()
        self._liveness_pid: int | None = None
        self.last_liveness_warning: str | None = None

    def count(self) -> int:
        return len(self._cache)

    def register(self, patient_id: int, name: str, embedding: list | np.ndarray) -> None:
        vec = np.array(embedding, dtype=np.float32)
        vec = vec / (np.linalg.norm(vec) + 1e-8)
        self._cache[int(patient_id)] = {"name": name, "embedding": vec}
        self._cache_matrix: np.ndarray | None = None
        self._cache_pids: list[int] = []

    def _rebuild_cache_matrix(self) -> None:
        if not self._cache:
            self._cache_matrix = None
            self._cache_pids = []
            return
        self._cache_pids = list(self._cache.keys())
        self._cache_matrix = np.stack(
            [self._cache[pid]["embedding"] for pid in self._cache_pids],
            axis=0,
        )

    def _best_match(self, emb: np.ndarray) -> tuple[int | None, str, float]:
        """So khớp vectorized — O(N) nhưng dùng BLAS thay vòng Python."""
        if not self._cache:
            return None, "", -1.0
        if self._cache_matrix is None or len(self._cache_pids) != len(self._cache):
            self._rebuild_cache_matrix()
        assert self._cache_matrix is not None
        scores = self._cache_matrix @ emb
        best_idx = int(np.argmax(scores))
        best_score = float(scores[best_idx])
        best_pid = self._cache_pids[best_idx]
        return best_pid, self._cache[best_pid]["name"], best_score

    def _faces(self, frame: np.ndarray):
        return self.app.get(frame) or []

    def _best_face(self, frame: np.ndarray):
        faces = self._faces(frame)
        if not faces:
            return None
        return max(faces, key=lambda f: float(getattr(f, "det_score", 0)))

    def _face_quality(self, frame: np.ndarray, face) -> FaceQualityScore:
        landmarks = getattr(face, "kps", None)
        return self._quality.analyze(frame, face.bbox, landmarks)

    def _normalize_embedding(self, face) -> np.ndarray | None:
        if face is None or face.embedding is None:
            return None
        vec = np.array(face.embedding, dtype=np.float32)
        return vec / (np.linalg.norm(vec) + 1e-8)

    def _embedding_from_frame(
        self, frame: np.ndarray, min_quality: float = 0.0
    ) -> tuple[np.ndarray | None, FaceQualityScore | None]:
        face = self._best_face(frame)
        if face is None:
            return None, None
        quality = self._face_quality(frame, face)
        if quality.overall < min_quality:
            return None, quality
        emb = self._normalize_embedding(face)
        return emb, quality

    def embedding_from_jpeg(
        self, jpeg_bytes: bytes, min_quality: float = 0.35
    ) -> tuple[list | None, float | None]:
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None, None
        emb, quality = self._embedding_from_frame(frame, min_quality=min_quality)
        if emb is None:
            score = quality.overall if quality else None
            return None, score
        return emb.tolist(), quality.overall

    def capture_embedding_from_stream(
        self,
        stream: CameraStream,
        samples: int = 5,
        min_quality: float = 0.45,
    ) -> list | None:
        collected: list[tuple[np.ndarray, float]] = []
        max_attempts = samples * 30 if stream.config.uses_network_stream else samples * 20

        for _ in range(max_attempts):
            ok, frame = stream.read()
            if not ok or frame is None:
                continue
            emb, quality = self._embedding_from_frame(frame, min_quality=min_quality)
            if emb is not None and quality is not None:
                collected.append((emb, quality.overall))
            if len(collected) >= samples * 2:
                break

        if len(collected) < 2:
            return None

        collected.sort(key=lambda item: item[1], reverse=True)
        top = collected[: max(samples, 3)]
        mean = np.mean([item[0] for item in top], axis=0)
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

    def _unknown_payload(
        self, frame: np.ndarray, emb: np.ndarray, quality: float, face=None
    ) -> dict:
        if face is None:
            face = self._best_face(frame)
        snapshot_b64 = self._face_jpeg_b64(frame, face) if face is not None else None
        payload: dict = {"embedding": emb.tolist(), "quality": quality}
        if snapshot_b64:
            payload["snapshot_b64"] = snapshot_b64
        return payload

    def _build_annotations_from_faces(
        self,
        frame: np.ndarray,
        faces,
        threshold: float,
        min_face_quality: float,
    ) -> list[FaceAnnotation]:
        if not faces:
            return []

        fh, fw = frame.shape[:2]
        annotations: list[FaceAnnotation] = []

        for face in faces:
            quality = self._face_quality(frame, face)
            if quality.overall < min_face_quality:
                continue

            emb = self._normalize_embedding(face)
            if emb is None:
                continue

            x1, y1, x2, y2 = map(float, face.bbox[:4])
            bbox_norm = (x1 / fw, y1 / fh, x2 / fw, y2 / fh)

            best_score = -1.0
            best_name = ""
            if self._cache:
                if self._cache_matrix is None or len(self._cache_pids) != len(self._cache):
                    self._rebuild_cache_matrix()
                assert self._cache_matrix is not None
                scores = self._cache_matrix @ emb
                best_idx = int(np.argmax(scores))
                best_score = float(scores[best_idx])
                best_name = self._cache[self._cache_pids[best_idx]]["name"]

            if self._cache and best_score >= threshold:
                annotations.append(
                    FaceAnnotation(
                        bbox_norm=bbox_norm,
                        label=best_name,
                        sublabel=f"✓ {best_score:.0%}",
                        color=COLOR_RECOGNIZED,
                    )
                )
            elif self._cache:
                annotations.append(
                    FaceAnnotation(
                        bbox_norm=bbox_norm,
                        label="Khách lạ",
                        sublabel=f"? {max(0, best_score):.0%}",
                        color=COLOR_UNKNOWN,
                    )
                )
            else:
                annotations.append(
                    FaceAnnotation(
                        bbox_norm=bbox_norm,
                        label="Chưa đăng ký",
                        sublabel="",
                        color=COLOR_SCANNING,
                    )
                )

        return annotations

    def recognize_from_frame(
        self, frame: np.ndarray, threshold: float, min_face_quality: float = 0.35
    ) -> tuple[int, str, float] | None:
        faces = self._faces(frame)
        self.last_annotations = self._build_annotations_from_faces(
            frame, faces, threshold, min_face_quality
        )
        face = max(faces, key=lambda f: float(getattr(f, "det_score", 0))) if faces else None
        if face is None:
            self.last_unknown = None
            self.last_match = None
            self._reset_liveness()
            return None

        quality = self._face_quality(frame, face)
        if quality.overall < min_face_quality:
            self.last_unknown = None
            self.last_match = None
            self._reset_liveness()
            return None

        emb = self._normalize_embedding(face)
        if emb is None:
            self.last_unknown = None
            self.last_match = None
            self._reset_liveness()
            return None

        if not self._cache:
            self.last_match = None
            self.last_unknown = self._unknown_payload(frame, emb, quality.overall, face)
            self._reset_liveness()
            return None

        best_pid = None
        best_name = ""
        best_score = -1.0

        if self._cache:
            best_pid, best_name, best_score = self._best_match(emb)

        snapshot_b64 = self._face_jpeg_b64(frame, face)

        if best_pid is not None and best_score >= threshold:
            if self.liveness_enabled and not self._check_liveness(best_pid, frame, face):
                self.last_unknown = None
                self.last_match = None
                return None

            self.last_unknown = None
            self.last_liveness_warning = None
            self.last_match = {
                "patient_id": best_pid,
                "name": best_name,
                "score": best_score,
                "embedding": emb.tolist(),
                "face_quality": quality.overall,
                "snapshot_b64": snapshot_b64,
            }
            return best_pid, best_name, best_score

        self.last_match = None
        self.last_unknown = self._unknown_payload(frame, emb, max(0, best_score), face)
        self._reset_liveness()
        return None

    def _reset_liveness(self) -> None:
        self._liveness_pid = None
        self._liveness.reset()

    def _check_liveness(self, patient_id: int, frame: np.ndarray, face) -> bool:
        """Kiểm tra liveness tối thiểu (chuyển động + moiré) cho danh tính đang xác nhận.
        Đặt `self.last_liveness_warning` khi từ chối để hiển thị log/debug cho lễ tân."""
        if self._liveness_pid != patient_id:
            self._liveness_pid = patient_id
            self._liveness.reset()

        landmarks = getattr(face, "kps", None)
        result = self._liveness.check(frame, face.bbox, landmarks)
        if not result.passed:
            self.last_liveness_warning = result.reason
            return False
        return True

    def build_annotations(
        self,
        frame: np.ndarray,
        threshold: float,
        min_face_quality: float = 0.35,
    ) -> list[FaceAnnotation]:
        """Tạo khung + nhãn cho mọi khuôn mặt trong khung hình."""
        return self._build_annotations_from_faces(
            frame, self._faces(frame), threshold, min_face_quality
        )

    def recognize_from_stream(
        self, stream: CameraStream, threshold: float, min_face_quality: float = 0.35
    ) -> tuple[int, str, float] | None:
        ok, frame = stream.read()
        if not ok or frame is None:
            return None
        return self.recognize_from_frame(frame, threshold, min_face_quality)
