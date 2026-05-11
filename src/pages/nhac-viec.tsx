'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Plus, Pencil, Trash2, Check, LayoutList, LayoutDashboard,
  Clock, AlertTriangle, ChevronDown, Filter, User, Calendar,
  Flag, CheckCircle2, Circle, Loader2, X, RefreshCw,
} from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

// ─────────────── Types ───────────────────────────────────────────────────────

type LoaiViec = 'general' | 'policy' | 'training' | 'inventory' | 'other';
type DoUuTien = 'low' | 'normal' | 'high' | 'urgent';
type TrangThai = 'chua_lam' | 'dang_lam' | 'hoan_thanh' | 'da_huy';
type ViewMode = 'list' | 'kanban';

interface Member {
  id: string;
  email: string;
  display_name?: string;
  role?: string;
}

interface NhacViec {
  id: number;
  tieu_de: string;
  mo_ta: string | null;
  loai: LoaiViec;
  do_uu_tien: DoUuTien;
  trang_thai: TrangThai;
  assigned_to: string | null;
  created_by: string;
  han_chot: string | null;
  hoan_thanh_luc: string | null;
  created_at: string;
  branch_id: string | null;
  creator?: { id: string; email: string } | null;
  assignee?: { id: string; email: string } | null;
}

// ─────────────── Constants ───────────────────────────────────────────────────

const LOAI_MAP: Record<LoaiViec, { label: string; color: string; bg: string }> = {
  general:   { label: 'Chung',       color: 'text-gray-700',   bg: 'bg-gray-100' },
  policy:    { label: 'Chính sách',  color: 'text-blue-700',   bg: 'bg-blue-100' },
  training:  { label: 'Đào tạo',     color: 'text-purple-700', bg: 'bg-purple-100' },
  inventory: { label: 'Kho hàng',    color: 'text-orange-700', bg: 'bg-orange-100' },
  other:     { label: 'Khác',        color: 'text-slate-700',  bg: 'bg-slate-100' },
};

const UU_TIEN_MAP: Record<DoUuTien, { label: string; color: string; icon: typeof Flag }> = {
  low:    { label: 'Thấp',    color: 'text-gray-400',   icon: Flag },
  normal: { label: 'Bình thường', color: 'text-blue-500', icon: Flag },
  high:   { label: 'Cao',     color: 'text-orange-500', icon: Flag },
  urgent: { label: 'Khẩn',    color: 'text-red-600',    icon: AlertTriangle },
};

const TRANG_THAI_MAP: Record<TrangThai, { label: string; color: string; bg: string; border: string }> = {
  chua_lam:    { label: 'Cần làm',   color: 'text-gray-700',  bg: 'bg-gray-50',    border: 'border-gray-200' },
  dang_lam:    { label: 'Đang làm',  color: 'text-blue-700',  bg: 'bg-blue-50',    border: 'border-blue-200' },
  hoan_thanh:  { label: 'Xong',      color: 'text-green-700', bg: 'bg-green-50',   border: 'border-green-200' },
  da_huy:      { label: 'Đã hủy',    color: 'text-red-700',   bg: 'bg-red-50',     border: 'border-red-200' },
};

const KANBAN_COLUMNS: TrangThai[] = ['chua_lam', 'dang_lam', 'hoan_thanh'];

const EMPTY_FORM = {
  tieu_de: '',
  mo_ta: '',
  loai: 'general' as LoaiViec,
  do_uu_tien: 'normal' as DoUuTien,
  assigned_to: '',
  han_chot: '',
};

// ─────────────── Helpers ─────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function isOverdue(han_chot: string | null, trang_thai: TrangThai): boolean {
  if (!han_chot || trang_thai === 'hoan_thanh' || trang_thai === 'da_huy') return false;
  return new Date(han_chot) < new Date(new Date().toISOString().split('T')[0]);
}

function getAssigneeName(item: NhacViec, members: Member[]): string {
  if (!item.assigned_to) return 'Tất cả';
  const m = members.find(m => m.id === item.assigned_to);
  return m?.display_name || m?.email?.split('@')[0] || 'Nhân viên';
}

// ─────────────── Sub-components ──────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: DoUuTien }) {
  const cfg = UU_TIEN_MAP[priority];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function StatusPill({ status }: { status: TrangThai }) {
  const cfg = TRANG_THAI_MAP[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

function LoaiBadge({ loai }: { loai: LoaiViec }) {
  const cfg = LOAI_MAP[loai];
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

// ─────────────── Task Card (dùng chung cho list & kanban) ────────────────────

interface TaskCardProps {
  item: NhacViec;
  members: Member[];
  userId: string;
  isAdminOrOwner: boolean;
  onEdit: (item: NhacViec) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: TrangThai) => void;
  compact?: boolean;
}

function TaskCard({ item, members, userId, isAdminOrOwner, onEdit, onDelete, onStatusChange, compact }: TaskCardProps) {
  const overdue = isOverdue(item.han_chot, item.trang_thai);
  const canEdit = isAdminOrOwner || item.created_by === userId;

  const nextStatus: Record<TrangThai, TrangThai | null> = {
    chua_lam: 'dang_lam',
    dang_lam: 'hoan_thanh',
    hoan_thanh: null,
    da_huy: null,
  };
  const next = nextStatus[item.trang_thai];

  return (
    <div className={`bg-white border rounded-xl shadow-sm hover:shadow-md transition group ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-2">
        {/* Quick status toggle */}
        <button
          onClick={() => next && onStatusChange(item.id, next)}
          disabled={!next}
          className="mt-0.5 flex-shrink-0"
          title={next ? `Chuyển sang "${TRANG_THAI_MAP[next].label}"` : ''}
        >
          {item.trang_thai === 'hoan_thanh' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : item.trang_thai === 'da_huy' ? (
            <X className="w-5 h-5 text-red-400" />
          ) : (
            <Circle className={`w-5 h-5 ${next ? 'text-gray-300 hover:text-blue-500 cursor-pointer' : 'text-gray-200'}`} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm leading-snug ${item.trang_thai === 'hoan_thanh' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {item.tieu_de}
          </p>

          {!compact && item.mo_ta && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.mo_ta}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <LoaiBadge loai={item.loai} />
            <PriorityBadge priority={item.do_uu_tien} />

            {item.han_chot && (
              <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                <Calendar className="w-3 h-3" />
                {overdue && <AlertTriangle className="w-3 h-3" />}
                {formatDate(item.han_chot)}
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
              <User className="w-3 h-3" />
              {getAssigneeName(item, members)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition flex gap-1">
          {canEdit && (
            <button onClick={() => onEdit(item)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {canEdit && (
            <button onClick={() => onDelete(item.id)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────── Create/Edit Dialog ──────────────────────────────────────────

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (form: typeof EMPTY_FORM, id?: number) => Promise<void>;
  members: Member[];
  initial?: NhacViec | null;
  saving: boolean;
}

function TaskDialog({ open, onClose, onSave, members, initial, saving }: TaskDialogProps) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (initial) {
      setForm({
        tieu_de: initial.tieu_de,
        mo_ta: initial.mo_ta || '',
        loai: initial.loai,
        do_uu_tien: initial.do_uu_tien,
        assigned_to: initial.assigned_to || '',
        han_chot: initial.han_chot || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [initial, open]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Sửa nhắc việc' : 'Thêm nhắc việc mới'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label>Tiêu đề <span className="text-red-500">*</span></Label>
            <Input
              placeholder="VD: Cập nhật giá kính tháng 6..."
              value={form.tieu_de}
              onChange={e => set('tieu_de', e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Mô tả chi tiết</Label>
            <Textarea
              placeholder="Ghi thêm thông tin cụ thể..."
              value={form.mo_ta}
              onChange={e => set('mo_ta', e.target.value)}
              className="mt-1 min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Loại việc</Label>
              <select
                value={form.loai}
                onChange={e => set('loai', e.target.value)}
                className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(LOAI_MAP).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Độ ưu tiên</Label>
              <select
                value={form.do_uu_tien}
                onChange={e => set('do_uu_tien', e.target.value)}
                className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(UU_TIEN_MAP).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Giao cho</Label>
              <select
                value={form.assigned_to}
                onChange={e => set('assigned_to', e.target.value)}
                className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tất cả nhân viên</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.email?.split('@')[0] || m.email}
                    {m.role ? ` (${m.role})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Hạn chót</Label>
              <Input
                type="date"
                value={form.han_chot}
                onChange={e => set('han_chot', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Hủy</Button>
            <Button
              onClick={() => onSave(form, initial?.id)}
              disabled={saving || !form.tieu_de.trim()}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {initial ? 'Lưu thay đổi' : 'Tạo nhắc việc'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────── Main Page ───────────────────────────────────────────────────

export default function NhacViecPage() {
  const { user, currentRole } = useAuth();
  const { confirm } = useConfirm();
  const userId = user?.id || '';
  const isAdminOrOwner = currentRole === 'owner' || currentRole === 'admin';

  const [items, setItems] = useState<NhacViec[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // View toggle
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('nhac_viec_view') as ViewMode) || 'list';
    }
    return 'list';
  });

  // Filters
  const [filterLoai, setFilterLoai] = useState<string>('');
  const [filterUuTien, setFilterUuTien] = useState<string>('');
  const [filterAssignedMe, setFilterAssignedMe] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NhacViec | null>(null);

  // Drag-over state for kanban
  const [dragOverCol, setDragOverCol] = useState<TrangThai | null>(null);
  const dragItemId = useRef<number | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAssignedMe) params.set('assigned_to_me', 'true');
      const res = await fetchWithAuth(`/api/nhac-viec?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || err?.details || 'Không thể tải danh sách nhắc việc');
      }
      const json = await res.json();
      setItems(json.data || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Không thể tải danh sách nhắc việc');
    } finally {
      setLoading(false);
    }
  }, [filterAssignedMe]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/tenants/members');
      if (!res.ok) return;
      const json = await res.json();
      setMembers(json.members || json.data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') localStorage.setItem('nhac_viec_view', mode);
  };

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = items.filter(item => {
    if (filterLoai && item.loai !== filterLoai) return false;
    if (filterUuTien && item.do_uu_tien !== filterUuTien) return false;
    if (filterAssignedMe && item.assigned_to !== userId && item.assigned_to !== null) return false;
    if (hideCompleted && (item.trang_thai === 'hoan_thanh' || item.trang_thai === 'da_huy')) return false;
    return true;
  });

  const countByStatus = (status: TrangThai) => items.filter(i => i.trang_thai === status).length;

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  const handleSave = async (form: typeof EMPTY_FORM, id?: number) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/nhac-viec', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(id ? { id, ...form } : form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      toast.success(id ? 'Đã cập nhật' : 'Đã tạo nhắc việc');
      setDialogOpen(false);
      setEditingItem(null);
      fetchItems();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ message: 'Xóa nhắc việc này?', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await fetchWithAuth(`/api/nhac-viec?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Đã xóa');
      setItems(prev => prev.filter(i => i.id !== id));
    } catch {
      toast.error('Lỗi xóa');
    }
  };

  const handleStatusChange = async (id: number, status: TrangThai) => {
    setItems(prev => prev.map(i => i.id === id ? {
      ...i,
      trang_thai: status,
      hoan_thanh_luc: status === 'hoan_thanh' ? new Date().toISOString() : null,
    } : i));
    try {
      const res = await fetchWithAuth('/api/nhac-viec', {
        method: 'PATCH',
        body: JSON.stringify({ id, trang_thai: status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Lỗi cập nhật trạng thái');
      fetchItems();
    }
  };

  // ── Kanban drag handlers ───────────────────────────────────────────────────
  const onDragStart = (id: number) => { dragItemId.current = id; };
  const onDragOver = (e: React.DragEvent, col: TrangThai) => { e.preventDefault(); setDragOverCol(col); };
  const onDrop = (col: TrangThai) => {
    if (dragItemId.current !== null) {
      const item = items.find(i => i.id === dragItemId.current);
      if (item && item.trang_thai !== col) handleStatusChange(dragItemId.current, col);
    }
    setDragOverCol(null);
    dragItemId.current = null;
  };

  const cardProps = (item: NhacViec) => ({
    item, members, userId, isAdminOrOwner,
    onEdit: (i: NhacViec) => { setEditingItem(i); setDialogOpen(true); },
    onDelete: handleDelete,
    onStatusChange: handleStatusChange,
  });

  // ── Pending count badge ────────────────────────────────────────────────────
  const pendingCount = items.filter(i => i.trang_thai === 'chua_lam' || i.trang_thai === 'dang_lam').length;

  return (
    <ProtectedRoute>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Nhắc việc nội bộ</h1>
            {pendingCount > 0 && (
              <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">
                {pendingCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh */}
            <button onClick={fetchItems} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Tải lại">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* View toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => handleViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Dạng danh sách"
              >
                <LayoutList className="w-4 h-4" />
                <span className="hidden sm:inline">Danh sách</span>
              </button>
              <button
                onClick={() => handleViewMode('kanban')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Kanban board"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Kanban</span>
              </button>
            </div>

            <Button onClick={() => { setEditingItem(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" />
              Thêm việc
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <Filter className="w-4 h-4" />
            <span>Lọc:</span>
          </div>

          <select
            value={filterLoai}
            onChange={e => setFilterLoai(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả loại</option>
            {Object.entries(LOAI_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select
            value={filterUuTien}
            onChange={e => setFilterUuTien(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả độ ưu tiên</option>
            {Object.entries(UU_TIEN_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterAssignedMe}
              onChange={e => setFilterAssignedMe(e.target.checked)}
              className="rounded"
            />
            Của tôi
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={e => setHideCompleted(e.target.checked)}
              className="rounded"
            />
            Ẩn đã xong/hủy
          </label>

          {/* Summary pills */}
          <div className="ml-auto flex items-center gap-2">
            {(Object.entries(TRANG_THAI_MAP) as [TrangThai, (typeof TRANG_THAI_MAP)[TrangThai]][]).map(([k, v]) => {
              const c = countByStatus(k);
              if (c === 0) return null;
              return (
                <span key={k} className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.color} ${v.bg}`}>
                  {v.label}: {c}
                </span>
              );
            })}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        )}

        {/* ─── LIST VIEW ─────────────────────────────────────────────────────── */}
        {!loading && viewMode === 'list' && (
          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Không có nhắc việc nào</p>
                <p className="text-sm mt-1">Nhấn "Thêm việc" để tạo mới</p>
              </div>
            )}

            {/* Group by status */}
            {(Object.entries(TRANG_THAI_MAP) as [TrangThai, (typeof TRANG_THAI_MAP)[TrangThai]][]).map(([status, cfg]) => {
              const group = filtered.filter(i => i.trang_thai === status);
              if (group.length === 0) return null;
              return (
                <div key={status}>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${cfg.bg} ${cfg.border} border mb-2`}>
                    <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                    <span className={`text-xs font-bold ${cfg.color}`}>{group.length}</span>
                  </div>
                  <div className="space-y-2 mb-4">
                    {group.map(item => (
                      <TaskCard key={item.id} {...cardProps(item)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── KANBAN VIEW ───────────────────────────────────────────────────── */}
        {!loading && viewMode === 'kanban' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {KANBAN_COLUMNS.map(colStatus => {
              const cfg = TRANG_THAI_MAP[colStatus];
              const colItems = filtered.filter(i => i.trang_thai === colStatus);
              const isOver = dragOverCol === colStatus;

              return (
                <div
                  key={colStatus}
                  onDragOver={e => onDragOver(e, colStatus)}
                  onDragLeave={() => setDragOverCol(null)}
                  onDrop={() => onDrop(colStatus)}
                  className={`rounded-xl border-2 transition-colors ${isOver ? 'border-blue-400 bg-blue-50/50' : `${cfg.border} ${cfg.bg}`} p-3 min-h-[300px]`}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
                        {colItems.length}
                      </span>
                    </div>
                    {/* Quick-add button for "chua_lam" */}
                    {colStatus === 'chua_lam' && (
                      <button
                        onClick={() => { setEditingItem(null); setDialogOpen(true); }}
                        className="p-1 rounded-lg hover:bg-white text-gray-400 hover:text-blue-600 transition"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Cards */}
                  <div className="space-y-2">
                    {colItems.map(item => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => onDragStart(item.id)}
                        onDragEnd={() => setDragOverCol(null)}
                        className="cursor-grab active:cursor-grabbing"
                      >
                        <TaskCard {...cardProps(item)} compact />
                      </div>
                    ))}
                    {colItems.length === 0 && (
                      <div className="text-center py-8 text-gray-300 text-xs">
                        {isOver ? 'Thả vào đây' : 'Chưa có việc'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog tạo/sửa */}
      <TaskDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingItem(null); }}
        onSave={handleSave}
        members={members}
        initial={editingItem}
        saving={saving}
      />
    </ProtectedRoute>
  );
}
