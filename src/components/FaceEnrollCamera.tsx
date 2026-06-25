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
/** Poll snapshot từ agent — interval đồng bộ với agent /health */
const AGENT_SNAPSHOT_INTERVAL_MS_DEFAULT = 130;

interface FaceEnrollCameraProps {
  patientId: number | null;
  onEnrolled?: () => void;
  /** Chỉ xem camera + hướng dẫn, không lưu embedding */
  previewOnly?: boolean;
  /** Xem camera IP/RTSP qua agent (vd http://127.0.0.1:8766) — chạy python main.py run hoặc preview */
  agentPreviewBase?: string;
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
  const saveEnrollmentRef = useRef<() => Promise<void>>(async () => {});

  patientIdRef.current = patientId;
  previewOnlyRef.current = previewOnly;
  agentPreviewBaseRef.current = agentPreviewBase;

  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [guide, setGuide] = useState<FaceGuideResult | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [detectorLabel, setDetectorLabel] = useState('');
  const [faceDetectorAvailable, setFaceDetectorAvailable] = useState(false);

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

  const captureFrameBase64 = useCallback((): string | null => {
    const base = agentPreviewBaseRef.current?.replace(/\/$/, '');
    if (base) {
      return null;
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

  const saveEnrollment = useCallback(async () => {
    if (previewOnlyRef.current || !patientIdRef.current || savingRef.current) return;

    const base = agentPreviewBaseRef.current?.replace(/\/$/, '');
    let imageBase64 = captureFrameBase64();

    if (!imageBase64 && base) {
      try {
        const res = await fetch(`${base}/snapshot?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Agent chưa có khung hình');
        const blob = await res.blob();
        imageBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1] || null);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        toast.error('Không lấy được ảnh từ agent. Chạy python main.py run hoặc preview.');
        return;
      }
    }

    if (!imageBase64) {
      toast.error('Không chụp được khung hình');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      await axios.post('/api/face-embeddings/from-image', {
        patient_id: patientIdRef.current,
        image_base64: imageBase64,
      });
      toast.success(`Đã đăng ký khuôn mặt cho BN #${patientIdRef.current}`);
      onEnrolled?.();
      readySinceRef.current = null;
      setHoldProgress(0);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(typeof msg === 'string' ? msg : 'Lỗi lưu khuôn mặt');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [captureFrameBase64, onEnrolled]);

  saveEnrollmentRef.current = saveEnrollment;

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

      if (isReady && !previewOnlyRef.current && patientIdRef.current && !savingRef.current) {
        if (readySinceRef.current == null) {
          readySinceRef.current = now;
        }
        const elapsed = now - readySinceRef.current;
        const progress = Math.min(100, Math.round((elapsed / READY_HOLD_MS) * 100));
        setHoldProgress(progress);
        if (elapsed >= READY_HOLD_MS) {
          readySinceRef.current = null;
          setHoldProgress(0);
          await saveEnrollmentRef.current();
        }
      } else {
        readySinceRef.current = null;
        setHoldProgress(0);
      }

      return true;
    },
    [getProcessCanvas]
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

    await processFaceFrame(video, overlay, () => ({
      w: video.videoWidth,
      h: video.videoHeight,
    }), true);

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
        setDetectorLabel('Camera IP (agent) · FaceDetector');
      } else {
        detectorRef.current = null;
        setFaceDetectorAvailable(false);
        setDetectorLabel('Camera IP (agent)');
        setGuide({
          status: 'no_face',
          message: 'Preview agent — chụp thủ công khi đã chọn bệnh nhân',
          score: 0,
          hints: [
            'Trình duyệt không hỗ trợ hướng dẫn tự động — dùng Chrome/Edge để có oval + tự chụp',
            'Vẫn có thể bấm Chụp & lưu ngay khi thấy mặt trong khung',
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
          // Agent chưa sẵn sàng — dùng interval mặc định.
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
      stopCamera();

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Trình duyệt không hỗ trợ camera. Dùng Chrome hoặc Edge.');
        }

        const FaceDetectorCtor = (
          window as unknown as { FaceDetector?: new (opts?: object) => FaceDetectorLike }
        ).FaceDetector;

        if (FaceDetectorCtor) {
          detectorRef.current = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
          setFaceDetectorAvailable(true);
          setDetectorLabel('FaceDetector');
        } else {
          detectorRef.current = null;
          setFaceDetectorAvailable(false);
          setDetectorLabel('');
          setCameraError(
            'Trình duyệt chưa hỗ trợ nhận diện khuôn mặt tự động. Vui lòng dùng Chrome hoặc Edge mới nhất.'
          );
          return;
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
    (guide?.status === 'ready' || (agentPreviewMode && !faceDetectorAvailable));

  const statusColor =
    guide?.status === 'ready'
      ? 'text-green-700 bg-green-50 border-green-200'
      : guide?.status === 'no_face'
        ? 'text-gray-700 bg-gray-50 border-gray-200'
        : 'text-amber-800 bg-amber-50 border-amber-200';

  return (
    <div className="space-y-4">
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

        {/* Oval guide overlay */}
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
          <p>{cameraError}</p>
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

      {guide && (
        <ul className="grid grid-cols-2 gap-2 text-xs">
          {guide.checks.map((c) => (
            <li
              key={c.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${
                c.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}
            >
              {c.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5 opacity-50" />}
              {c.label}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {!previewOnly && (
          <Button
            type="button"
            disabled={!canCapture}
            onClick={() => void saveEnrollment()}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Đang lưu...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 mr-1" />
                Chụp & lưu ngay
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

      {!previewOnly && patientId && (
        <p className="text-xs text-gray-500">
          Khi đạt yêu cầu, hệ thống tự chụp sau ~1.5 giây giữ yên. Cần chạy{' '}
          <code className="bg-gray-100 px-1 rounded">chay-agent.bat</code> trên PC camera (đã gồm dịch vụ embedding).
        </p>
      )}
    </div>
  );
}

export default FaceEnrollCamera;
