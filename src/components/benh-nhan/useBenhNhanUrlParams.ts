import { useEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import type { NextRouter } from 'next/router';
import type { BenhNhan } from '@/lib/patient/types';
import { buildActivityPatientRef, pushRecentActivity } from '@/lib/recentActivity';

type FocusField = 'ten' | 'namsinh' | 'dienthoai' | 'diachi';

export function useBenhNhanUrlParams(options: {
  router: NextRouter;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setOpenSwipePatientId: Dispatch<SetStateAction<number | null>>;
  setSelectedBenhNhanId: Dispatch<SetStateAction<number | null>>;
  clearRecord: () => void;
  setActiveTab: Dispatch<SetStateAction<string>>;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  setForm: Dispatch<SetStateAction<BenhNhan>>;
  setOpen: Dispatch<SetStateAction<boolean>>;
  initialAddFocusRef: MutableRefObject<FocusField | null>;
  benhNhans: BenhNhan[];
  fetchDonThuoc: (id: number) => Promise<void>;
  loadHistoryNotesForTab: (id: number) => Promise<void>;
  findPatientById: (id: number) => BenhNhan | undefined;
}) {
  const {
    router,
    search,
    setSearch,
    setCurrentPage,
    setOpenSwipePatientId,
    setSelectedBenhNhanId,
    clearRecord,
    setActiveTab,
    setIsEditing,
    setForm,
    setOpen,
    initialAddFocusRef,
    benhNhans,
    fetchDonThuoc,
    loadHistoryNotesForTab,
    findPatientById,
  } = options;

  const pendingFocusPatientIdRef = useRef<number | null>(null);
  const pendingOpenEditDialogRef = useRef(false);

  // FAB: ?search=&focusId=
  useEffect(() => {
    if (!router.isReady || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    const normalizedSearch = searchParam?.trim() ?? '';
    const focusRaw = params.get('focusId');

    if (searchParam !== null && normalizedSearch !== search) {
      setSearch(normalizedSearch);
      setCurrentPage(1);
      setOpenSwipePatientId(null);
      setSelectedBenhNhanId(null);
      clearRecord();
      setActiveTab('don-thuoc');
    }

    if (focusRaw) {
      const parsedFocusId = Number(focusRaw);
      if (Number.isFinite(parsedFocusId) && parsedFocusId > 0) {
        pendingFocusPatientIdRef.current = parsedFocusId;
      }
    }

    pendingOpenEditDialogRef.current = params.get('edit') === '1';
  }, [router.isReady, router.asPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?new=1&quick_*
  useEffect(() => {
    if (!router.isReady || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('new') !== '1') return;

    const quickName = params.get('quick_name')?.trim() ?? '';
    const quickDob = params.get('quick_namsinh')?.trim() ?? '';
    const quickPhone = params.get('quick_phone')?.trim() ?? '';
    const quickAddress = params.get('quick_diachi')?.trim() ?? '';

    setIsEditing(false);
    setForm({
      ten: quickName,
      namsinh: quickDob,
      gioitinh: '',
      dienthoai: quickPhone,
      diachi: quickAddress,
    });

    if (!quickName) {
      initialAddFocusRef.current = 'ten';
    } else if (!quickDob) {
      initialAddFocusRef.current = 'namsinh';
    } else if (!quickPhone) {
      initialAddFocusRef.current = 'dienthoai';
    } else {
      initialAddFocusRef.current = 'diachi';
    }

    setOpen(true);

    params.delete('new');
    params.delete('quick_name');
    params.delete('quick_namsinh');
    params.delete('quick_phone');
    params.delete('quick_diachi');
    const queryString = params.toString();
    const nextUrl = queryString ? `${router.pathname}?${queryString}` : router.pathname;
    router.replace(nextUrl, undefined, { shallow: true });
  }, [router.isReady, router.pathname, router.asPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply focusId after list loads
  useEffect(() => {
    if (!router.isReady || typeof window === 'undefined') return;

    const focusId = pendingFocusPatientIdRef.current;
    if (!focusId) return;

    const targetPatient = benhNhans.find((bn) => bn.id === focusId);
    if (!targetPatient) return;

    const shouldOpenEdit = pendingOpenEditDialogRef.current;
    pendingOpenEditDialogRef.current = false;

    setSelectedBenhNhanId(focusId);
    setActiveTab('don-thuoc');
    fetchDonThuoc(focusId);
    loadHistoryNotesForTab(focusId);

    const patient = buildActivityPatientRef(findPatientById(focusId));
    if (patient) {
      pushRecentActivity({
        action: 'quick_history_open',
        patient,
        source: 'benh-nhan_focus',
      });
    }

    pendingFocusPatientIdRef.current = null;

    if (shouldOpenEdit) {
      setForm({ ...targetPatient, gioitinh: targetPatient.gioitinh || '' });
      setIsEditing(true);
      setOpen(true);
    }

    const params = new URLSearchParams(window.location.search);
    const hadFocus = params.has('focusId');
    const hadEdit = params.has('edit');
    if (hadFocus) params.delete('focusId');
    if (hadEdit) params.delete('edit');
    if (hadFocus || hadEdit) {
      const queryString = params.toString();
      const nextUrl = queryString ? `${router.pathname}?${queryString}` : router.pathname;
      router.replace(nextUrl, undefined, { shallow: true });
    }
  }, [benhNhans, fetchDonThuoc, findPatientById, loadHistoryNotesForTab, router.isReady, router.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pendingFocusPatientIdRef, pendingOpenEditDialogRef };
}
