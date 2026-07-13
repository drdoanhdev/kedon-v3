import React, { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Card } from '@/components/ui/card';
import { X, PanelLeftClose } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useFaceRealtimeRefresh } from '@/hooks/useFaceRealtimeRefresh';

interface ChoKhamBenhNhan {
  id: number;
  mabenhnhan?: string | null;
  ten: string;
  dienthoai: string;
  namsinh: string;
  diachi: string;
}

interface ChoKhamItem {
  id: number;
  benhnhanid: number;
  thoigian: string;
  trangthai: string;
  done_at?: string | null;
  avatar_url?: string;
  check_in_source?: string | null;
  BenhNhan: ChoKhamBenhNhan;
}

interface WaitingCleanupLog {
  id: number;
  created_at: string;
  actor_email: string | null;
  actor_role: string;
  trigger_mode: 'manual' | 'auto';
  threshold_minutes: number;
  deleted_count: number;
}

const TRANG_THAI_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  'chờ': { label: 'Chờ', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: '🟡' },
  'đang_khám': { label: 'Đang khám', color: 'text-blue-700', bg: 'bg-blue-100', icon: '🔵' },
  'đã_xong': { label: 'Đã xong', color: 'text-gray-500', bg: 'bg-gray-100', icon: '⚪' },
};

const SLA_MINUTES = {
  warning: 15,
  alert: 30,
  critical: 45,
};

export interface ChoKhamPanelRef {
  addPatient: (patientId: number) => Promise<boolean>;
  refresh: () => Promise<void>;
}

interface ChoKhamPanelProps {
  onCollapse?: () => void;
  canClearDoneCases?: boolean;
}

const ChoKhamPanel = forwardRef<ChoKhamPanelRef, ChoKhamPanelProps>(({ onCollapse, canClearDoneCases = false }, ref) => {
  const [items, setItems] = useState<ChoKhamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const waitingIdsRef = useRef<Set<number>>(new Set());
  const [now, setNow] = useState(Date.now());
  const [statusFilter, setStatusFilter] = useState<'all' | 'chờ' | 'đang_khám' | 'đã_xong'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [cleanupLogs, setCleanupLogs] = useState<WaitingCleanupLog[]>([]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const getWaitMinutes = useCallback((thoigian: string) => {
    const diff = now - new Date(thoigian).getTime();
    return Math.max(0, Math.floor(diff / 60000));
  }, [now]);

  // Cập nhật đồng hồ mỗi phút để tính thời gian chờ
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Tính thời gian chờ
  const getWaitTime = useCallback((thoigian: string) => {
    const mins = getWaitMinutes(thoigian);
    if (mins < 1) return 'Vừa vào';
    if (mins < 60) return `${mins} phút`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h${remainMins > 0 ? remainMins + 'p' : ''}`;
  }, [getWaitMinutes]);

  const fetchQueue = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/cho-kham?_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (data.success) {
        const nextItems: ChoKhamItem[] = data.data || [];
        setItems(nextItems);

        const nextWaitingIds = new Set(
          nextItems.filter((item) => item.trangthai === 'chờ').map((item) => item.id)
        );

        if (waitingIdsRef.current.size > 0) {
          const newWaiting = nextItems.filter(
            (item) => item.trangthai === 'chờ' && !waitingIdsRef.current.has(item.id)
          );
          if (newWaiting.length > 0) {
            const faceCheckIns = newWaiting.filter((item) =>
              item.check_in_source?.startsWith('device:')
            );
            if (faceCheckIns.length > 0) {
              const names = faceCheckIns
                .map((item) => item.BenhNhan?.ten)
                .filter(Boolean)
                .slice(0, 3)
                .join(', ');
              toast(`📷 Nhận diện: ${names}${faceCheckIns.length > 3 ? '...' : ''} vào chờ khám`, {
                duration: 5000,
              });
            } else {
              toast(`Có ${newWaiting.length} bệnh nhân mới vào chờ khám`, { icon: '🔔' });
            }
          }
        }

        waitingIdsRef.current = nextWaitingIds;
      }
    } catch (err) {
      console.error('Error fetching queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCleanupLogs = useCallback(async () => {
    if (!canClearDoneCases) return;

    try {
      const { data } = await axios.get('/api/cho-kham/cleanup?limit=5');
      setCleanupLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch {
      // Ignore log fetch errors to avoid blocking queue interaction.
    }
  }, [canClearDoneCases]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Realtime ChoKham + polling fallback (thay setInterval 10s)
  useFaceRealtimeRefresh({
    onRefresh: fetchQueue,
    tables: ['ChoKham'],
    fallbackPollMs: 15000,
  });

  useEffect(() => {
    fetchCleanupLogs();
  }, [fetchCleanupLogs]);

  const addPatient = useCallback(async (patientId: number): Promise<boolean> => {
    try {
      const { data } = await axios.post('/api/cho-kham', { patient_id: patientId });
      if (data.existing) {
        toast(data.message, { icon: 'ℹ️' });
        return false;
      }
      toast.success(data.message || 'Đã thêm vào chờ khám');
      await fetchQueue();
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }, 100);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Lỗi thêm vào chờ khám';
      toast.error(msg);
      return false;
    }
  }, [fetchQueue]);

  const updateStatus = useCallback(async (id: number, newStatus: string) => {
    try {
      // Nếu chuyển sang "đang khám", auto hoàn thành bệnh nhân đang khám trước đó
      if (newStatus === 'đang_khám') {
        const currentlyExamining = items.find(i => i.trangthai === 'đang_khám');
        if (currentlyExamining) {
          await axios.patch('/api/cho-kham', { id: currentlyExamining.id, trangthai: 'đã_xong' });
        }
      }
      await axios.patch('/api/cho-kham', { id, trangthai: newStatus });
      await fetchQueue();
    } catch (err: any) {
      toast.error('Lỗi cập nhật trạng thái');
    }
  }, [items, fetchQueue]);

  // Mở trang kê đơn thuốc và auto chuyển trạng thái đang khám
  const openKeDon = useCallback(async (item: ChoKhamItem) => {
    await updateStatus(item.id, 'đang_khám');
    window.open(`/ke-don?bn=${item.benhnhanid}`, '_blank');
  }, [updateStatus]);

  // Mở trang kê đơn kính và auto chuyển trạng thái đang khám
  const openKeDonKinh = useCallback(async (item: ChoKhamItem) => {
    await updateStatus(item.id, 'đang_khám');
    window.open(`/ke-don-kinh?bn=${item.benhnhanid}`, '_blank');
  }, [updateStatus]);

  const removeFromQueue = useCallback(async (id: number) => {
    try {
      await axios.delete(`/api/cho-kham?id=${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success('Đã xóa khỏi danh sách chờ');
    } catch (err) {
      toast.error('Lỗi xóa khỏi danh sách');
    }
  }, []);

  const clearDoneCases = useCallback(async () => {
    const doneItems = items.filter((item) => item.trangthai === 'đã_xong');
    if (doneItems.length === 0) {
      toast('Không có ca đã xong để dọn', { icon: 'ℹ️' });
      return;
    }

    const ok = window.confirm(`Dọn ${doneItems.length} ca đã xong khỏi danh sách chờ?`);
    if (!ok) return;

    try {
      const { data } = await axios.post('/api/cho-kham/cleanup', {
        mode: 'manual',
        thresholdMinutes: 0,
      });
      const deletedCount = Number(data?.deletedCount || 0);
      await fetchQueue();
      await fetchCleanupLogs();
      toast.success(`Đã dọn ${deletedCount} ca đã xong`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Không thể dọn ca đã xong';
      toast.error(msg);
    }
  }, [items, fetchQueue, fetchCleanupLogs]);

  useImperativeHandle(ref, () => ({
    addPatient,
    refresh: fetchQueue,
  }), [addPatient, fetchQueue]);

  const waitingCount = items.filter(i => i.trangthai === 'chờ').length;
  const examiningCount = items.filter(i => i.trangthai === 'đang_khám').length;
  const doneCount = items.filter(i => i.trangthai === 'đã_xong').length;

  // Sắp xếp: chờ → đang_khám → đã_xong, phụ theo giờ tiếp nhận
  const STATUS_ORDER: Record<string, number> = { 'chờ': 0, 'đang_khám': 1, 'đã_xong': 2 };
  const sortedItems = [...items].sort((a, b) => {
    const sa = STATUS_ORDER[a.trangthai] ?? 9;
    const sb = STATUS_ORDER[b.trangthai] ?? 9;
    if (sa !== sb) return sa - sb;
    return new Date(a.thoigian).getTime() - new Date(b.thoigian).getTime();
  });

  const waitingOrderById = useMemo(() => {
    const map = new Map<number, number>();
    let order = 1;
    sortedItems.forEach((item) => {
      if (item.trangthai === 'chờ') {
        map.set(item.id, order);
        order += 1;
      }
    });
    return map;
  }, [sortedItems]);

  const nextWaitingItem = sortedItems.find((item) => item.trangthai === 'chờ') || null;

  const waitingSlaStats = useMemo(() => {
    const waitingItems = sortedItems.filter((item) => item.trangthai === 'chờ');
    let over15 = 0;
    let over30 = 0;
    let over45 = 0;

    waitingItems.forEach((item) => {
      const mins = getWaitMinutes(item.thoigian);
      if (mins >= SLA_MINUTES.warning) over15 += 1;
      if (mins >= SLA_MINUTES.alert) over30 += 1;
      if (mins >= SLA_MINUTES.critical) over45 += 1;
    });

    return { over15, over30, over45 };
  }, [sortedItems, getWaitMinutes]);

  const filteredItems = sortedItems.filter((item) => {
    const allowDone = showDone || statusFilter === 'đã_xong';
    if (!allowDone && item.trangthai === 'đã_xong') return false;
    if (statusFilter !== 'all' && item.trangthai !== statusFilter) return false;
    if (!normalizedSearch) return true;

    const patientName = (item.BenhNhan?.ten || '').toLowerCase();
    const phone = (item.BenhNhan?.dienthoai || '').toLowerCase();
    const code = (item.BenhNhan?.mabenhnhan || '').toLowerCase();
    return (
      patientName.includes(normalizedSearch)
      || phone.includes(normalizedSearch)
      || code.includes(normalizedSearch)
    );
  });

  const callNextPatient = useCallback(async () => {
    if (!nextWaitingItem) {
      toast('Hiện không còn bệnh nhân ở trạng thái chờ', { icon: '✅' });
      return;
    }

    await updateStatus(nextWaitingItem.id, 'đang_khám');
    toast.success(`Mời ${nextWaitingItem.BenhNhan?.ten || 'bệnh nhân tiếp theo'} vào khám`);
  }, [nextWaitingItem, updateStatus]);

  return (
    <Card className="h-fit sticky top-4">
      {/* Header */}
      <div className="p-3 border-b bg-gradient-to-r from-blue-50 to-white rounded-t-lg">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">🏥 DANH SÁCH CHỜ KHÁM</h2>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              title="Ẩn danh sách chờ khám"
            >
              <PanelLeftClose className="h-3.5 w-3.5" /> Ẩn
            </button>
          )}
        </div>
        <div className="flex gap-2 mt-1.5 text-[11px]">
          <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">🟡 Chờ: {waitingCount}</span>
          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">🔵 Khám: {examiningCount}</span>
          <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">⚪ Xong: {doneCount}</span>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={callNextPatient}
            disabled={!nextWaitingItem}
            className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            title="Mời bệnh nhân chờ đầu tiên vào khám"
          >
            Mời tiếp
          </button>
          {canClearDoneCases && (
            <button
              type="button"
              onClick={clearDoneCases}
              disabled={doneCount === 0}
              className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              title="Dọn nhanh toàn bộ ca đã xong khỏi danh sách"
            >
              Dọn ca xong ({doneCount})
            </button>
          )}
          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Hiện ca xong
          </label>
        </div>

        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm tên hoặc SĐT..."
          className="mt-2 h-7 w-full rounded border border-slate-200 bg-white px-2 text-[11px] focus:border-blue-300 focus:outline-none"
        />

        <div className="mt-1.5 flex flex-wrap gap-1">
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'chờ', label: 'Chờ' },
            { key: 'đang_khám', label: 'Đang khám' },
            { key: 'đã_xong', label: 'Đã xong' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatusFilter(opt.key as 'all' | 'chờ' | 'đang_khám' | 'đã_xong')}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                statusFilter === opt.key
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">≥{SLA_MINUTES.warning}p: {waitingSlaStats.over15}</span>
          <span className="rounded bg-orange-100 px-1.5 py-0.5 font-medium text-orange-700">≥{SLA_MINUTES.alert}p: {waitingSlaStats.over30}</span>
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">≥{SLA_MINUTES.critical}p: {waitingSlaStats.over45}</span>
        </div>

        {canClearDoneCases && (
          <div className="mt-2 rounded border border-slate-200 bg-white p-2">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-slate-600">Auto-cleanup chạy bằng cron backend, không phụ thuộc mở panel.</span>
            </div>

            {cleanupLogs.length > 0 && (
              <div className="mt-1.5 space-y-1 text-[10px] text-slate-500">
                {cleanupLogs.slice(0, 3).map((log) => (
                  <div key={log.id} className="truncate">
                    {new Date(log.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    {' · '}
                    {log.actor_email || log.actor_role}
                    {' · '}
                    {log.trigger_mode === 'auto' ? 'Tự động' : 'Thủ công'}
                    {' · dọn '}
                    {log.deleted_count}
                    {' ca'}
                    {log.trigger_mode === 'auto' ? ` · ngưỡng ${log.threshold_minutes}p` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        {loading ? (
          <div className="p-4 text-center text-sm text-gray-400">Đang tải...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-gray-300 text-3xl mb-2">📋</div>
            <div className="text-sm text-gray-400">Chưa có bệnh nhân chờ khám</div>
            <div className="text-xs text-gray-300 mt-1">Chọn bệnh nhân bên phải → nhấn "+ Chờ"</div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-gray-300 text-2xl mb-2">🔎</div>
            <div className="text-sm text-gray-400">Không có bệnh nhân khớp bộ lọc</div>
            <div className="text-xs text-gray-300 mt-1">Thử đổi trạng thái lọc hoặc từ khóa tìm kiếm</div>
          </div>
        ) : (
          <div className="divide-y">
            {filteredItems.map((item) => {
              const status = TRANG_THAI_MAP[item.trangthai] || TRANG_THAI_MAP['chờ'];
              const waitingOrder = waitingOrderById.get(item.id);
              const waitTime = getWaitTime(item.thoigian);
              const waitMinutes = getWaitMinutes(item.thoigian);
              const waitTone = waitMinutes >= SLA_MINUTES.critical
                ? 'text-red-500'
                : waitMinutes >= SLA_MINUTES.alert
                ? 'text-red-400'
                : waitMinutes >= SLA_MINUTES.warning
                ? 'text-orange-500'
                : 'text-orange-400';

              return (
                <div
                  key={item.id}
                  className={`px-2 py-1.5 transition-all ${
                    item.trangthai === 'đang_khám'
                      ? 'bg-blue-50 border-l-3 border-l-blue-500'
                      : item.trangthai === 'đã_xong'
                      ? 'bg-gray-50 opacity-60'
                      : 'hover:bg-yellow-50'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {/* Status icon */}
                    <span className="text-[10px] flex-shrink-0">{status.icon}</span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate leading-tight flex items-center gap-1">
                        {typeof waitingOrder === 'number' && (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700">
                            {waitingOrder}
                          </span>
                        )}
                        <span className="truncate">{item.BenhNhan?.ten || 'N/A'}</span>
                        {item.check_in_source?.startsWith('device:') && (
                          <span
                            className="shrink-0 text-[9px] bg-violet-100 text-violet-700 px-1 py-0 rounded font-medium"
                            title="Check-in tự động qua nhận diện khuôn mặt"
                          >
                            📷
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 leading-tight">
                        {item.BenhNhan?.mabenhnhan ? (
                          <span className="mr-1 font-medium text-gray-500">{item.BenhNhan.mabenhnhan}</span>
                        ) : null}
                        {new Date(item.thoigian).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}
                        {item.trangthai !== 'đã_xong' && (
                          <span className={`ml-1 ${
                            item.trangthai === 'đang_khám' ? 'text-blue-500' : 
                            waitTone
                          } font-medium`}>
                            · {waitTime}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions - đồng nhất cho tất cả trạng thái */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {item.trangthai === 'đang_khám' && (
                        <button
                          onClick={() => updateStatus(item.id, 'chờ')}
                          className="text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium bg-amber-100 text-amber-700 hover:bg-amber-200"
                          title="Chuyển lại về hàng chờ"
                        >
                          Trả chờ
                        </button>
                      )}
                      <button
                        onClick={() => openKeDon(item)}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium ${
                          item.trangthai === 'chờ'
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : item.trangthai === 'đang_khám'
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title="Kê đơn thuốc"
                      >
                        Đơn
                      </button>
                      <button
                        onClick={() => openKeDonKinh(item)}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium ${
                          item.trangthai === 'chờ'
                            ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                            : item.trangthai === 'đang_khám'
                            ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title="Kê đơn kính"
                      >
                        Kính
                      </button>
                      <button
                        onClick={() => removeFromQueue(item.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                        title="Xóa khỏi danh sách"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
});

ChoKhamPanel.displayName = 'ChoKhamPanel';
export default ChoKhamPanel;
