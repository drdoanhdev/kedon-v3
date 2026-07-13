'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Camera, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import {
  analyzeFaceGuide,
  sampleFaceBrightness,
  type FaceBounds,
  type FaceGuideResult,
} from '../lib/faceEnrollGuidance';

type FaceDetectorLike = {
  detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<
    Array<{ boundingBox: DOMRectReadOnly }>
  >;
};

const READY_HOLD_MS = 1500;
const READY_SCORE_THRESHOLD = 88;
const AGENT_SNAPSHOT_INTERVAL_MS_DEFAULT = 130;

type EnrollPose = 'front' | 'left' | 'right';

const POSE_STEPS: { id: EnrollPose; label: string; hint: string }[] = [
  { id: 'front', label: 'Chính diện', hint: 'Nhìn thẳng vào camera, mặt nằm trong oval' },
  { id: 'left', label: 'Nghiêng trái nhẹ', hint: 'Quay mặt nhẹ sang trái (~15°), vẫn nhìn camera' },
  { id: 'right', label: 'Nghiêng phải nhẹ', hint: 'Quay mặt nhẹ sang phải (~15°), vẫn nhìn camera' },
];

interface FaceEnrollCameraProps {
  patientId: number | null;
  onEnrolled?: () => void;
  /** Chỉ xem camera + hướng dẫn, không lưu embedding */
  previewOnly?: boolean;
  /** Xem camera IP/RTSP qua agent (vd http://127.0.0.1:8766) */
  agentPreviewBase?: string;
  /** Bật chụp 3 góc (mặc định true khi đăng ký thật) */
  multiAngle?: boolean;
}

function domRectToBounds(rect: DOMRectReadOnly): FaceBounds {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function FaceEnrollCamera({
  patientId,
  onEnrolled,
  previewOnly = false,
  agentPreviewBase,
  multiAngle = true,
}: FaceEnrollCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const agentImgRef = useRef<HTMLImageElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const readySinceRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const patientIdRef = useRef(patientId);
  const previewOnlyRef = useRef(previewOnly);
  const agentPreviewBaseRef = useRef(agentPreviewBase);
  const poseIndexRef = useRef(0);
  const capturedRef = useRef<string[]>([]);
  const capturePoseRef = useRef<() => Promise<void>>(async () => {});

  patientIdRef.current = patientId;
  previewOnlyRef.current = previewOnly;
  agentPreviewBaseRef.current = agentPreviewBase;

  const useMulti = multiAngle && !previewOnly;
  const totalPoses = useMulti ? POSE_STEPS.length : 1;

  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [guide, setGuide] = useState<FaceGuideResult | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [detectorLabel, setDetectorLabel] = useState('');
  const [faceDetectorAvailable, setFaceDetectorAvailable] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [capturedCount, setCapturedCount] = useState(0);
  const [done, setDone] = useState(false);

  poseIndexRef.current = poseIndex;

  const currentPose = POSE_STEPS[Math.min(poseIndex, POSE_STEPS.length - 1)];

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    readySinceRef.current = null;
    setHoldProgress(0);
  }, []);

  const captureFrameBase64 = useCallback(async (): Promise<string | null> => {
    const base = agentPreviewBaseRef.current?.replace(/\/$/, '');
    if (base) {
      try {
        const res = await fetch(`${base}/snapshot?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Agent chưa có khung hình');
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1] || null);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    }

    const video = videoRef.current;
    if (!video || video.videoWidth <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    return dataUrl.split(',')[1] || null;
  }, []);

  const finalizeEnrollment = useCallback(
    async (images: string[]) => {
      if (!patientIdRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        await axios.post('/api/face-embeddings/from-image', {
          patient_id: patientIdRef.current,
          images_base64: images,
        });
        toast.success(
          images.length > 1
            ? `Đã đăng ký ${images.length} góc khuôn mặt cho BN #${patientIdRef.current}`
            : `Đã đăng ký khuôn mặt cho BN #${patientIdRef.current}`
        );
        setDone(true);
        onEnrolled?.();
        readySinceRef.current = null;
        setHoldProgress(0);
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
        toast.error(typeof msg === 'string' ? msg : 'Lỗi lưu khuôn mặt');
        // Cho phép thử lại góc hiện tại
        capturedRef.current = capturedRef.current.slice(0, poseIndexRef.current);
        setCapturedCount(capturedRef.current.length);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [onEnrolled]
  );

  const capturePose = useCallback(async () => {
    if (previewOnlyRef.current || !patientIdRef.current || savingRef.current || done) return;

    const imageBase64 = await captureFrameBase64();
    if (!imageBase64) {
      toast.error(
        agentPreviewBaseRef.current
          ? 'Không lấy được ảnh từ agent. Chạy chay-agent.bat hoặc python main.py run.'
          : 'Không chụp được khung hình'
      );
      return;
    }

    const nextCaptured = [...capturedRef.current, imageBase64];
    capturedRef.current = nextCaptured;
    setCapturedCount(nextCaptured.length);
    readySinceRef.current = null;
    setHoldProgress(0);

    if (nextCaptured.length >= totalPoses) {
      await finalizeEnrollment(nextCaptured);
      return;
    }

    const nextIdx = nextCaptured.length;
    setPoseIndex(nextIdx);
    toast.success(`Đã chụp góc ${nextIdx}/${totalPoses} — tiếp theo: ${POSE_STEPS[nextIdx].label}`);
  }, [captureFrameBase64, done, finalizeEnrollment, totalPoses]);

  capturePoseRef.current = capturePose;

  const getProcessCanvas = useCallback(() => {
    if (!processCanvasRef.current) {
      processCanvasRef.current = document.createElement('canvas');
    }
    return processCanvasRef.current;
  }, []);

  const processFaceFrame = useCallback(
    async (
      source: HTMLVideoElement | HTMLImageElement,
      overlay: HTMLCanvasElement | null,
      getSize: () => { w: number; h: number },
      mirrorOverlay = false
    ) => {
      if (done || savingRef.current) return false;

      const { w, h } = getSize();
      if (w <= 0 || h <= 0) return false;

      const canvas = getProcessCanvas();
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (overlay && (overlay.width !== w || overlay.height !== h)) {
        overlay.width = w;
        overlay.height = h;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(source, 0, 0, w, h);

      let face: FaceBounds | null = null;
      const detector = detectorRef.current;
      if (detector) {
        try {
          const faces = await detector.detect(canvas);
          if (faces.length > 0) {
            face = domRectToBounds(faces[0].boundingBox);
          }
        } catch {
          // Transient detection errors while frames update.
        }
      }

      let brightness: number | null = null;
      if (face) {
        brightness = sampleFaceBrightness(ctx, face, w, h);

        if (overlay) {
          const octx = overlay.getContext('2d');
          if (octx) {
            octx.clearRect(0, 0, w, h);
            octx.save();
            if (mirrorOverlay) {
              octx.translate(w, 0);
              octx.scale(-1, 1);
            }
            octx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
            octx.lineWidth = 2;
            octx.strokeRect(face.x, face.y, face.width, face.height);
            octx.restore();
          }
        }
      } else if (overlay) {
        const octx = overlay.getContext('2d');
        octx?.clearRect(0, 0, w, h);
      }

      const result = analyzeFaceGuide(face, w, h, brightness);
      setGuide(result);

      const isReady = result.score >= READY_SCORE_THRESHOLD && result.status === 'ready';
      const now = Date.now();

      if (
        isReady &&
        !previewOnlyRef.current &&
        patientIdRef.current &&
        !savingRef.current &&
        !manualOnly
      ) {
        if (readySinceRef.current == null) {
          readySinceRef.current = now;
        }
        const elapsed = now - readySinceRef.current;
        const progress = Math.min(100, Math.round((elapsed / READY_HOLD_MS) * 100));
        setHoldProgress(progress);
        if (elapsed >= READY_HOLD_MS) {
          readySinceRef.current = null;
          setHoldProgress(0);
          await capturePoseRef.current();
        }
      } else {
        readySinceRef.current = null;
        setHoldProgress(0);
      }

      return true;
    },
    [done, getProcessCanvas, manualOnly]
  );

  const tick = useCallback(async () => {
    const video = videoRef.current;
    const overlay = canvasRef.current;
    if (!video || !overlay || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => {
        void tick();
      });
      return;
    }

    await processFaceFrame(
      video,
      overlay,
      () => ({
        w: video.videoWidth,
        h: video.videoHeight,
      }),
      true
    );

    rafRef.current = requestAnimationFrame(() => {
      void tick();
    });
  }, [processFaceFrame]);

  const agentTick = useCallback(async () => {
    const img = agentImgRef.current;
    if (!img || !img.complete || img.naturalWidth <= 0) {
      rafRef.current = requestAnimationFrame(() => {
        void agentTick();
      });
      return;
    }

    await processFaceFrame(img, null, () => ({
      w: img.naturalWidth,
      h: img.naturalHeight,
    }));

    rafRef.current = requestAnimationFrame(() => {
      void agentTick();
    });
  }, [processFaceFrame]);

  useEffect(() => {
    const base = agentPreviewBase?.replace(/\/$/, '');

    if (base) {
      let active = true;
      let objectUrl: string | null = null;
      let failStreak = 0;

      setCameraError('');
      setManualOnly(false);
      stopCamera();
      setDetectorLabel('Camera IP (agent)');
      setCameraReady(false);
      setGuide({
        status: 'no_face',
        message: 'Đang kết nối preview agent...',
        score: 0,
        hints: [
          'Khung hình từ RTSP/USB do agent đọc — không phải webcam trình duyệt',
          'Nếu màn hình đen: chạy chay-agent.bat hoặc python main.py run',
        ],
        checks: [],
      });

      const FaceDetectorCtor = (
        window as unknown as { FaceDetector?: new (opts?: object) => FaceDetectorLike }
      ).FaceDetector;

      if (FaceDetectorCtor) {
        detectorRef.current = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
        setFaceDetectorAvailable(true);
        setManualOnly(false);
        setDetectorLabel('Camera IP (agent) · FaceDetector');
      } else {
        detectorRef.current = null;
        setFaceDetectorAvailable(false);
        setManualOnly(true);
        setDetectorLabel('Camera IP (agent) · chụp thủ công');
        setGuide({
          status: 'no_face',
          message: 'Trình duyệt không hỗ trợ hướng dẫn tự động — chụp thủ công',
          score: 0,
          hints: [
            'Dùng Chrome/Edge để có oval + tự chụp, hoặc bấm «Chụp góc này» khi thấy mặt rõ',
            'Vẫn đăng ký được qua camera agent (không cần FaceDetector)',
          ],
          checks: [],
        });
      }

      let pollIntervalMs = AGENT_SNAPSHOT_INTERVAL_MS_DEFAULT;

      const poll = async () => {
        try {
          const healthRes = await fetch(`${base}/health`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(3000),
          });
          if (healthRes.ok) {
            const health = (await healthRes.json()) as { web_snapshot_interval_ms?: number };
            if (typeof health.web_snapshot_interval_ms === 'number' && health.web_snapshot_interval_ms > 0) {
              pollIntervalMs = health.web_snapshot_interval_ms;
            }
          }
        } catch {
          // Agent chưa sẵn sàng
        }

        while (active) {
          const started = performance.now();
          try {
            const res = await fetch(`${base}/snapshot?t=${Date.now()}`, {
              cache: 'no-store',
              signal: AbortSignal.timeout(4000),
            });
            if (!res.ok) throw new Error('snapshot failed');
            const blob = await res.blob();
            if (!active) break;

            const url = URL.createObjectURL(blob);
            const img = agentImgRef.current;
            if (img) {
              img.src = url;
            }
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = url;

            failStreak = 0;
            setCameraReady(true);
            setCameraError('');
            if (rafRef.current == null) {
              rafRef.current = requestAnimationFrame(() => {
                void agentTick();
              });
            }
          } catch {
            failStreak += 1;
            if (failStreak >= 8) {
              setCameraReady(false);
              setCameraError(
                'Không kết nối preview agent. Trên PC chạy chay-agent.bat (hoặc python main.py run)'
              );
            }
          }

          const elapsed = performance.now() - started;
          const wait = Math.max(0, pollIntervalMs - elapsed);
          await new Promise((r) => setTimeout(r, wait));
        }
      };

      void poll();

      return () => {
        active = false;
        stopCamera();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    let cancelled = false;
    const start = async () => {
      setCameraError('');
      setManualOnly(false);
      stopCamera();

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Trình duyệt không hỗ trợ webcam. Dùng Chrome/Edge hoặc đăng ký qua camera agent (tab Camera IP).'
          );
        }

        const FaceDetectorCtor = (
          window as unknown as { FaceDetector?: new (opts?: object) => FaceDetectorLike }
        ).FaceDetector;

        if (FaceDetectorCtor) {
          detectorRef.current = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
          setFaceDetectorAvailable(true);
          setManualOnly(false);
          setDetectorLabel('Webcam · FaceDetector');
        } else {
          // Fallback: vẫn mở webcam, chụp thủ công — không chặn hoàn toàn
          detectorRef.current = null;
          setFaceDetectorAvailable(false);
          setManualOnly(true);
          setDetectorLabel('Webcam · chụp thủ công');
          setGuide({
            status: 'no_face',
            message: 'Trình duyệt không hỗ trợ hướng dẫn tự động',
            score: 0,
            hints: [
              'Nên dùng Chrome hoặc Edge để tự căn oval và chụp',
              'Hoặc chuyển sang camera agent (IP/USB) nếu đã chạy chay-agent.bat',
              'Vẫn có thể bấm «Chụp góc này» khi mặt rõ trong khung',
            ],
            checks: [],
          });
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        setCameraReady(true);
        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Không mở được camera';
        setCameraError(message);
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stopCamera, agentPreviewBase, agentTick, tick]);

  const agentPreviewMode = Boolean(agentPreviewBase?.replace(/\/$/, ''));
  const canCapture =
    cameraReady &&
    Boolean(patientId) &&
    !saving &&
    !done &&
    (manualOnly || guide?.status === 'ready' || (agentPreviewMode && !faceDetectorAvailable));

  const statusColor =
    guide?.status === 'ready'
      ? 'text-green-700 bg-green-50 border-green-200'
      : guide?.status === 'no_face'
        ? 'text-gray-700 bg-gray-50 border-gray-200'
        : 'text-amber-800 bg-amber-50 border-amber-200';

  if (done) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto" />
        <p className="text-lg font-semibold text-green-900">Đăng ký khuôn mặt thành công</p>
        <p className="text-sm text-green-800">
          Đã lưu {capturedCount || totalPoses} góc. Bệnh nhân có thể check-in bằng camera cửa vào.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {useMulti && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              Góc {Math.min(poseIndex + 1, totalPoses)}/{totalPoses}:{' '}
              <strong>{currentPose.label}</strong>
            </span>
            <span>
              Đã chụp {capturedCount}/{totalPoses}
            </span>
          </div>
          <div className="flex gap-1.5">
            {POSE_STEPS.map((step, i) => (
              <div
                key={step.id}
                className={`h-1.5 flex-1 rounded-full ${
                  i < capturedCount
                    ? 'bg-green-500'
                    : i === poseIndex
                      ? 'bg-blue-500'
                      : 'bg-gray-200'
                }`}
                title={step.label}
              />
            ))}
          </div>
          <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-md px-2.5 py-1.5">
            {currentPose.hint}
          </p>
        </div>
      )}

      <div className="relative mx-auto max-w-md aspect-[3/4] bg-gray-900 rounded-xl overflow-hidden">
        {agentPreviewMode ? (
          <img
            ref={agentImgRef}
            alt="Camera preview"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
            />
          </>
        )}

        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className="w-[58%] h-[72%] rounded-[50%] border-2 border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={{ marginTop: '-4%' }}
          />
        </div>

        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 text-white text-sm gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Đang mở camera...
          </div>
        )}

        {holdProgress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40">
            <div
              className="h-full bg-green-500 transition-all duration-100"
              style={{ width: `${holdProgress}%` }}
            />
          </div>
        )}
      </div>

      {cameraError ? (
        <div className="flex gap-2 items-start text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p>{cameraError}</p>
            {!agentPreviewMode && (
              <p className="mt-1 text-xs opacity-90">
                Gợi ý: dùng Chrome/Edge, hoặc đăng ký qua camera agent (đã chạy chay-agent.bat).
              </p>
            )}
          </div>
        </div>
      ) : (
        guide && (
          <div className={`rounded-lg border p-3 text-sm ${statusColor}`}>
            <p className="font-medium">{guide.message}</p>
            {guide.hints.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs opacity-90 list-disc list-inside">
                {guide.hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
          </div>
        )
      )}

      {guide && guide.checks.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 text-xs">
          {guide.checks.map((c) => (
            <li
              key={c.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${
                c.ok
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}
            >
              {c.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 opacity-50" />
              )}
              {c.label}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {!previewOnly && (
          <Button type="button" disabled={!canCapture} onClick={() => void capturePose()}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Đang lưu...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 mr-1" />
                {useMulti
                  ? `Chụp góc này (${poseIndex + 1}/${totalPoses})`
                  : 'Chụp & lưu ngay'}
              </>
            )}
          </Button>
        )}
        {detectorLabel && cameraReady && (
          <span className="text-xs text-gray-400">Detector: {detectorLabel}</span>
        )}
      </div>

      {!previewOnly && !patientId && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Nhập ID bệnh nhân phía trên để bắt đầu đăng ký khuôn mặt.
        </p>
      )}

      {!previewOnly && patientId && !manualOnly && (
        <p className="text-xs text-gray-500">
          Khi đạt yêu cầu, hệ thống tự chụp sau ~1.5 giây giữ yên. Cần chạy{' '}
          <code className="bg-gray-100 px-1 rounded">chay-agent.bat</code> trên PC camera (đã gồm
          dịch vụ embedding).
        </p>
      )}

      {!previewOnly && patientId && manualOnly && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Chế độ chụp thủ công: căn mặt trong oval rồi bấm nút chụp từng góc.
        </p>
      )}
    </div>
  );
}

export default FaceEnrollCamera;
