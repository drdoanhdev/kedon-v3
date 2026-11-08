import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { NextRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import { calcPatientAge } from '@/lib/patient/age';
import { createBenhNhan, deleteBenhNhan, updateBenhNhan } from '@/lib/patient/api';
import { parsePatientSeed } from '@/lib/patientSeed';
import { pushRecentActivity } from '@/lib/recentActivity';
import type { BenhNhan } from '@/lib/patient/types';

type ActivityPatient = {
  id: number;
  ten: string;
  dienthoai?: string;
  diachi?: string;
  namsinh?: string;
} | null;

export function useBenhNhanActions(options: {
  router: NextRouter;
  confirm: (message: string) => Promise<boolean>;
  search: string;
  form: BenhNhan;
  isEditing: boolean;
  isSubmitting: boolean;
  setIsSubmitting: Dispatch<SetStateAction<boolean>>;
  setForm: Dispatch<SetStateAction<BenhNhan>>;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  setOpen: Dispatch<SetStateAction<boolean>>;
  currentPage: number;
  rowsPerPage: number;
  debouncedSearch: string;
  setBenhNhans: Dispatch<SetStateAction<BenhNhan[]>>;
  setTotal: Dispatch<SetStateAction<number>>;
  selectedBenhNhanId: number | null;
  setSelectedBenhNhanId: Dispatch<SetStateAction<number | null>>;
  setActiveTab: Dispatch<SetStateAction<string>>;
  clearRecord: () => void;
  fetchDonThuoc: (id: number) => Promise<void>;
  loadHistoryNotesForTab: (id: number) => Promise<void>;
  findPatientById: (id: number) => BenhNhan | undefined;
  buildActivityPatient: (bn: BenhNhan | undefined) => ActivityPatient;
  setOpenSwipePatientId: Dispatch<SetStateAction<number | null>>;
  initialAddFocusRef: MutableRefObject<'ten' | 'namsinh' | 'dienthoai' | 'diachi' | null>;
}) {
  const {
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
    selectedBenhNhanId,
    setSelectedBenhNhanId,
    setActiveTab,
    clearRecord,
    fetchDonThuoc,
    loadHistoryNotesForTab,
    findPatientById,
    buildActivityPatient,
    setOpenSwipePatientId,
    initialAddFocusRef,
  } = options;

  const handleSelectBenhNhan = useCallback(
    (benhnhanid: number) => {
      if (!benhnhanid || isNaN(benhnhanid)) {
        toast.error('Mã bệnh nhân không hợp lệ');
        return;
      }
      if (selectedBenhNhanId === benhnhanid) {
        setSelectedBenhNhanId(null);
        clearRecord();
      } else {
        setSelectedBenhNhanId(benhnhanid);
        setActiveTab('don-thuoc');
        void fetchDonThuoc(benhnhanid);
        void loadHistoryNotesForTab(benhnhanid);
        const patient = buildActivityPatient(findPatientById(benhnhanid));
        if (patient) {
          pushRecentActivity({
            action: 'quick_history_open',
            patient,
            source: 'benh-nhan_select',
          });
        }
      }
    },
    [
      selectedBenhNhanId,
      setSelectedBenhNhanId,
      clearRecord,
      setActiveTab,
      fetchDonThuoc,
      loadHistoryNotesForTab,
      buildActivityPatient,
      findPatientById,
    ]
  );

  const handleOpenFamilyMember = useCallback(
    (memberPatientId: number) => {
      if (!memberPatientId || memberPatientId === selectedBenhNhanId) return;
      router.push(
        { pathname: '/benh-nhan', query: { search: '', focusId: memberPatientId } },
        undefined,
        { shallow: false }
      );
    },
    [router, selectedBenhNhanId]
  );

  const openCreatePatientFromSearch = useCallback(() => {
    const seed = parsePatientSeed(search);
    setIsEditing(false);
    setForm({
      ten: seed.ten,
      namsinh: seed.namsinh,
      gioitinh: '',
      dienthoai: seed.dienthoai,
      diachi: seed.diachi,
    });
    if (!seed.ten) initialAddFocusRef.current = 'ten';
    else if (!seed.namsinh) initialAddFocusRef.current = 'namsinh';
    else if (!seed.dienthoai) initialAddFocusRef.current = 'dienthoai';
    else initialAddFocusRef.current = 'diachi';
    setOpen(true);
  }, [search, setIsEditing, setForm, setOpen, initialAddFocusRef]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!form.ten || !form.namsinh || !form.diachi) {
      toast.error('Họ tên, năm sinh/ngày sinh và địa chỉ là bắt buộc!');
      return;
    }
    const namsinhStr = form.namsinh.trim();
    if (!/^\d{4}$/.test(namsinhStr) && !/^\d{2}\/\d{2}\/\d{4}$/.test(namsinhStr)) {
      toast.error('Năm sinh phải là yyyy hoặc dd/mm/yyyy');
      return;
    }
    const finalForm: BenhNhan = {
      ...form,
      namsinh: namsinhStr,
      gioitinh: form.gioitinh?.trim() || null,
    };

    setIsSubmitting(true);
    try {
      if (isEditing) {
        const updated = await updateBenhNhan(finalForm);
        toast.success('Đã cập nhật bệnh nhân');
        setBenhNhans((prev) => prev.map((bn) => (
          bn.id === updated.id
            ? { ...bn, ...updated, tuoi: calcPatientAge(updated.namsinh) }
            : bn
        )));
      } else {
        const created = await createBenhNhan(finalForm);
        toast.success('Đã thêm bệnh nhân');
        if (created?.id) {
          const row: BenhNhan = {
            ...created,
            tuoi: calcPatientAge(created.namsinh),
            ngay_kham_gan_nhat: null,
          };
          if (currentPage === 1 && !debouncedSearch.trim()) {
            setBenhNhans((prev) => [row, ...prev].slice(0, rowsPerPage));
          }
          setTotal((prev) => prev + 1);
        }
      }
      setOpen(false);
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) && error.response?.data
        ? [error.response.data.message, error.response.data.error].filter(Boolean).join(': ')
        : error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    form,
    isEditing,
    currentPage,
    rowsPerPage,
    debouncedSearch,
    isSubmitting,
    setBenhNhans,
    setTotal,
    setOpen,
    setIsSubmitting,
  ]);

  const handleEdit = useCallback((bn: BenhNhan) => {
    setForm({ ...bn, gioitinh: bn.gioitinh || '' });
    setIsEditing(true);
    setOpen(true);
  }, [setForm, setIsEditing, setOpen]);

  const handleDelete = useCallback(async (id: number) => {
    const confirmMessage = 'Bạn có chắc chắn muốn xóa bệnh nhân này?\n\n⚠️ LƯU Ý: Việc xóa sẽ xóa luôn TẤT CẢ:\n- Đơn thuốc của bệnh nhân\n- Chi tiết đơn thuốc\n- Diễn tiến bệnh\n\nHành động này KHÔNG THỂ HOÀN TÁC!';
    if (!await confirm(confirmMessage)) return;
    try {
      await deleteBenhNhan(id);
      setBenhNhans((prev) => prev.filter((bn) => bn.id !== id));
      if (selectedBenhNhanId === id) {
        setSelectedBenhNhanId(null);
        clearRecord();
      }
      toast.success('Đã xóa bệnh nhân và tất cả dữ liệu liên quan');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) && error.response?.data
        ? [error.response.data.message, error.response.data.error].filter(Boolean).join(': ')
        : error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi khi xóa bệnh nhân: ${message}`);
    }
  }, [confirm, selectedBenhNhanId, setSelectedBenhNhanId, clearRecord, setBenhNhans]);

  const openPrescriptionFromList = useCallback((bn: BenhNhan, type: 'thuoc' | 'kinh') => {
    const benhNhanId = Number(bn?.id);
    if (!benhNhanId || Number.isNaN(benhNhanId)) {
      toast.error('Mã bệnh nhân không hợp lệ');
      return;
    }
    const url = type === 'thuoc' ? `/ke-don?bn=${benhNhanId}` : `/ke-don-kinh?bn=${benhNhanId}`;
    setOpenSwipePatientId(null);
    const patient = buildActivityPatient(bn);
    if (patient) {
      pushRecentActivity({
        action: type === 'thuoc' ? 'open_rx_drug' : 'open_rx_glasses',
        patient,
        source: 'benh-nhan_prescription',
      });
    }
    router.push(url);
  }, [buildActivityPatient, router, setOpenSwipePatientId]);

  return {
    handleSelectBenhNhan,
    handleOpenFamilyMember,
    openCreatePatientFromSearch,
    handleSubmit,
    handleEdit,
    handleDelete,
    openPrescriptionFromList,
  };
}
