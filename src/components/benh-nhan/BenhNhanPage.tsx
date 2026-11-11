'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useBranch } from '@/contexts/BranchContext';
import type { BenhNhan } from '@/lib/patient/types';
import { PatientFormDialog } from '@/components/benh-nhan/PatientFormDialog';
import { PatientNotesDialog } from '@/components/benh-nhan/PatientNotesDialog';
import { MergePatientsDialog } from '@/components/benh-nhan/MergePatientsDialog';
import { PatientListMobile } from '@/components/benh-nhan/PatientListMobile';
import { PatientListDesktop } from '@/components/benh-nhan/PatientListDesktop';
import { usePatientList } from '@/components/benh-nhan/usePatientList';
import { usePatientRecord } from '@/components/benh-nhan/usePatientRecord';
import { usePatientNotes } from '@/components/benh-nhan/usePatientNotes';
import { usePatientMerge } from '@/components/benh-nhan/usePatientMerge';
import { usePatientSwipe } from '@/components/benh-nhan/usePatientSwipe';
import { useBenhNhanUrlParams } from '@/components/benh-nhan/useBenhNhanUrlParams';
import { useBenhNhanActions } from '@/components/benh-nhan/useBenhNhanActions';

export default function BenhNhanPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { isMultiBranch } = useBranch();

  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<BenhNhan>({
    ten: '',
    namsinh: '',
    gioitinh: '',
    dienthoai: '',
    diachi: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tenRef = useRef<HTMLInputElement | null>(null);
  const namsinhRef = useRef<HTMLInputElement | null>(null);
  const dienthoaiRef = useRef<HTMLInputElement | null>(null);
  const diachiRef = useRef<HTMLInputElement | null>(null);
  const initialAddFocusRef = useRef<'ten' | 'namsinh' | 'dienthoai' | 'diachi' | null>(null);

  const list = usePatientList();
  const {
    benhNhans, setBenhNhans, search, setSearch, debouncedSearch,
    currentPage, setCurrentPage, rowsPerPage, setRowsPerPage,
    setTotal, totalPages, sortConfig, filtered, paginated, handleSort, renderSortIndicator,
  } = list;

  const findPatientById = useCallback(
    (benhNhanId: number) => benhNhans.find((bn) => bn.id === benhNhanId),
    [benhNhans]
  );

  const buildActivityPatient = useCallback((bn: BenhNhan | undefined) => {
    if (!bn?.id) return null;
    return {
      id: bn.id,
      ten: bn.ten || `BN #${bn.id}`,
      dienthoai: bn.dienthoai || undefined,
      diachi: bn.diachi || undefined,
      namsinh: bn.namsinh || undefined,
    };
  }, []);

  const record = usePatientRecord({ isMultiBranch, findPatientById, buildActivityPatient });
  const notes = usePatientNotes({
    confirm,
    onNotesChanged: (id) => { void record.loadHistoryNotesForTab(id); },
  });
  const swipe = usePatientSwipe();
  const merge = usePatientMerge({
    openFormDialog: open,
    currentPage,
    rowsPerPage,
    debouncedSearch,
    setBenhNhans,
    setTotal,
    confirm,
    paginated,
  });

  useBenhNhanUrlParams({
    router,
    search,
    setSearch,
    setCurrentPage,
    setOpenSwipePatientId: swipe.setOpenSwipePatientId,
    setSelectedBenhNhanId: record.setSelectedBenhNhanId,
    clearRecord: record.clearRecord,
    setActiveTab: record.setActiveTab,
    setIsEditing,
    setForm,
    setOpen,
    initialAddFocusRef,
    benhNhans,
    fetchDonThuoc: record.fetchDonThuoc,
    loadHistoryNotesForTab: record.loadHistoryNotesForTab,
    findPatientById,
  });

  const actions = useBenhNhanActions({
    router,
    confirm,
    search,
    form,
    isEditing,
    isSubmitting,
    setIsSubmitting,
    setForm,
    setIsEditing,
    setOpen,
    currentPage,
    rowsPerPage,
    debouncedSearch,
    setBenhNhans,
    setTotal,
    selectedBenhNhanId: record.selectedBenhNhanId,
    setSelectedBenhNhanId: record.setSelectedBenhNhanId,
    setActiveTab: record.setActiveTab,
    clearRecord: record.clearRecord,
    fetchDonThuoc: record.fetchDonThuoc,
    loadHistoryNotesForTab: record.loadHistoryNotesForTab,
    findPatientById,
    buildActivityPatient,
    setOpenSwipePatientId: swipe.setOpenSwipePatientId,
    initialAddFocusRef,
  });

  useEffect(() => {
    if (typeof document !== 'undefined') document.title = 'Bệnh nhân';
  }, []);

  useEffect(() => {
    if (open && !isEditing) {
      const id = window.setTimeout(() => {
        const target = initialAddFocusRef.current ?? 'ten';
        const targetRef =
          target === 'namsinh' ? namsinhRef :
          target === 'dienthoai' ? dienthoaiRef :
          target === 'diachi' ? diachiRef :
          tenRef;
        targetRef.current?.focus();
        try { targetRef.current?.select?.(); } catch { /* ignore */ }
        initialAddFocusRef.current = null;
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [open, isEditing]);

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    setCurrentPage(1);
    record.setSelectedBenhNhanId(null);
    record.clearRecord();
  }, [setSearch, setCurrentPage, record]);

  const onListPageChange = useCallback((page: number) => {
    setCurrentPage(page);
    record.setSelectedBenhNhanId(null);
    record.clearRecord();
  }, [setCurrentPage, record]);

  const onRowsPerPageChange = useCallback((rows: number) => {
    setRowsPerPage(rows);
    setCurrentPage(1);
  }, [setRowsPerPage, setCurrentPage]);

  const startIndex = (currentPage - 1) * rowsPerPage;
  const filteredCount = useMemo(() => filtered.length, [filtered]);

  const listShared = {
    search,
    onSearchChange,
    paginated,
    filteredCount,
    selectedForMerge: merge.selectedForMerge,
    onMergePatients: merge.handleMergePatients,
    onCreatePatientFromSearch: actions.openCreatePatientFromSearch,
    onToggleSelectForMerge: merge.toggleSelectForMerge,
    onEditPatient: actions.handleEdit,
    onOpenPrescription: actions.openPrescriptionFromList,
    onSelectPatient: actions.handleSelectBenhNhan,
    selectedBenhNhanId: record.selectedBenhNhanId,
    activeTab: record.activeTab,
    onHistoryTabChange: record.handleHistoryTabChange,
    isMultiBranch,
    filteredDonThuocs: record.filteredDonThuocs,
    donKinhs: record.donKinhs,
    henKhams: record.henKhams,
    historyNotesByPatient: record.historyNotesByPatient,
    loadingHistoryPatientId: record.loadingHistoryPatientId,
    chainHistory: record.chainHistory,
    loadingChainHistory: record.loadingChainHistory,
    openPatientNotesManager: notes.openPatientNotesManager,
    onSelectFamilyMember: actions.handleOpenFamilyMember,
    currentPage,
    totalPages,
    onListPageChange,
    rowsPerPage,
    onRowsPerPageChange,
  };

  return (
    <ProtectedRoute>
      <Head>
        <meta name="theme-color" content="#3a7efb" key="theme-color" />
        <meta name="msapplication-navbutton-color" content="#3a7efb" key="msapplication-navbutton-color" />
      </Head>
      <div className="px-2 pb-2 pt-0 lg:p-4">
        <PatientListMobile
          {...listShared}
          openSwipePatientId={swipe.openSwipePatientId}
          draggingPatientId={swipe.draggingPatientId}
          dragOffsetPx={swipe.dragOffsetPx}
          onCloseSwipe={() => swipe.setOpenSwipePatientId(null)}
          onSwipeStart={swipe.handleSwipeStart}
          onSwipeMove={swipe.handleSwipeMove}
          onSwipeEnd={swipe.handleSwipeEnd}
        />
        <PatientListDesktop
          {...listShared}
          onSort={handleSort}
          renderSortIndicator={renderSortIndicator}
          sortConfig={sortConfig}
          startIndex={startIndex}
          allSelectedCurrentPage={merge.allSelectedCurrentPage}
          onToggleSelectAllCurrentPage={merge.toggleSelectAllCurrentPage}
        />
        <PatientFormDialog
          open={open}
          onOpenChange={setOpen}
          isEditing={isEditing}
          form={form}
          setForm={setForm}
          isSubmitting={isSubmitting}
          onSubmit={actions.handleSubmit}
          onDelete={actions.handleDelete}
          confirm={confirm}
          tenRef={tenRef}
          namsinhRef={namsinhRef}
          dienthoaiRef={dienthoaiRef}
          diachiRef={diachiRef}
        />
        <PatientNotesDialog
          open={notes.openPatientNotesDialog}
          onOpenChange={notes.setOpenPatientNotesDialog}
          notesPatient={notes.notesPatient}
          loadingPatientNotes={notes.loadingPatientNotes}
          visibleNotes={notes.visibleNotes}
          notesViewMode={notes.notesViewMode}
          setNotesViewMode={notes.setNotesViewMode}
          setIncludeDeletedNotes={notes.setIncludeDeletedNotes}
          noteForm={notes.noteForm}
          setNoteForm={notes.setNoteForm}
          editingNoteId={notes.editingNoteId}
          setEditingNoteId={notes.setEditingNoteId}
          noteEditForm={notes.noteEditForm}
          setNoteEditForm={notes.setNoteEditForm}
          onCreateNote={notes.createPatientNote}
          onStartEditNote={notes.startEditNote}
          onSaveEditNote={notes.saveEditNote}
          onDeleteNote={notes.deleteNote}
          onRestoreNote={notes.restoreNote}
          onPurgeNote={notes.purgeNote}
        />
        <MergePatientsDialog
          open={merge.showMergeDialog}
          onOpenChange={merge.setShowMergeDialog}
          patients={benhNhans}
          selectedForMerge={merge.selectedForMerge}
          mainPatientId={merge.mainPatientId}
          setMainPatientId={merge.setMainPatientId}
          onConfirm={merge.handleConfirmMerge}
        />
      </div>
    </ProtectedRoute>
  );
}
