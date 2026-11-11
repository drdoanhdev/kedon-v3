import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { fetchBenhNhanList, mergeBenhNhans } from '@/lib/patient/api';
import type { BenhNhan } from '@/lib/patient/types';

export function usePatientMerge(options: {
  openFormDialog: boolean;
  currentPage: number;
  rowsPerPage: number;
  debouncedSearch: string;
  setBenhNhans: Dispatch<SetStateAction<BenhNhan[]>>;
  setTotal: Dispatch<SetStateAction<number>>;
  confirm: (message: string) => Promise<boolean>;
  paginated: BenhNhan[];
}) {
  const {
    openFormDialog,
    currentPage,
    rowsPerPage,
    debouncedSearch,
    setBenhNhans,
    setTotal,
    confirm,
    paginated,
  } = options;

  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mainPatientId, setMainPatientId] = useState<number | null>(null);

  const handleMergePatients = useCallback(async () => {
    if (selectedForMerge.length < 2) {
      toast.error('Vui lòng chọn ít nhất 2 bệnh nhân để gộp!');
      return;
    }
    setShowMergeDialog(true);
  }, [selectedForMerge.length]);

  const handleConfirmMerge = useCallback(async () => {
    if (!mainPatientId) {
      toast.error('Vui lòng chọn bệnh nhân chính!');
      return;
    }

    const patientIdsToMerge = selectedForMerge.filter((id) => id !== mainPatientId);

    const confirmMessage = `Bạn có chắc chắn muốn gộp ${patientIdsToMerge.length} bệnh nhân vào bệnh nhân đã chọn?\n\n` +
      `✅ HÀNH ĐỘNG SẼ THỰC HIỆN:\n` +
      `- Giữ lại bệnh nhân: ID ${mainPatientId}\n` +
      `- Chuyển tất cả đơn thuốc của ${patientIdsToMerge.length} bệnh nhân còn lại vào bệnh nhân chính\n` +
      `- Xóa ${patientIdsToMerge.length} bệnh nhân còn lại\n\n` +
      `⚠️ LƯU Ý: Hành động này KHÔNG THỂ HOÀN TÁC!`;

    if (!await confirm(confirmMessage)) return;

    try {
      await mergeBenhNhans(mainPatientId, patientIdsToMerge);
      toast.success(`Đã gộp thành công ${patientIdsToMerge.length} bệnh nhân!`);
      setSelectedForMerge([]);
      setShowMergeDialog(false);
      setMainPatientId(null);
      const { data, total: nextTotal } = await fetchBenhNhanList({
        page: currentPage,
        pageSize: rowsPerPage,
        search: debouncedSearch,
      });
      setBenhNhans(data);
      setTotal(nextTotal);
    } catch (error: unknown) {
      console.error('❌ Merge error:', error);
      const message = axios.isAxiosError(error) && error.response?.data?.message
        ? error.response.data.message
        : error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi khi gộp bệnh nhân: ${message}`);
    }
  }, [selectedForMerge, mainPatientId, currentPage, rowsPerPage, debouncedSearch, confirm, setBenhNhans, setTotal]);

  const toggleSelectForMerge = useCallback((patientId: number) => {
    setSelectedForMerge((prev) => {
      if (prev.includes(patientId)) {
        return prev.filter((id) => id !== patientId);
      }
      return [...prev, patientId];
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (openFormDialog) return;
      if (!e.ctrlKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (showMergeDialog) {
          if (mainPatientId) {
            handleConfirmMerge();
          } else {
            toast.error('Chọn bệnh nhân chính trước khi gộp (Ctrl+Enter).');
          }
        } else if (selectedForMerge.length >= 2) {
          handleMergePatients();
        } else {
          toast.error('Cần chọn ≥ 2 bệnh nhân để gộp (Ctrl+Enter).');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openFormDialog, showMergeDialog, mainPatientId, selectedForMerge.length, handleConfirmMerge, handleMergePatients]);

  const allSelectedCurrentPage = useMemo(() => (
    paginated.length > 0 && paginated.every((bn) => bn.id && selectedForMerge.includes(bn.id))
  ), [paginated, selectedForMerge]);

  const toggleSelectAllCurrentPage = useCallback(() => {
    if (allSelectedCurrentPage) {
      setSelectedForMerge((prev) => prev.filter((id) => !paginated.some((bn) => bn.id === id)));
    } else {
      setSelectedForMerge((prev) => {
        const set = new Set(prev);
        paginated.forEach((bn) => { if (bn.id) set.add(bn.id); });
        return Array.from(set);
      });
    }
  }, [allSelectedCurrentPage, paginated]);

  return {
    selectedForMerge,
    setSelectedForMerge,
    showMergeDialog,
    setShowMergeDialog,
    mainPatientId,
    setMainPatientId,
    handleMergePatients,
    handleConfirmMerge,
    toggleSelectForMerge,
    allSelectedCurrentPage,
    toggleSelectAllCurrentPage,
  };
}
