
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Pencil, Trash2, Search, AlertTriangle, User, RotateCcw } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import clsx from 'clsx';

interface PatientRef {
  id: number;
  ten: string;
  dienthoai: string | null;
  diachi: string | null;
  namsinh?: string | null;
}



type NoteType = 'important' | 'reminder' | 'normal';
interface NoteItem {
  id: number;
  benhnhan_id: number;
  content: string;
  note_type: NoteType;
  deleted_at?: string | null;
  created_at: string;
  patient: PatientRef | null;
}

export default function QuanLyGhiChuKhachHangPage() {
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'important' | 'normal' | 'hidden'>('all');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [editForm, setEditForm] = useState({ content: '', note_type: 'normal' as NoteType });
  const [showAdd, setShowAdd] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const notesRes = await axios.get('/api/benh-nhan/notes', {
        params: {
          includeDeleted: true,
          _t: Date.now(),
        },
      });
      setNotes(notesRes.data?.data || []);
    } catch (error: any) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredNotes = useMemo(() => {
    let arr = notes.filter((n) => {
      if (filter === 'hidden') return !!n.deleted_at;
      if (filter === 'important') return !n.deleted_at && n.note_type === 'important';
      if (filter === 'normal') return !n.deleted_at && n.note_type === 'normal';
      return !n.deleted_at;
    });
    if (search.trim()) {
      const keyword = search.trim().toLowerCase();
      arr = arr.filter((n) => {
        const hay = `${n.content} ${n.patient?.ten || ''} ${n.patient?.dienthoai || ''} ${n.patient?.diachi || ''}`.toLowerCase();
        return hay.includes(keyword);
      });
    }
    return arr;
  }, [notes, search, filter]);

  const importantCount = useMemo(() => notes.filter((n) => !n.deleted_at && n.note_type === 'important').length, [notes]);

  const toggleType = useCallback(async (item: NoteItem) => {
    try {
      await axios.put('/api/benh-nhan/notes', {
        id: item.id,
        content: item.content,
        note_type: item.note_type === 'important' ? 'normal' : 'important',
      });
      toast.success('Đã cập nhật loại ghi chú');
      fetchData();
    } catch {
      toast.error('Lỗi cập nhật loại ghi chú');
    }
  }, [fetchData]);

  const archiveNote = useCallback(async (id: number) => {
    try {
      await axios.delete('/api/benh-nhan/notes', { data: { id } });
      toast.success('Đã chuyển ghi chú vào thùng rác');
      fetchData();
    } catch {
      toast.error('Lỗi xóa ghi chú');
    }
  }, [fetchData]);

  const restoreNote = useCallback(async (id: number) => {
    try {
      await axios.patch('/api/benh-nhan/notes', { id });
      toast.success('Đã khôi phục ghi chú');
      fetchData();
    } catch {
      toast.error('Lỗi khôi phục ghi chú');
    }
  }, [fetchData]);

  const deleteNotePermanently = useCallback(async (id: number) => {
    const ok = window.confirm('Bạn sắp xóa vĩnh viễn ghi chú này. Hành động không thể hoàn tác. Tiếp tục?');
    if (!ok) return;
    try {
      await axios.delete('/api/benh-nhan/notes?hard=1', { data: { id, hard: true } });
      toast.success('Đã xóa vĩnh viễn ghi chú');
      fetchData();
    } catch {
      toast.error('Lỗi xóa vĩnh viễn ghi chú');
    }
  }, [fetchData]);

  const isTrashFilter = filter === 'hidden';
  const startEditNote = useCallback((note: NoteItem) => {
    setEditingNote(note);
    setEditForm({ content: note.content, note_type: note.note_type });
  }, []);

  const cancelEditNote = useCallback(() => {
    setEditingNote(null);
    setEditForm({ content: '', note_type: 'normal' });
  }, []);

  const saveEditNote = useCallback(async () => {
    if (!editingNote || !editForm.content.trim()) {
      toast.error('Nội dung ghi chú không được để trống');
      return;
    }
    try {
      await axios.put('/api/benh-nhan/notes', {
        id: editingNote.id,
        content: editForm.content.trim(),
        note_type: editForm.note_type,
      });
      toast.success('Đã cập nhật ghi chú');
      cancelEditNote();
      fetchData();
    } catch {
      toast.error('Lỗi cập nhật ghi chú');
    }
  }, [editingNote, editForm, fetchData, cancelEditNote]);

  return (
    <ProtectedRoute>
      <FeatureGate feature="crm">
        <div className="min-h-screen bg-[#f8fafc] pb-10">
          <PageHeader
            stats={{ total: notes.filter(n => !n.deleted_at).length, important: importantCount, today: 0 }}
          />
          <div className="max-w-6xl mx-auto px-2 md:px-6">
            <SearchToolbar
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
            />
            <div className="mt-6">
              <div className="hidden lg:block">
                <NotesDesktopTable
                  notes={filteredNotes}
                  isTrashView={isTrashFilter}
                  onEdit={startEditNote}
                  onDelete={archiveNote}
                  onRestore={restoreNote}
                  onDeletePermanent={deleteNotePermanently}
                />
              </div>
              <div className="block lg:hidden">
                <NotesMobileCards
                  notes={filteredNotes}
                  isTrashView={isTrashFilter}
                  onEdit={startEditNote}
                  onDelete={archiveNote}
                  onRestore={restoreNote}
                  onDeletePermanent={deleteNotePermanently}
                />
              </div>
              {filteredNotes.length === 0 && <EmptyState />}
            </div>
          </div>
          <NoteDialog
            open={!!editingNote}
            note={editingNote}
            form={editForm}
            setForm={setEditForm}
            onClose={cancelEditNote}
            onSave={saveEditNote}
          />
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}

// --- COMPONENTS ---

function PageHeader({ stats }: { stats: { total: number; important: number; today: number } }) {
  return (
    <div className="bg-[#f8fafc] border-b border-[#e2e8f0]">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-2 md:px-6 py-6">
        <div>
          <h1 className="text-3xl font-bold text-[#0f172a] tracking-tight">Quản lý ghi chú khách hàng</h1>
          <p className="text-sm text-[#64748b] mt-1">Theo dõi lưu ý, cảnh báo & chăm sóc bệnh nhân</p>
        </div>
        <div className="flex gap-3">
          <StatsCard label="Tổng ghi chú" value={stats.total} />
          <StatsCard label="Quan trọng" value={stats.important} color="red" />
          <StatsCard label="Hôm nay" value={stats.today} color="blue" />
        </div>
      </div>
    </div>
  );
}

function StatsCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorMap: any = {
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return (
    <div className={clsx('rounded-xl px-3 py-2 min-w-[80px] text-center', color ? colorMap[color] : 'bg-white text-[#0f172a] border border-[#e2e8f0]')}>{value}<div className="text-xs font-medium mt-0.5">{label}</div></div>
  );
}

function SearchToolbar({ search, setSearch, filter, setFilter }: { search: string; setSearch: (v: string) => void; filter: string; setFilter: (v: any) => void }) {
  const chips = [
    { key: 'all', label: 'Tất cả' },
    { key: 'important', label: 'Quan trọng' },
    { key: 'normal', label: 'Bình thường' },
    { key: 'hidden', label: 'Thùng rác' },
  ];
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-6">
      <div className="flex-1 flex items-center bg-white rounded-xl shadow-sm border border-[#e2e8f0] px-4 h-11">
        <Search className="w-5 h-5 text-[#64748b] mr-2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo tên, SĐT hoặc nội dung ghi chú..."
          className="flex-1 bg-transparent outline-none text-base text-[#0f172a] placeholder-[#94a3b8]"
        />
      </div>
      <div className="flex gap-2 flex-wrap mt-2 md:mt-0">
        {chips.map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={clsx(
              'px-3 h-9 rounded-full text-sm font-medium border transition',
              filter === chip.key
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-white text-[#64748b] border-[#e2e8f0] hover:bg-[#f1f5f9]'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotesDesktopTable({
  notes,
  isTrashView,
  onEdit,
  onDelete,
  onRestore,
  onDeletePermanent,
}: {
  notes: NoteItem[];
  isTrashView: boolean;
  onEdit: (n: NoteItem) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => void;
  onDeletePermanent: (id: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-[#e2e8f0] overflow-x-auto w-full">
      <table className="min-w-[1000px] w-full text-sm border-collapse">
        <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
          <tr className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">
            <th className="px-4 py-3 min-w-[40px] text-left">STT</th>
            <th className="px-4 py-3 min-w-[180px] text-left">Bệnh nhân</th>
            <th className="px-4 py-3 min-w-[120px] text-left">Loại</th>
            <th className="px-4 py-3 min-w-[220px] text-left">Nội dung</th>
            <th className="px-4 py-3 min-w-[120px] text-left">Thời gian</th>
            <th className="px-4 py-3 min-w-[100px] text-center">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n, idx) => (
            <tr
              key={n.id}
              className={clsx(
                n.note_type === 'important' && 'border-l-4 border-red-400 bg-red-50/40',
                'border-b border-[#e2e8f0] group transition-all duration-150 hover:bg-[#f1f5f9] hover:shadow-sm'
              )}
            >
              <td className="px-4 py-2 text-[#64748b] align-middle">{idx + 1}</td>
              <td className="px-4 py-2 align-middle">
                <div className="flex items-center gap-3 min-w-0">
                  <User className="w-8 h-8 rounded-full bg-[#f1f5f9] text-[#64748b] p-1 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[#0f172a] flex items-center gap-1 min-w-0 truncate">
                      <span className="truncate">{n.patient?.ten || 'Không tên'}</span>
                      {n.note_type === 'important' && <AlertTriangle className="w-4 h-4 text-red-500 ml-1 flex-shrink-0" />}
                    </div>
                    <div className="text-xs text-[#64748b] mt-0.5 truncate">
                      {n.patient?.namsinh ? n.patient.namsinh : ''}
                      {n.patient?.namsinh && n.patient?.dienthoai ? ' • ' : ''}
                      {n.patient?.dienthoai || ''}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2 align-middle"><NoteBadge type={n.note_type} /></td>
              <td className="px-4 py-2 align-middle">
                <div className="line-clamp-2 text-[15px] text-[#0f172a] font-normal leading-snug truncate">
                  {n.content}
                </div>
              </td>
              <td className="px-4 py-2 align-middle">
                <div className="text-xs text-[#64748b] leading-tight truncate">
                  {formatTime(n.created_at)}<br />
                  {formatDate(n.created_at)}
                </div>
              </td>
              <td className="px-4 py-2 align-middle text-center">
                <NoteActions
                  isTrashView={isTrashView}
                  onEdit={() => onEdit(n)}
                  onDelete={() => onDelete(n.id)}
                  onRestore={() => onRestore(n.id)}
                  onDeletePermanent={() => onDeletePermanent(n.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotesMobileCards({
  notes,
  isTrashView,
  onEdit,
  onDelete,
  onRestore,
  onDeletePermanent,
}: {
  notes: NoteItem[];
  isTrashView: boolean;
  onEdit: (n: NoteItem) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => void;
  onDeletePermanent: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      {notes.map((n, idx) => (
        <div
          key={n.id}
          className={clsx(
            'rounded-2xl bg-white shadow-sm border border-[#e2e8f0] p-4 flex flex-col gap-2 transition-all duration-150',
            n.note_type === 'important' && 'border-l-4 border-red-400 bg-red-50/40',
            'hover:shadow-md'
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <NoteBadge type={n.note_type} />
            <div className="font-semibold text-[#0f172a] flex-1">
              {n.patient?.ten || 'Không tên'}
              {n.note_type === 'important' && <AlertTriangle className="w-4 h-4 text-red-500 ml-1 inline" />}
            </div>
          </div>
          <div className="text-xs text-[#64748b]">
            {n.patient?.namsinh ? n.patient.namsinh : ''}
            {n.patient?.namsinh && n.patient?.dienthoai ? ' • ' : ''}
            {n.patient?.dienthoai || ''}
          </div>
          <div className="line-clamp-2 text-[15px] text-[#0f172a] font-normal leading-snug">
            {n.content}
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="text-xs text-[#64748b]">
              {formatTime(n.created_at)}<br />
              {formatDate(n.created_at)}
            </div>
            <NoteActions
              isTrashView={isTrashView}
              onEdit={() => onEdit(n)}
              onDelete={() => onDelete(n.id)}
              onRestore={() => onRestore(n.id)}
              onDeletePermanent={() => onDeletePermanent(n.id)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoteBadge({ type }: { type: NoteType }) {
  const map: any = {
    important: { label: 'Quan trọng', class: 'bg-red-100 text-red-700' },
    reminder: { label: 'Nhắc gọi', class: 'bg-yellow-100 text-yellow-700' },
    normal: { label: 'Bình thường', class: 'bg-green-100 text-green-700' },
  };
  const info = map[type] || map.normal;
  return <span className={clsx('px-3 py-1 rounded-full text-xs font-semibold', info.class)}>{info.label}</span>;
}

function NoteActions({
  isTrashView,
  onEdit,
  onDelete,
  onRestore,
  onDeletePermanent,
}: {
  isTrashView: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onDeletePermanent: () => void;
}) {
  if (isTrashView) {
    return (
      <div className="flex gap-1 justify-end">
        <button className="p-2 rounded-lg hover:bg-[#ecfeff] text-cyan-700 transition" title="Khôi phục" onClick={onRestore}>
          <RotateCcw className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-lg hover:bg-[#fee2e2] text-red-500 transition" title="Xóa vĩnh viễn" onClick={onDeletePermanent}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <button className="p-2 rounded-lg hover:bg-[#f1f5f9] text-[#64748b] transition" title="Sửa" onClick={onEdit}><Pencil className="w-4 h-4" /></button>
      <button className="p-2 rounded-lg hover:bg-[#fee2e2] text-red-500 transition" title="Xóa" onClick={onDelete}><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <img src="/empty-state.svg" alt="empty" className="w-32 h-32 mb-4 opacity-80" />
      <div className="text-lg font-semibold text-[#64748b]">Chưa có ghi chú nào phù hợp</div>
      <div className="text-sm text-[#94a3b8] mt-1">Hãy thêm ghi chú mới hoặc thay đổi bộ lọc tìm kiếm.</div>
    </div>
  );
}

function NoteDialog({ open, note, form, setForm, onClose, onSave }: any) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa ghi chú</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700">Nội dung</label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="mt-1 rounded-md"
              rows={4}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Loại ghi chú</label>
            <select
              value={form.note_type}
              onChange={(e) => setForm({ ...form, note_type: e.target.value })}
              className="mt-1 h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
            >
              <option value="normal">Bình thường</option>
              <option value="important">Quan trọng</option>
              <option value="reminder">Nhắc gọi</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button type="button" variant="outline" onClick={onClose} className="h-8 rounded-md px-3">
            Hủy
          </Button>
          <Button type="button" onClick={onSave} className="h-8 rounded-md px-3">
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatTime(dt: string) {
  const d = new Date(dt);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(dt: string) {
  const d = new Date(dt);
  return d.toLocaleDateString('vi-VN');
}
