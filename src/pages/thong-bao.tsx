'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Bell, Check, CheckCheck, Trash2, Plus, Send, AlertTriangle, Info, Megaphone, Clock } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

interface ThongBao {
  id: number;
  tenant_id: string;
  user_id: string | null;
  tieu_de: string;
  noi_dung: string;
  loai: string;
  da_doc: boolean;
  created_by: string | null;
  created_at: string;
}

const LOAI_MAP: Record<string, { label: string; icon: typeof Bell; color: string; bg: string }> = {
  system: { label: 'Hệ thống', icon: Info, color: 'text-blue-700', bg: 'bg-blue-50' },
  admin: { label: 'Quản trị', icon: Megaphone, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  reminder: { label: 'Nhắc nhở', icon: Clock, color: 'text-orange-700', bg: 'bg-orange-50' },
  warning: { label: 'Cảnh báo', icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50' },
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return d.toLocaleDateString('vi-VN');
}

export default function ThongBaoPage() {
  const { currentRole } = useAuth();
  const { confirm } = useConfirm();
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';

  const [data, setData] = useState<ThongBao[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Dialog tạo thông báo mới
  const [openCreate, setOpenCreate] = useState(false);
  const [newTieuDe, setNewTieuDe] = useState('');
  const [newNoiDung, setNewNoiDung] = useState('');
  const [newLoai, setNewLoai] = useState('admin');
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (showUnreadOnly) params.set('unread_only', 'true');

      const res = await fetchWithAuth(`/api/thong-bao?${params}`);
      if (!res.ok) throw new Error('Lỗi tải thông báo');
      const json = await res.json();
      setData(json.data || []);
      setUnreadCount(json.unreadCount || 0);
    } catch {
      toast.error('Không thể tải thông báo');
    } finally {
      setLoading(false);
    }
  }, [showUnreadOnly]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const markAsRead = async (id: number) => {
    try {
      await fetchWithAuth('/api/thong-bao', {
        method: 'PATCH',
        body: JSON.stringify({ id }),
      });
      setData(prev => prev.map(tb => tb.id === id ? { ...tb, da_doc: true } : tb));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      toast.error('Lỗi đánh dấu đã đọc');
    }
  };

  const markAllRead = async () => {
    try {
      await fetchWithAuth('/api/thong-bao', {
        method: 'PATCH',
        body: JSON.stringify({ mark_all_read: true }),
      });
      setData(prev => prev.map(tb => ({ ...tb, da_doc: true })));
      setUnreadCount(0);
      toast.success('Đã đánh dấu tất cả đã đọc');
    } catch {
      toast.error('Lỗi');
    }
  };

  const deleteThongBao = async (id: number) => {
    const ok = await confirm({ message: 'Xóa thông báo này?', variant: 'danger' });
    if (!ok) return;
    try {
      await fetchWithAuth(`/api/thong-bao?id=${id}`, { method: 'DELETE' });
      setData(prev => prev.filter(tb => tb.id !== id));
      toast.success('Đã xóa');
    } catch {
      toast.error('Lỗi xóa thông báo');
    }
  };

  const createThongBao = async () => {
    if (!newTieuDe.trim() || !newNoiDung.trim()) {
      toast.error('Vui lòng nhập tiêu đề và nội dung');
      return;
    }
    setSending(true);
    try {
      const res = await fetchWithAuth('/api/thong-bao', {
        method: 'POST',
        body: JSON.stringify({
          tieu_de: newTieuDe,
          noi_dung: newNoiDung,
          loai: newLoai,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Đã gửi thông báo cho tất cả thành viên');
      setOpenCreate(false);
      setNewTieuDe('');
      setNewNoiDung('');
      setNewLoai('admin');
      fetchData();
    } catch {
      toast.error('Lỗi tạo thông báo');
    } finally {
      setSending(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-emerald-600" />
            <h1 className="text-xl font-bold text-gray-900">Thông báo</h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllRead}>
                <CheckCheck className="w-4 h-4 mr-1" /> Đọc tất cả
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" onClick={() => setOpenCreate(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-1" /> Tạo thông báo
              </Button>
            )}
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          <button
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${!showUnreadOnly ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
            onClick={() => setShowUnreadOnly(false)}
          >
            Tất cả
          </button>
          <button
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${showUnreadOnly ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
            onClick={() => setShowUnreadOnly(true)}
          >
            Chưa đọc {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Đang tải...</div>
        ) : data.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">{showUnreadOnly ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map(tb => {
              const loaiInfo = LOAI_MAP[tb.loai] || LOAI_MAP.system;
              const Icon = loaiInfo.icon;
              return (
                <Card
                  key={tb.id}
                  className={`transition-all cursor-pointer hover:shadow-md ${!tb.da_doc ? 'border-l-4 border-l-emerald-500 bg-emerald-50/30' : 'opacity-75'}`}
                  onClick={() => !tb.da_doc && markAsRead(tb.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${loaiInfo.bg} flex-shrink-0 mt-0.5`}>
                        <Icon className={`w-4 h-4 ${loaiInfo.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`text-sm font-semibold ${!tb.da_doc ? 'text-gray-900' : 'text-gray-600'}`}>
                            {tb.tieu_de}
                          </h3>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${loaiInfo.bg} ${loaiInfo.color}`}>
                            {loaiInfo.label}
                          </span>
                          {tb.user_id === null && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
                              Tất cả
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{tb.noi_dung}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400">{formatTime(tb.created_at)}</span>
                          <div className="flex items-center gap-1">
                            {!tb.da_doc && (
                              <button
                                className="p-1 text-emerald-500 hover:bg-emerald-100 rounded transition-colors"
                                onClick={(e) => { e.stopPropagation(); markAsRead(tb.id); }}
                                title="Đánh dấu đã đọc"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                                onClick={(e) => { e.stopPropagation(); deleteThongBao(tb.id); }}
                                title="Xóa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Dialog tạo thông báo */}
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Tạo thông báo mới</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                Thông báo sẽ được gửi đến <strong>tất cả thành viên</strong> trong phòng khám.
              </div>
              <div>
                <Label>Loại thông báo</Label>
                <div className="flex gap-2 mt-1">
                  {Object.entries(LOAI_MAP).map(([key, val]) => {
                    const Icon = val.icon;
                    return (
                      <button
                        key={key}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          newLoai === key ? `${val.bg} ${val.color} ring-2 ring-offset-1 ring-current` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        onClick={() => setNewLoai(key)}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {val.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Tiêu đề</Label>
                <Input
                  placeholder="VD: Lịch nghỉ lễ, Cập nhật phần mềm..."
                  value={newTieuDe}
                  onChange={e => setNewTieuDe(e.target.value)}
                  className="mt-1"
                  maxLength={200}
                />
              </div>
              <div>
                <Label>Nội dung</Label>
                <Textarea
                  placeholder="Nhập nội dung thông báo..."
                  value={newNoiDung}
                  onChange={e => setNewNoiDung(e.target.value)}
                  rows={4}
                  className="mt-1"
                  maxLength={2000}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenCreate(false)}>Hủy</Button>
              <Button
                onClick={createThongBao}
                disabled={sending || !newTieuDe.trim() || !newNoiDung.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Send className="w-4 h-4 mr-1" />
                {sending ? 'Đang gửi...' : 'Gửi thông báo'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
