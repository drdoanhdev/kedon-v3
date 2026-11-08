import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { BenhNhan, NotesViewMode, PatientNote } from '@/lib/patient/types';

export type NoteFormState = { content: string; note_type: 'important' | 'normal' };

export type PatientNotesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notesPatient: BenhNhan | null;
  loadingPatientNotes: boolean;
  visibleNotes: PatientNote[];
  notesViewMode: NotesViewMode;
  setNotesViewMode: (mode: NotesViewMode) => void;
  setIncludeDeletedNotes: (value: boolean) => void;
  noteForm: NoteFormState;
  setNoteForm: React.Dispatch<React.SetStateAction<NoteFormState>>;
  editingNoteId: number | null;
  setEditingNoteId: (id: number | null) => void;
  noteEditForm: NoteFormState;
  setNoteEditForm: React.Dispatch<React.SetStateAction<NoteFormState>>;
  onCreateNote: () => void;
  onStartEditNote: (note: PatientNote) => void;
  onSaveEditNote: () => void;
  onDeleteNote: (id: number) => void;
  onRestoreNote: (id: number) => void;
  onPurgeNote: (id: number) => void;
};

export function PatientNotesDialog({
  open,
  onOpenChange,
  notesPatient,
  loadingPatientNotes,
  visibleNotes,
  notesViewMode,
  setNotesViewMode,
  setIncludeDeletedNotes,
  noteForm,
  setNoteForm,
  editingNoteId,
  setEditingNoteId,
  noteEditForm,
  setNoteEditForm,
  onCreateNote,
  onStartEditNote,
  onSaveEditNote,
  onDeleteNote,
  onRestoreNote,
  onPurgeNote,
}: PatientNotesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden [&>button]:hidden">
        <div className="border-b border-gray-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{notesPatient?.ten || ''}</p>
              <p className="text-sm text-gray-500">Ghi chú bệnh nhân</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={notesViewMode}
                onChange={(e) => {
                  const mode = e.target.value as NotesViewMode;
                  setNotesViewMode(mode);
                  if (mode === 'trash') setIncludeDeletedNotes(true);
                }}
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700"
              >
                <option value="active">Đang hoạt động</option>
                <option value="all">Tất cả</option>
                <option value="trash">Thùng rác</option>
              </select>
              <button
                type="button"
                className="h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => onOpenChange(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>

        {loadingPatientNotes ? (
          <div className="px-5 py-8 text-sm text-gray-500">Đang tải dữ liệu...</div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">Danh sách ghi chú</h3>
              <span className="text-xs text-gray-500">{visibleNotes.length} mục</span>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {visibleNotes.length === 0 && (
                <p className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">
                  Không có ghi chú trong bộ lọc hiện tại.
                </p>
              )}
              {visibleNotes.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-lg border px-3 py-3 ${a.deleted_at ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      {new Date(a.created_at).toLocaleTimeString('vi-VN')} - {new Date(a.created_at).toLocaleDateString('vi-VN')}
                    </p>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        a.note_type === 'important'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-gray-100 text-gray-700 border border-gray-200'
                      }`}
                    >
                      {a.note_type === 'important' ? 'Quan trọng' : 'Thông thường'}
                    </span>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{a.content}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!a.deleted_at ? (
                      <>
                        <Button type="button" variant="outline" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => onStartEditNote(a)}>Sửa</Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 rounded-md px-3 text-xs text-red-700 border-red-300 hover:bg-red-50" onClick={() => onDeleteNote(a.id)}>Xóa</Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" variant="outline" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => onRestoreNote(a.id)}>Khôi phục</Button>
                        <Button type="button" variant="destructive" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => onPurgeNote(a.id)}>Xóa hẳn</Button>
                      </>
                    )}
                  </div>

                  {editingNoteId === a.id && (
                    <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                      <Textarea
                        value={noteEditForm.content}
                        onChange={(e) => setNoteEditForm((prev) => ({ ...prev, content: e.target.value }))}
                        placeholder="Nội dung"
                        className="min-h-[84px] rounded-md"
                      />
                      <select
                        value={noteEditForm.note_type}
                        onChange={(e) => setNoteEditForm((prev) => ({ ...prev, note_type: e.target.value as 'important' | 'normal' }))}
                        className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                      >
                        <option value="important">Quan trọng</option>
                        <option value="normal">Thông thường</option>
                      </select>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={onSaveEditNote}>Lưu</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-md px-3 text-xs" onClick={() => setEditingNoteId(null)}>Hủy</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
              <p className="text-sm font-medium text-gray-800">Tạo ghi chú mới</p>
              <select
                value={noteForm.note_type}
                onChange={(e) => setNoteForm((prev) => ({ ...prev, note_type: e.target.value as 'important' | 'normal' }))}
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="important">Quan trọng</option>
                <option value="normal">Thông thường</option>
              </select>
              <Textarea
                value={noteForm.content}
                onChange={(e) => setNoteForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Nhập nội dung ghi chú"
                className="min-h-[110px] rounded-md"
              />
              <Button type="button" className="h-10 w-full rounded-md" onClick={onCreateNote}>Lưu ghi chú</Button>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-gray-200 px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-md px-4">
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
