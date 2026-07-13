'use client';

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { PatientSearchInput, type PatientSearchHit } from './PatientSearchInput';
import { useFaceRealtimeRefresh } from '@/hooks/useFaceRealtimeRefresh';

interface PendingFace {
  id: number;
  status: string;
  quality_score: number | null;
  detected_at: string;
  snapshot_url: string | null;
  snapshot_display_url?: string | null;
  reject_reason?: string | null;
  assigned_at?: string | null;
  benh_nhan?: { id: number; ten: string } | null;
}

interface FaceSuggestion {
  patient_id: number;
  ten: string;
  dienthoai: string | null;
  mabenhnhan: string | null;
  similarity: number;
  similarity_pct: number;
}

interface Stats {
  pending: number;
  assigned: number;
  rejected: number;
  total: number;
}

type FilterStatus = 'all' | 'pending' | 'assigned' | 'rejected';
type SortBy = 'newest' | 'oldest' | 'quality';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function qualityColor(score: number | null) {
  const s = score ?? 0;
  if (s >= 0.8) return 'bg-green-500';
  if (s >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
}

function qualityLabel(score: number | null) {
  if (score == null) return 'N/A';
  const pct = Math.round(score * 100);
  if (pct >= 80) return `${pct}% tốt`;
  if (pct >= 60) return `${pct}% TB`;
  return `${pct}% kém`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge className="bg-orange-100 text-orange-700">Chờ xử lý</Badge>;
    case 'assigned':
      return <Badge className="bg-green-100 text-green-700">Đã gán</Badge>;
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700">Từ chối</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function FacePendingFacesPanel() {
  const [faces, setFaces] = useState<PendingFace[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, assigned: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending');
  const [sortBy, setSortBy] = useState<SortBy>('newest');

  const [assignOpen, setAssignOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selected, setSelected] = useState<PendingFace | null>(null);
  const [assignPatient, setAssignPatient] = useState<PatientSearchHit | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<FaceSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [pickedFromSuggestion, setPickedFromSuggestion] = useState<FaceSuggestion | null>(null);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus !== 'all') params.set('status', filterStatus);
    params.set('sort', sortBy);

    const [listRes, statsRes] = await Promise.all([
      axios.get(`/api/pending-faces?${params}`),
      axios.get('/api/pending-faces/stats'),
    ]);
    setFaces(listRes.data?.data || []);
    setStats(statsRes.data?.data || { pending: 0, assigned: 0, rejected: 0, total: 0 });
  }, [filterStatus, sortBy]);

  useEffect(() => {
    setLoading(true);
    fetchData()
      .catch(() => toast.error('Không tải được danh sách khuôn mặt'))
      .finally(() => setLoading(false));
  }, [fetchData]);

  // Realtime PendingFaces + polling fallback (thay setInterval 30s thuần)
  useFaceRealtimeRefresh({
    onRefresh: () => fetchData().catch(() => {}),
    tables: ['PendingFaces'],
    fallbackPollMs: 30000,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchData();
      toast.success('Đã làm mới');
    } catch {
      toast.error('Lỗi làm mới');
    } finally {
      setRefreshing(false);
    }
  };

  const openAssign = (face: PendingFace) => {
    setSelected(face);
    setAssignPatient(null);
    setPickedFromSuggestion(null);
    setSuggestions([]);
    setAssignOpen(true);
    setSuggestionsLoading(true);
    axios
      .get(`/api/pending-faces/${face.id}/suggest`)
      .then((res) => {
        setSuggestions(Array.isArray(res.data?.data) ? res.data.data : []);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  };

  const openReject = (face: PendingFace) => {
    setSelected(face);
    setRejectReason('');
    setRejectOpen(true);
  };

  const pickSuggestion = (s: FaceSuggestion) => {
    setAssignPatient({
      id: s.patient_id,
      ten: s.ten,
      dienthoai: s.dienthoai || undefined,
    });
    setPickedFromSuggestion(s);
  };

  const handleAssign = async () => {
    if (!selected || !assignPatient) return;
    setBusy(true);
    try {
      await axios.post(`/api/pending-faces/${selected.id}/assign`, {
        patient_id: assignPatient.id,
        from_suggestion: Boolean(pickedFromSuggestion),
        suggested_similarity: pickedFromSuggestion?.similarity,
      });
      toast.success(`Đã gán cho ${assignPatient.ten}`);
      setAssignOpen(false);
      await fetchData();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(msg || 'Không gán được');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await axios.post(`/api/pending-faces/${selected.id}/reject`, {
        reason: rejectReason || 'manual',
      });
      toast.success('Đã từ chối');
      setRejectOpen(false);
      await fetchData();
    } catch {
      toast.error('Lỗi từ chối');
    } finally {
      setBusy(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Xóa pending faces đã xử lý cũ hơn 7 ngày?')) return;
    try {
      const { data } = await axios.post('/api/pending-faces/cleanup', { days: 7 });
      toast.success(data?.message || 'Đã dọn dẹp');
      await fetchData();
    } catch {
      toast.error('Lỗi dọn dẹp');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Đang tải...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Khuôn mặt chờ xử lý</h2>
          <p className="text-sm text-gray-500">Gán bệnh nhân cho khách hệ thống chưa nhận ra</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleCleanup}>
            <Trash2 className="w-4 h-4 mr-1" /> Dọn dẹp
          </Button>
          <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(
          [
            ['pending', 'Chờ xử lý', stats.pending, 'text-orange-600', AlertCircle],
            ['assigned', 'Đã gán', stats.assigned, 'text-green-600', CheckCircle],
            ['rejected', 'Từ chối', stats.rejected, 'text-red-600', XCircle],
            ['all', 'Tổng cộng', stats.total, 'text-blue-600', Users],
          ] as const
        ).map(([key, label, count, color, Icon]) => (
          <Card
            key={key}
            className={`cursor-pointer transition-shadow hover:shadow-md ${
              filterStatus === key ? 'ring-2 ring-blue-400' : ''
            }`}
            onClick={() => setFilterStatus(key)}
          >
            <CardContent className="pt-4 pb-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{count}</p>
              </div>
              <Icon className="w-8 h-8 text-gray-200" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-500">Sắp xếp:</span>
        {(
          [
            ['newest', 'Mới nhất'],
            ['oldest', 'Cũ nhất'],
            ['quality', 'Chất lượng'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={sortBy === key ? 'default' : 'outline'}
            onClick={() => setSortBy(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {faces.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            Không có khuôn mặt nào trong bộ lọc hiện tại
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {faces.map((face) => (
            <Card
              key={face.id}
              className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => {
                setSelected(face);
                setViewOpen(true);
              }}
            >
              <div className="aspect-square relative bg-gray-100">
                {face.snapshot_display_url ? (
                  <img
                    src={face.snapshot_display_url}
                    alt={`Khách lạ #${face.id}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement
                        ?.querySelector('[data-snapshot-fallback]')
                        ?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div
                  data-snapshot-fallback
                  className={`w-full h-full flex flex-col items-center justify-center text-gray-400 px-2 text-center ${
                    face.snapshot_display_url ? 'hidden absolute inset-0 bg-gray-100' : ''
                  }`}
                >
                    <span className="text-2xl mb-1">📷</span>
                  <span className="text-[10px] leading-tight">
                    {face.snapshot_display_url ? 'Không tải được ảnh' : 'Chưa có ảnh (bản ghi cũ)'}
                  </span>
                </div>
                <div className="absolute top-2 left-2">{statusBadge(face.status)}</div>
                <div className="absolute top-2 right-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white ${qualityColor(face.quality_score)}`}
                    title="Chất lượng ảnh"
                  >
                    {qualityLabel(face.quality_score)}
                  </span>
                </div>
              </div>
              <CardContent className="p-2 space-y-1">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {formatTime(face.detected_at)}
                </div>
                {face.benh_nhan && (
                  <p className="text-xs text-green-700 font-medium truncate">→ {face.benh_nhan.ten}</p>
                )}
                {face.status === 'pending' && (
                  <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => openAssign(face)}>
                      <UserPlus className="w-3 h-3 mr-0.5" /> Gán
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2"
                      onClick={() => openReject(face)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gán bệnh nhân</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex gap-3 p-3 bg-gray-50 rounded-lg mb-2">
              <div className="w-16 h-16 rounded-lg bg-gray-200 overflow-hidden shrink-0">
                {selected.snapshot_display_url ? (
                  <img src={selected.snapshot_display_url} alt="" className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="text-sm">
                <p className="font-medium">Khách lạ #{selected.id}</p>
                <p className="text-gray-500">{formatTime(selected.detected_at)}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Chất lượng: {qualityLabel(selected.quality_score)}
                </p>
              </div>
            </div>
          )}

          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 mb-1.5">Gợi ý có thể là</p>
            {suggestionsLoading ? (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Đang so khớp khuôn mặt...
              </p>
            ) : suggestions.length === 0 ? (
              <p className="text-xs text-gray-500">Không tìm thấy bệnh nhân tương tự — hãy tìm thủ công bên dưới.</p>
            ) : (
              <ul className="space-y-1.5">
                {suggestions.map((s) => {
                  const active = assignPatient?.id === s.patient_id;
                  return (
                    <li key={s.patient_id}>
                      <button
                        type="button"
                        onClick={() => pickSuggestion(s)}
                        className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                          active
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{s.ten}</span>
                          <Badge
                            className={
                              s.similarity_pct >= 50
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }
                          >
                            {s.similarity_pct}% giống
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {[s.mabenhnhan, s.dienthoai].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <PatientSearchInput
            selected={assignPatient}
            onSelect={(p) => {
              setAssignPatient(p);
              setPickedFromSuggestion(null);
            }}
            placeholder="Hoặc tìm bệnh nhân (tên, SĐT, mã BN)..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleAssign} disabled={!assignPatient || busy}>
              Xác nhận gán
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối khuôn mặt</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Lý do (tùy chọn)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={busy}>
              Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chi tiết khuôn mặt #{selected?.id}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                {selected.snapshot_display_url ? (
                  <img
                    src={selected.snapshot_display_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div>{statusBadge(selected.status)}</div>
                <p>
                  <span className="text-gray-500">Phát hiện:</span> {formatTime(selected.detected_at)}
                </p>
                {selected.quality_score != null && (
                  <p>
                    <span className="text-gray-500">Chất lượng:</span>{' '}
                    {Math.round(selected.quality_score * 100)}%
                  </p>
                )}
                {selected.benh_nhan && (
                  <p className="text-green-700 font-medium">Đã gán: {selected.benh_nhan.ten}</p>
                )}
                {selected.reject_reason && (
                  <p className="text-red-600">Lý do: {selected.reject_reason}</p>
                )}
                {selected.status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => { setViewOpen(false); openAssign(selected); }}>
                      <UserPlus className="w-4 h-4 mr-1" /> Gán
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => { setViewOpen(false); openReject(selected); }}
                    >
                      Từ chối
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
