'use client';

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FeatureGate } from './FeatureGate';
import { Button } from './ui/button';
import { Input } from './ui/input';

const FACE_AGENT_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_FACE_AGENT_DOWNLOAD_URL || '/downloads/OptigoFaceAgent.zip';

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
}

interface PendingFace {
  id: number;
  status: string;
  quality_score: number | null;
  detected_at: string;
  snapshot_url: string | null;
}

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

export function FaceRecognitionSection() {
  const [devices, setDevices] = useState<FaceDevice[]>([]);
  const [pendingFaces, setPendingFaces] = useState<PendingFace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('Camera cửa vào');
  const [latestPairing, setLatestPairing] = useState<{ code: string; expires: string } | null>(null);
  const [assignPatientId, setAssignPatientId] = useState<Record<number, string>>({});

  const fetchAll = useCallback(async () => {
    try {
      const [devRes, pendingRes] = await Promise.all([
        axios.get('/api/face-devices'),
        axios.get('/api/pending-faces?status=pending'),
      ]);
      setDevices(devRes.data?.data || []);
      setPendingFaces(pendingRes.data?.data || []);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

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

  const assignPending = async (pendingId: number) => {
    const patientId = assignPatientId[pendingId];
    if (!patientId) {
      toast.error('Nhập ID bệnh nhân');
      return;
    }
    try {
      await axios.post(`/api/pending-faces/${pendingId}/assign`, {
        patient_id: parseInt(patientId, 10),
      });
      toast.success('Đã gán khuôn mặt cho bệnh nhân');
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
            <span className="text-base">📷</span>
            <h3 className="text-sm font-semibold text-gray-800">Thiết bị nhận diện (PC + camera)</h3>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600">
              Cài agent Python trên PC tại cửa phòng khám. Khi khách quen vào, hệ thống tự thêm vào danh sách chờ khám.
            </p>

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
                {creating ? 'Đang tạo...' : '+ Tạo mã ghép nối'}
              </Button>
            </div>

            {latestPairing && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-1">Mã ghép nối (15 phút)</p>
                <p className="text-3xl font-mono font-bold tracking-widest text-blue-700">{latestPairing.code}</p>
                <p className="text-xs text-blue-700 mt-2">
                  Trên PC camera chạy:{' '}
                  <code className="bg-white px-1 rounded">
                    python main.py pair --code {latestPairing.code}
                  </code>
                </p>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-gray-400">Đang tải...</p>
            ) : devices.length === 0 ? (
              <p className="text-sm text-gray-400">Chưa có thiết bị nào.</p>
            ) : (
              <ul className="divide-y border rounded-lg">
                {devices.map((d) => (
                  <li key={d.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{d.device_label}</p>
                      <p className="text-xs text-gray-500">
                        {d.status === 'pending_pair' ? (
                          <>Chờ ghép — mã: <strong>{d.pairing_code}</strong></>
                        ) : (
                          <>Online: {formatRelativeTime(d.last_seen_at)}{d.agent_version ? ` · v${d.agent_version}` : ''}</>
                        )}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => revokeDevice(d.id)}>
                      Thu hồi
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
            <span className="text-base">🆕</span>
            <h3 className="text-sm font-semibold text-gray-800">Khuôn mặt chưa nhận diện</h3>
            <span className="ml-auto text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              {pendingFaces.length} chờ xử lý
            </span>
          </div>
          <div className="p-5">
            {pendingFaces.length === 0 ? (
              <p className="text-sm text-gray-400">Không có khuôn mặt lạ.</p>
            ) : (
              <ul className="space-y-3">
                {pendingFaces.map((p) => (
                  <li key={p.id} className="border rounded-lg p-3 flex flex-wrap gap-2 items-center">
                    <div className="flex-1 min-w-[140px]">
                      <p className="text-sm font-medium">#{p.id}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(p.detected_at).toLocaleString('vi-VN')}
                        {p.quality_score != null ? ` · Q${Math.round(p.quality_score * 100)}%` : ''}
                      </p>
                    </div>
                    <Input
                      className="w-28"
                      placeholder="ID BN"
                      value={assignPatientId[p.id] || ''}
                      onChange={(e) =>
                        setAssignPatientId((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                    <Button size="sm" onClick={() => assignPending(p.id)}>Gán BN</Button>
                    <Button size="sm" variant="outline" onClick={() => rejectPending(p.id)}>Bỏ qua</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-gray-50 border rounded-lg p-4 text-xs text-gray-600 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-gray-800">Cài đặt PC camera (Windows)</p>
            <Button size="sm" asChild>
              <a href={FACE_AGENT_DOWNLOAD_URL} download="OptigoFaceAgent.zip">
                Tải OptigoFaceAgent.zip
              </a>
            </Button>
          </div>
          <p className="font-medium text-gray-800">Hướng dẫn nhanh</p>
          <p>1. Tải gói zip ở trên → giải nén → chạy <code>cai-dat.bat</code></p>
          <p>2. Tạo mã ghép nối ở trên → chạy <code>ghep-noi.bat</code> và nhập mã</p>
          <p>3. Chạy <code>chay-agent.bat</code> để nhận diện tự động (giữ cửa sổ mở)</p>
          <p>Đăng ký khuôn mặt BN lần đầu: <code>dang-ky-khuon-mat.bat</code></p>
        </div>
      </div>
    </FeatureGate>
  );
}

export default FaceRecognitionSection;
