import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  createPatientNoteApi,
  fetchPatientNotes,
  hardDeletePatientNoteApi,
  restorePatientNoteApi,
  softDeletePatientNoteApi,
  updatePatientNoteApi,
} from '@/lib/patient/api';
import type { BenhNhan, NotesViewMode, PatientNote } from '@/lib/patient/types';

export function usePatientNotes(options: {
  confirm: (message: string) => Promise<boolean>;
  onNotesChanged?: (benhnhanid: number) => void;
}) {
  const { confirm, onNotesChanged } = options;

  const [openPatientNotesDialog, setOpenPatientNotesDialog] = useState(false);
  const [notesPatient, setNotesPatient] = useState<BenhNhan | null>(null);
  const [patientNotes, setPatientNotes] = useState<PatientNote[]>([]);
  const [loadingPatientNotes, setLoadingPatientNotes] = useState(false);
  const [noteForm, setNoteForm] = useState<{ content: string; note_type: 'important' | 'normal' }>({
    content: '',
    note_type: 'normal',
  });
  const [includeDeletedNotes, setIncludeDeletedNotes] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteEditForm, setNoteEditForm] = useState<{ content: string; note_type: 'important' | 'normal' }>({
    content: '',
    note_type: 'normal',
  });
  const [notesViewMode, setNotesViewMode] = useState<NotesViewMode>('active');

  const loadPatientNotes = useCallback(async (benhnhanid: number, options?: { includeDeleted?: boolean }) => {
    if (!benhnhanid) return;
    const includeDeleted = options?.includeDeleted ?? includeDeletedNotes;
    setLoadingPatientNotes(true);
    try {
      setPatientNotes(await fetchPatientNotes(benhnhanid, includeDeleted));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi tải ghi chú: ${message}`);
      setPatientNotes([]);
    } finally {
      setLoadingPatientNotes(false);
    }
  }, [includeDeletedNotes]);

  const openPatientNotesManager = useCallback((bn: BenhNhan) => {
    if (!bn?.id) return;
    setNotesPatient(bn);
    setOpenPatientNotesDialog(true);
    setNoteForm({ content: '', note_type: 'normal' });
    setEditingNoteId(null);
    loadPatientNotes(bn.id, { includeDeleted: includeDeletedNotes });
  }, [includeDeletedNotes, loadPatientNotes]);

  useEffect(() => {
    if (!openPatientNotesDialog || !notesPatient?.id) return;
    loadPatientNotes(notesPatient.id, { includeDeleted: includeDeletedNotes });
  }, [includeDeletedNotes, openPatientNotesDialog, notesPatient?.id, loadPatientNotes]);

  const createPatientNote = useCallback(async () => {
    if (!notesPatient?.id) return;
    if (!noteForm.content.trim()) {
      toast.error('Vui lòng nhập nội dung ghi chú');
      return;
    }
    try {
      await createPatientNoteApi({
        benhnhanid: notesPatient.id,
        content: noteForm.content,
        note_type: noteForm.note_type,
      });
      toast.success('Đã thêm ghi chú');
      setNoteForm({ content: '', note_type: 'normal' });
      loadPatientNotes(notesPatient.id);
      onNotesChanged?.(notesPatient.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi tạo ghi chú: ${message}`);
    }
  }, [noteForm, notesPatient, loadPatientNotes, onNotesChanged]);

  const startEditNote = useCallback((note: PatientNote) => {
    setEditingNoteId(note.id);
    setNoteEditForm({
      content: note.content || '',
      note_type: note.note_type,
    });
  }, []);

  const saveEditNote = useCallback(async () => {
    if (!editingNoteId || !notesPatient?.id) return;
    try {
      await updatePatientNoteApi({
        id: editingNoteId,
        content: noteEditForm.content,
        note_type: noteEditForm.note_type,
      });
      toast.success('Đã cập nhật ghi chú');
      setEditingNoteId(null);
      loadPatientNotes(notesPatient.id);
      onNotesChanged?.(notesPatient.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi cập nhật ghi chú: ${message}`);
    }
  }, [editingNoteId, notesPatient, loadPatientNotes, noteEditForm, onNotesChanged]);

  const deleteNote = useCallback(async (id: number) => {
    if (!notesPatient?.id) return;
    const ok = await confirm('Bạn có chắc muốn chuyển ghi chú này vào thùng rác?');
    if (!ok) return;
    try {
      await softDeletePatientNoteApi(id);
      toast.success('Đã chuyển ghi chú vào thùng rác');
      loadPatientNotes(notesPatient.id);
      onNotesChanged?.(notesPatient.id);
    } catch {
      toast.error('Lỗi xóa ghi chú');
    }
  }, [confirm, notesPatient, loadPatientNotes, onNotesChanged]);

  const restoreNote = useCallback(async (id: number) => {
    if (!notesPatient?.id) return;
    try {
      await restorePatientNoteApi(id);
      toast.success('Đã khôi phục ghi chú');
      loadPatientNotes(notesPatient.id);
      onNotesChanged?.(notesPatient.id);
    } catch {
      toast.error('Lỗi khôi phục ghi chú');
    }
  }, [notesPatient, loadPatientNotes, onNotesChanged]);

  const purgeNote = useCallback(async (id: number) => {
    if (!notesPatient?.id) return;
    const ok = await confirm('Bạn sắp xóa vĩnh viễn ghi chú này. Hành động không thể hoàn tác. Tiếp tục?');
    if (!ok) return;
    const verify = window.prompt('Nhập XOA VINH VIEN để xác nhận:', '');
    if ((verify || '').trim().toUpperCase() !== 'XOA VINH VIEN') return;

    try {
      await hardDeletePatientNoteApi(id);
      toast.success('Đã xóa vĩnh viễn ghi chú');
      loadPatientNotes(notesPatient.id);
      onNotesChanged?.(notesPatient.id);
    } catch {
      toast.error('Lỗi xóa vĩnh viễn ghi chú');
    }
  }, [confirm, loadPatientNotes, notesPatient, onNotesChanged]);

  const visibleNotes = useMemo(() => {
    if (notesViewMode === 'trash') return patientNotes.filter((a) => Boolean(a.deleted_at));
    if (notesViewMode === 'all') return patientNotes;
    return patientNotes.filter((a) => !a.deleted_at);
  }, [notesViewMode, patientNotes]);

  return {
    openPatientNotesDialog,
    setOpenPatientNotesDialog,
    notesPatient,
    patientNotes,
    loadingPatientNotes,
    noteForm,
    setNoteForm,
    includeDeletedNotes,
    setIncludeDeletedNotes,
    editingNoteId,
    setEditingNoteId,
    noteEditForm,
    setNoteEditForm,
    notesViewMode,
    setNotesViewMode,
    loadPatientNotes,
    openPatientNotesManager,
    createPatientNote,
    startEditNote,
    saveEditNote,
    deleteNote,
    restoreNote,
    purgeNote,
    visibleNotes,
  };
}
