import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { Card } from '@/components/ui/card';
import { X } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface ChoKhamBenhNhan {
  id: number;
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
  avatar_url?: string;
  BenhNhan: ChoKhamBenhNhan;
}

const TRANG_THAI_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  'chờ': { label: 'Chờ', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: '🟡' },
  'đang_khám': { label: 'Đang khám', color: 'text-blue-700', bg: 'bg-blue-100', icon: '🔵' },
  'đã_xong': { label: 'Đã xong', color: 'text-gray-500', bg: 'bg-gray-100', icon: '⚪' },
};

export interface ChoKhamPanelRef {
  addPatient: (patientId: number) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const ChoKhamPanel = forwardRef<ChoKhamPanelRef>((_, ref) => {
  const [items, setItems] = useState<ChoKhamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  // Cập nhật đồng hồ mỗi phút để tính thời gian chờ
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Tính thời gian chờ
  const getWaitTime = useCallback((thoigian: string) => {
    const diff = now - new Date(thoigian).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa vào';
    if (mins < 60) return `${mins} phút`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h${remainMins > 0 ? remainMins + 'p' : ''}`;
  }, [now]);

  const fetchQueue = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/cho-kham?_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (data.success) {
        setItems(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

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

  return (
    <Card className="h-fit sticky top-4">
      {/* Header */}
      <div className="p-3 border-b bg-gradient-to-r from-blue-50 to-white rounded-t-lg">
        <h2 className="font-semibold text-sm">🏥 DANH SÁCH CHỜ KHÁM</h2>
        <div className="flex gap-2 mt-1.5 text-[11px]">
          <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">🟡 Chờ: {waitingCount}</span>
          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">🔵 Khám: {examiningCount}</span>
          <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">⚪ Xong: {doneCount}</span>
        </div>
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
        ) : (
          <div className="divide-y">
            {sortedItems.map((item) => {
              const status = TRANG_THAI_MAP[item.trangthai] || TRANG_THAI_MAP['chờ'];
              const waitTime = getWaitTime(item.thoigian);

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
                      <div className="text-xs font-medium truncate leading-tight">{item.BenhNhan?.ten || 'N/A'}</div>
                      <div className="text-[10px] text-gray-400 leading-tight">
                        {new Date(item.thoigian).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        {item.trangthai !== 'đã_xong' && (
                          <span className={`ml-1 ${
                            item.trangthai === 'đang_khám' ? 'text-blue-500' : 
                            parseInt(waitTime) > 30 ? 'text-red-400' : 'text-orange-400'
                          } font-medium`}>
                            · {waitTime}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions - đồng nhất cho tất cả trạng thái */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
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
