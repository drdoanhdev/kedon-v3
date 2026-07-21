'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Circle,
  Download,
  RefreshCw,
  UserPlus,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { FeatureGate } from './FeatureGate';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FaceEnrollCamera } from './FaceEnrollCamera';
import { PatientSearchInput, type PatientSearchHit } from './PatientSearchInput';
import { useFaceRealtimeRefresh } from '@/hooks/useFaceRealtimeRefresh';
import { getAuthHeaders } from '@/lib/fetchWithAuth';

const AGENT_PREVIEW_STORAGE_KEY = 'optigo_face_agent_preview_base';
const DEFAULT_AGENT_PREVIEW = 'http://127.0.0.1:8766';
const POLL_MS = 30000;

interface FaceDevice {
  id: string;
  device_label: string;
  branch_id: string | null;
  status: string;
  last_seen_at: string | null;
  last_ip: string | null;
  agent_version: string | null;
  pairing_code: string | null;
  pairing_expires_at: string | null;
  created_at: string;
  settings?: {
    diagnostics?: { camera_status?: string; last_error?: string | null; reported_at?: string };
    pending_camera_url?: string;
    pending_camera_requested_at?: string;
    last_applied_camera_url?: string;
    last_applied_at?: string;
  } | null;
}

interface PendingFace {
  id: number;
  status: string;
  quality_score: number | null;
  detected_at: string;
  snapshot_url: string | null;
  snapshot_display_url?: string | null;
}

type WizardStep = 1 | 2 | 3 | 4;

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Chưa kết nối';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function deviceOnlineStatus(lastSeen: string | null): 'online' | 'idle' | 'offline' {
  if (!lastSeen) return 'offline';
  const diffMs = Date.now() - new Date(lastSeen).getTime();
  if (diffMs < 2 * 60 * 1000) return 'online';
  if (diffMs < 10 * 60 * 1000) return 'idle';
  return 'offline';
}

function DeviceStatusDot({ lastSeen }: { lastSeen: string | null }) {
  const status = deviceOnlineStatus(lastSeen);
  const colors = {
    online: 'bg-green-500',
    idle: 'bg-amber-400',
    offline: 'bg-gray-300',
  };
  const labels = {
    online: 'Online',
    idle: 'Idle',
    offline: 'Offline',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
      {labels[status]}
    </span>
  );
}

function WizardProgress({ step, hasActiveDevice }: { step: WizardStep; hasActiveDevice: boolean }) {
  const steps = [
    { n: 1, label: 'Tải agent' },
    { n: 2, label: 'Ghép nối' },
    { n: 3, label: 'Test camera' },
    { n: 4, label: 'Đăng ký BN' },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {steps.map((s, idx) => {
        const done = s.n < step || (s.n === 2 && hasActiveDevice);
        const active = s.n === step;
        return (
          <div key={s.n} className="flex items-center gap-1.5">
            {idx > 0 && <span className="text-gray-300 hidden sm:inline">→</span>}
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                active
                  ? 'bg-blue-50 border-blue-300 text-blue-800'
                  : done
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              {done && !active ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <Circle className="w-3.5 h-3.5" />
              )}
              {s.n}. {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FaceRecognitionSection({
  hidePendingFaces = false,
  setupOnly = false,
}: {
  hidePendingFaces?: boolean;
  setupOnly?: boolean;
}) {
  const [devices, setDevices] = useState<FaceDevice[]>([]);
  const [pendingFaces, setPendingFaces] = useState<PendingFace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('Camera cửa vào');
  const [latestPairing, setLatestPairing] = useState<{ code: string; expires: string } | null>(null);
  const [assignPatients, setAssignPatients] = useState<Record<number, PatientSearchHit | null>>({});
  const [enrollPatient, setEnrollPatient] = useState<PatientSearchHit | null>(null);
  const [cameraTab, setCameraTab] = useState<'enroll' | 'test'>('enroll');
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [agentPreviewBase, setAgentPreviewBase] = useState(DEFAULT_AGENT_PREVIEW);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingCameraId, setEditingCameraId] = useState<string | null>(null);
  const [cameraUrlInput, setCameraUrlInput] = useState('');
  const [savingCameraUrl, setSavingCameraUrl] = useState(false);
  const [isLocalDev, setIsLocalDev] = useState(false);
  const [openingKioskId, setOpeningKioskId] = useState<string | null>(null);
  const [downloadingAgent, setDownloadingAgent] = useState(false);
  const pendingIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(AGENT_PREVIEW_STORAGE_KEY);
    if (saved) setAgentPreviewBase(saved);
    const host = window.location.hostname;
    setIsLocalDev(host === 'localhost' || host === '127.0.0.1');
  }, []);

  const downloadFaceAgent = async () => {
    setDownloadingAgent(true);
    try {
      const headers = await getAuthHeaders();
      delete headers['Content-Type'];
      const res = await fetch('/api/face-devices/download-agent', { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Không tải được gói agent');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'OptigoFaceAgent.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setWizardStep(2);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tải agent');
    } finally {
      setDownloadingAgent(false);
    }
  };

  const saveAgentPreviewBase = (value: string) => {
    const trimmed = value.trim() || DEFAULT_AGENT_PREVIEW;
    setAgentPreviewBase(trimmed);
    localStorage.setItem(AGENT_PREVIEW_STORAGE_KEY, trimmed);
  };

  const activeDevices = devices.filter((d) => d.status === 'active');
  const hasActiveDevice = activeDevices.length > 0;
  const anyDeviceOnline = activeDevices.some(
    (d) => deviceOnlineStatus(d.last_seen_at) === 'online'
  );

  const fetchAll = useCallback(async () => {
    try {
      const [devRes, pendingRes] = await Promise.all([
        axios.get('/api/face-devices'),
        axios.get('/api/pending-faces?status=pending'),
      ]);
      const nextDevices: FaceDevice[] = devRes.data?.data || [];
      const nextPending: PendingFace[] = pendingRes.data?.data || [];

      setDevices(nextDevices);
      setPendingFaces(nextPending);

      if (pendingIdsRef.current.size > 0) {
        const newOnes = nextPending.filter((p) => !pendingIdsRef.current.has(p.id));
        if (newOnes.length > 0) {
          toast(`🆕 ${newOnes.length} khuôn mặt lạ cần xử lý`, { duration: 5000 });
        }
      }
      pendingIdsRef.current = new Set(nextPending.map((p) => p.id));

      if (nextDevices.some((d) => d.status === 'active')) {
        setWizardStep((s) => (s < 3 ? 3 : s));
      }
      if (nextDevices.some((d) => d.status === 'pending_pair')) {
        setWizardStep(2);
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime PendingFaces + polling fallback (devices vẫn poll qua cùng fetchAll)
  useFaceRealtimeRefresh({
    onRefresh: fetchAll,
    tables: ['PendingFaces'],
    fallbackPollMs: POLL_MS,
  });

  const createDevice = async () => {
    setCreating(true);
    try {
      const { data } = await axios.post('/api/face-devices', {
        device_label: newLabel.trim() || 'Camera cửa vào',
      });
      if (data?.data?.pairing_code) {
        setLatestPairing({
          code: data.data.pairing_code,
          expires: data.data.pairing_expires_at,
        });
        setWizardStep(2);
      }
      toast.success('Đã tạo mã ghép nối');
      await fetchAll();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(msg || 'Không tạo được thiết bị');
    } finally {
      setCreating(false);
    }
  };

  const revokeDevice = async (id: string) => {
    if (!confirm('Thu hồi thiết bị này? PC camera sẽ không check-in được nữa.')) return;
    try {
      await axios.delete(`/api/face-devices/${id}`);
      toast.success('Đã thu hồi thiết bị');
      await fetchAll();
    } catch {
      toast.error('Lỗi thu hồi thiết bị');
    }
  };

  const pushCameraUrl = async (id: string) => {
    const trimmed = cameraUrlInput.trim();
    if (!trimmed) {
      toast.error('Nhập URL RTSP mới');
      return;
    }
    if (!trimmed.toLowerCase().startsWith('rtsp://')) {
      toast.error('URL phải bắt đầu bằng rtsp://');
      return;
    }
    setSavingCameraUrl(true);
    try {
      await axios.patch(`/api/face-devices/${id}`, { pending_camera_url: trimmed });
      toast.success('Đã gửi — PC sẽ tự đổi camera trong vài phút tới');
      setEditingCameraId(null);
      setCameraUrlInput('');
      await fetchAll();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(msg || 'Lỗi gửi cấu hình camera');
    } finally {
      setSavingCameraUrl(false);
    }
  };

  const openKiosk = async (id: string) => {
    setOpeningKioskId(id);
    try {
      const { data } = await axios.post(`/api/face-devices/${id}?action=kiosk-token`, {});
      const path = data?.data?.kiosk_path as string | undefined;
      if (!path) throw new Error('missing path');
      window.open(path, '_blank', 'noopener,noreferrer');
      toast.success('Đã mở màn hình kiosk — gắn tablet/TV cạnh camera');
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(msg || 'Không mở được kiosk');
    } finally {
      setOpeningKioskId(null);
    }
  };

  const assignPending = async (pendingId: number) => {
    const patient = assignPatients[pendingId];
    if (!patient) {
      toast.error('Chọn bệnh nhân để gán');
      return;
    }
    try {
      await axios.post(`/api/pending-faces/${pendingId}/assign`, {
        patient_id: patient.id,
      });
      toast.success(`Đã gán khuôn mặt cho ${patient.ten}`);
      setAssignPatients((prev) => ({ ...prev, [pendingId]: null }));
      await fetchAll();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(msg || 'Lỗi gán khuôn mặt');
    }
  };

  const rejectPending = async (pendingId: number) => {
    try {
      await axios.post(`/api/pending-faces/${pendingId}/reject`, { reason: 'manual' });
      toast.success('Đã bỏ qua');
      await fetchAll();
    } catch {
      toast.error('Lỗi từ chối');
    }
  };

  return (
    <FeatureGate feature="face_recognition" permission="manage_clinic">
      <div className="space-y-4">
        {/* Wizard header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Thiết lập nhận diện khuôn mặt</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Khách quen vào cửa → tự thêm vào danh sách chờ khám
              </p>
            </div>
            <div className="flex items-center gap-2">
              {anyDeviceOnline ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded-full">
                  <Wifi className="w-3.5 h-3.5" /> Camera hoạt động
                </span>
              ) : hasActiveDevice ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                  <WifiOff className="w-3.5 h-3.5" /> Chưa thấy agent online
                </span>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => void fetchAll()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Làm mới
              </Button>
            </div>
          </div>
          <WizardProgress step={wizardStep} hasActiveDevice={hasActiveDevice} />

          <details className="mt-4 rounded-lg border border-blue-200/80 bg-white/70 text-sm">
            <summary className="cursor-pointer px-3 py-2 font-medium text-gray-800">
              Quy trình hoạt động — đọc trước khi bắt đầu
            </summary>
            <div className="px-3 pb-3 text-gray-600 space-y-3 border-t border-blue-100 pt-2">
              <div>
                <p className="font-medium text-gray-800 mb-1">Thiết lập một lần (trên PC gắn camera)</p>
                <ol className="list-decimal list-inside space-y-0.5 text-xs sm:text-sm">
                  <li>Tải zip → giải nén → double-click <strong>optigo-setup.bat</strong> (không cần PowerShell)</li>
                  <li>
                    Wizard tự làm hết: cài thư viện → hỏi mã ghép nối (tạo ở bước 2 bên dưới) → tự dò
                    camera trong mạng LAN → kiểm tra → hỏi có tự khởi động cùng Windows không → chạy nhận diện
                  </li>
                  <li>Đăng ký khuôn mặt bệnh nhân lần đầu (bước 4 bên dưới hoặc <strong>dang-ky-khuon-mat.bat</strong>)</li>
                </ol>
              </div>
              <div>
                <p className="font-medium text-gray-800 mb-1">Hàng ngày</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs sm:text-sm">
                  <li>Bật <strong>chay-agent.bat</strong> → khách quen tự vào <strong>Chờ khám</strong></li>
                  <li>Khách lạ xuất hiện ở mục <strong>Khách chưa nhận diện</strong> → lễ tân gán bệnh nhân</li>
                </ul>
              </div>
              {isLocalDev && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                  <p className="font-medium">Đang thử trên localhost</p>
                  <p className="mt-1">
                    Khi ghép nối, nhập URL <strong>http://localhost:3000</strong> (không dùng app.optigo.vn).
                    Chạy <code className="bg-amber-100 px-1 rounded">npm run dev</code> và{' '}
                    <code className="bg-amber-100 px-1 rounded">chay-agent.bat</code> trên cùng máy.
                    Sau đăng ký khuôn mặt, agent đồng bộ lại trong tối đa 5 phút.
                  </p>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Step 1: Download */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
            <span className="text-base">1️⃣</span>
            <h3 className="text-sm font-semibold text-gray-800">Cài agent trên PC camera</h3>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-600">
              Tải gói cài đặt, giải nén và chạy <strong>optigo-setup.bat</strong> — một wizard duy nhất,
              chỉ cần double-click, không cần mở PowerShell hay gõ lệnh Python.
            </p>
            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
              <li><strong>optigo-setup.bat</strong> — cài đặt + ghép nối + dò camera + chạy, tất cả trong một lần (~5–15 phút)</li>
              <li><strong>dang-ky-khuon-mat.bat</strong> — đăng ký khuôn mặt BN (thay cho bước 4 trên web)</li>
            </ul>
            <p className="text-xs text-gray-400">
              Cần sửa từng bước riêng (đổi camera, ghép nối lại...)? Vẫn còn{' '}
              <code className="bg-gray-100 px-1 rounded">cai-dat.bat</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">ghep-noi.bat</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">cau-hinh-camera.bat</code> và{' '}
              <code className="bg-gray-100 px-1 rounded">chay-agent.bat</code> trong gói.
            </p>
            <Button onClick={() => void downloadFaceAgent()} disabled={downloadingAgent}>
              <Download className="w-4 h-4 mr-1" />
              {downloadingAgent ? 'Đang tải...' : 'Tải OptigoFaceAgent.zip'}
            </Button>
          </div>
        </div>

        {/* Step 2: Pair device */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
            <span className="text-base">2️⃣</span>
            <h3 className="text-sm font-semibold text-gray-800">Ghép nối PC với phòng khám</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-gray-500 block mb-1">Tên thiết bị</label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Camera cửa vào"
                />
              </div>
              <Button onClick={createDevice} disabled={creating}>
                {creating ? 'Đang tạo...' : 'Tạo mã ghép nối'}
              </Button>
            </div>

            {latestPairing && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-1">Mã ghép nối (15 phút)</p>
                <p className="text-3xl font-mono font-bold tracking-widest text-blue-700">{latestPairing.code}</p>
                <p className="text-sm text-blue-800 mt-3">
                  Trên PC camera: chạy <strong>ghep-noi.bat</strong> và nhập mã trên
                  {isLocalDev ? (
                    <>
                      {' '}
                      — URL: <strong>http://localhost:3000</strong>
                    </>
                  ) : null}
                </p>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-gray-400">Đang tải...</p>
            ) : devices.length === 0 ? (
              <p className="text-sm text-gray-400">Chưa có thiết bị. Tạo mã ghép nối ở trên.</p>
            ) : (
              <ul className="divide-y border rounded-lg">
                {devices.map((d) => (
                  <li key={d.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{d.device_label}</p>
                        <p className="text-xs text-gray-500 flex flex-wrap items-center gap-2">
                          {d.status === 'pending_pair' ? (
                            <>Chờ ghép — mã: <strong>{d.pairing_code}</strong></>
                          ) : (
                            <>
                              <DeviceStatusDot lastSeen={d.last_seen_at} />
                              <span>{formatRelativeTime(d.last_seen_at)}</span>
                              {d.agent_version ? <span>· v{d.agent_version}</span> : null}
                            </>
                          )}
                        </p>
                        {d.settings?.diagnostics?.camera_status === 'error' &&
                        d.settings.diagnostics.last_error ? (
                          <p className="text-xs text-red-600 mt-1">
                            ⚠️ Camera lỗi: {d.settings.diagnostics.last_error}
                          </p>
                        ) : null}
                        {d.settings?.pending_camera_url ? (
                          <p className="text-xs text-amber-600 mt-1">
                            ⏳ Đang chờ PC áp dụng URL camera mới...
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {d.status === 'active' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={openingKioskId === d.id}
                              onClick={() => void openKiosk(d.id)}
                            >
                              {openingKioskId === d.id ? 'Đang mở...' : 'Màn hình kiosk'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setEditingCameraId((cur) => (cur === d.id ? null : d.id))
                              }
                            >
                              Đổi camera từ xa
                            </Button>
                          </>
                        )}
                        <Button variant="outline" size="sm" onClick={() => revokeDevice(d.id)}>
                          Thu hồi
                        </Button>
                      </div>
                    </div>

                    {editingCameraId === d.id && (
                      <div className="mt-3 bg-gray-50 border rounded-lg p-3 space-y-2">
                        <p className="text-xs text-gray-600">
                          Dán URL RTSP mới (vd sau khi camera đổi IP qua DHCP). PC sẽ tự áp dụng ở
                          lần đồng bộ tiếp theo (vài phút) — không cần chạm vào PC camera.
                        </p>
                        <Input
                          value={cameraUrlInput}
                          onChange={(e) => setCameraUrlInput(e.target.value)}
                          placeholder="rtsp://admin:matkhau@192.168.1.100:554/cam/realmonitor?channel=1&subtype=1"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => pushCameraUrl(d.id)} disabled={savingCameraUrl}>
                            {savingCameraUrl ? 'Đang gửi...' : 'Gửi cho PC'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingCameraId(null);
                              setCameraUrlInput('');
                            }}
                          >
                            Hủy
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {hasActiveDevice && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                ✅ Đã ghép nối. Chạy <strong>chay-agent.bat</strong> trên PC để bắt đầu nhận diện.
              </p>
            )}
          </div>
        </div>

        {/* Pending faces — reception workflow */}
        {!hidePendingFaces && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
            <span className="text-base">🆕</span>
            <h3 className="text-sm font-semibold text-gray-800">Khách chưa nhận diện — cần xử lý</h3>
            <span className="ml-auto text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              {pendingFaces.length} chờ
            </span>
          </div>
          <div className="p-5">
            {pendingFaces.length === 0 ? (
              <p className="text-sm text-gray-400">Không có khuôn mặt lạ — mọi thứ ổn 👍</p>
            ) : (
              <ul className="space-y-3">
                {pendingFaces.map((p) => (
                  <li key={p.id} className="border rounded-lg p-3 flex flex-wrap gap-3 items-center">
                    <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0 border">
                      {p.snapshot_display_url ? (
                        <img
                          src={p.snapshot_display_url}
                          alt="Khuôn mặt"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">
                          👤
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-sm font-medium">Khách lạ #{p.id}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(p.detected_at).toLocaleString('vi-VN')}
                        {p.quality_score != null
                          ? ` · Độ tin ${Math.round(p.quality_score * 100)}%`
                          : ''}
                      </p>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <PatientSearchInput
                        selected={assignPatients[p.id] || null}
                        onSelect={(patient) =>
                          setAssignPatients((prev) => ({ ...prev, [p.id]: patient }))
                        }
                        placeholder="Tìm BN để gán..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => assignPending(p.id)}>
                        <UserPlus className="w-3.5 h-3.5 mr-1" /> Gán
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => rejectPending(p.id)}>
                        Bỏ qua
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        )}

        {/* Step 3 & 4: Camera */}
        {!setupOnly && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-2">
            <span className="text-base">3️⃣</span>
            <h3 className="text-sm font-semibold text-gray-800">Camera & đăng ký khuôn mặt</h3>
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant={cameraTab === 'enroll' ? 'default' : 'outline'}
                onClick={() => {
                  setCameraTab('enroll');
                  setWizardStep(4);
                }}
              >
                Đăng ký BN
              </Button>
              <Button
                size="sm"
                variant={cameraTab === 'test' ? 'default' : 'outline'}
                onClick={() => {
                  setCameraTab('test');
                  setWizardStep(3);
                }}
              >
                Kiểm tra camera
              </Button>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600">
              Xem camera qua agent trên PC. Chạy <strong>chay-agent.bat</strong> — đã bao gồm preview và
              dịch vụ đăng ký, không cần lệnh riêng.
            </p>

            <div className="max-w-md">
              <label className="text-xs text-gray-500 block mb-1">Địa chỉ preview agent</label>
              <Input
                value={agentPreviewBase}
                onChange={(e) => saveAgentPreviewBase(e.target.value)}
                placeholder="http://127.0.0.1:8766"
              />
              <p className="text-xs text-gray-400 mt-1">
                Mặc định localhost. Nếu mở web từ máy khác, nhập IP PC camera (vd http://192.168.1.50:8766).
              </p>
            </div>

            {cameraTab === 'enroll' && (
              <div className="max-w-md">
                <label className="text-xs text-gray-500 block mb-1">Chọn bệnh nhân</label>
                <PatientSearchInput
                  selected={enrollPatient}
                  onSelect={setEnrollPatient}
                  placeholder="Tìm tên hoặc SĐT..."
                />
              </div>
            )}

            <FaceEnrollCamera
              key={`${cameraTab}-${agentPreviewBase}`}
              previewOnly={cameraTab === 'test'}
              agentPreviewBase={agentPreviewBase}
              patientId={cameraTab === 'enroll' && enrollPatient ? enrollPatient.id : null}
              onEnrolled={() => {
                toast.success(`Đã đăng ký khuôn mặt cho ${enrollPatient?.ten || 'BN'}`);
                toast(
                  'Agent sẽ nhận diện sau khi đồng bộ (tối đa 5 phút). Có thể khởi động lại chay-agent.bat để đồng bộ ngay.',
                  { duration: 8000, icon: 'ℹ️' }
                );
              }}
            />
          </div>
        </div>
        )}

        {/* Advanced */}
        <div className="border rounded-lg">
          <button
            type="button"
            className="w-full px-4 py-2.5 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 flex justify-between"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            Hướng dẫn kỹ thuật (nâng cao)
            <span>{showAdvanced ? '▲' : '▼'}</span>
          </button>
          {showAdvanced && (
            <div className="px-4 pb-4 text-xs text-gray-600 space-y-2 border-t bg-gray-50">
              <p>
                Cách nhanh nhất: double-click <code>optigo-setup.bat</code> — làm hết các bước dưới
                trong một wizard.
              </p>
              <p>1. Tải zip → giải nén → <code>cai-dat.bat</code></p>
              <p>2. Tạo mã ghép nối → <code>ghep-noi.bat</code></p>
              <p>3. <code>chay-agent.bat</code> — nhận diện + preview (8766) + embedding (8765)</p>
              <p>
                Camera IP (RTSP): double-click <code>cau-hinh-camera.bat</code> trên PC camera → chọn
                <strong> Tự động dò camera trong mạng LAN</strong> (không cần biết IP), hoặc chọn hãng
                (Hikvision/Dahua/Reolink) / dán URL RTSP thủ công. Không cần sửa code hay file thủ công.
                Camera lỗi? Chạy <code>python main.py doctor</code> để biết nguyên nhân chính xác.
              </p>
              <p>
                Đăng ký qua web cần <code>chay-agent.bat</code> đang chạy. Hoặc dùng{' '}
                <code>dang-ky-khuon-mat.bat</code> (ổn định hơn khi web chạy trên cloud).
              </p>
              <p>
                Sau khi đổi camera: chạy lại <code>chay-agent.bat</code>. Cần FFmpeg cho camera IP:{' '}
                <code>winget install Gyan.FFmpeg</code>
              </p>
              <p>
                Server Next.js (tuỳ chọn): <code>FACE_EMBEDDING_SERVICE_URL=http://IP-PC:8765</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </FeatureGate>
  );
}

export default FaceRecognitionSection;
