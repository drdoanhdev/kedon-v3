import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { fetchChainHistory, fetchPatientNotes, fetchPatientRecordBundle } from '@/lib/patient/api';
import type {
  BenhNhan,
  ChainHistory,
  ChiTietDonThuoc,
  DienTien,
  DonKinh,
  DonThuoc,
  HenKham,
  PatientNote,
} from '@/lib/patient/types';
import { pushRecentActivity } from '@/lib/recentActivity';

type BuildActivityPatient = (bn: BenhNhan | undefined) => {
  id: number;
  ten: string;
  dienthoai?: string;
  diachi?: string;
  namsinh?: string;
} | null;

export function usePatientRecord(options: {
  isMultiBranch: boolean;
  findPatientById: (id: number) => BenhNhan | undefined;
  buildActivityPatient: BuildActivityPatient;
}) {
  const { isMultiBranch, findPatientById, buildActivityPatient } = options;

  const [selectedBenhNhanId, setSelectedBenhNhanId] = useState<number | null>(null);
  const [donThuocs, setDonThuocs] = useState<DonThuoc[]>([]);
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]);
  const [chiTietDonThuocs, setChiTietDonThuocs] = useState<Record<number, ChiTietDonThuoc[]>>({});
  const [dienTiens, setDienTiens] = useState<Record<number, DienTien[]>>({});
  const [henKhams, setHenKhams] = useState<HenKham[]>([]);
  const [activeTab, setActiveTab] = useState<string>('don-thuoc');
  const [chainHistory, setChainHistory] = useState<ChainHistory | null>(null);
  const [loadingChainHistory, setLoadingChainHistory] = useState(false);
  const [historyNotesByPatient, setHistoryNotesByPatient] = useState<Record<number, PatientNote[]>>({});
  const [loadingHistoryPatientId, setLoadingHistoryPatientId] = useState<number | null>(null);

  const clearRecord = useCallback(() => {
    setDonThuocs([]);
    setDonKinhs([]);
    setChiTietDonThuocs({});
    setDienTiens({});
    setHenKhams([]);
    setActiveTab('don-thuoc');
  }, []);

  const fetchDonThuoc = useCallback(async (benhnhanid: number): Promise<void> => {
    if (!benhnhanid || isNaN(benhnhanid)) {
      toast.error('Mã bệnh nhân không hợp lệ');
      clearRecord();
      return;
    }
    try {
      const bundle = await fetchPatientRecordBundle(benhnhanid);
      setDonThuocs(bundle.donThuocs);
      setChiTietDonThuocs(bundle.chiTietMap);
      setDienTiens({ [benhnhanid]: bundle.dienTiens });
      setDonKinhs(bundle.donKinhs);
      setHenKhams(bundle.henKhams);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi tải dữ liệu: ${message}`);
      clearRecord();
    }
  }, [clearRecord]);

  const loadHistoryNotesForTab = useCallback(async (benhnhanid: number) => {
    if (!benhnhanid) return;
    setLoadingHistoryPatientId(benhnhanid);
    try {
      const notes = await fetchPatientNotes(benhnhanid, false);
      setHistoryNotesByPatient((prev) => ({
        ...prev,
        [benhnhanid]: notes,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi tải ghi chú bệnh nhân: ${message}`);
      setHistoryNotesByPatient((prev) => ({
        ...prev,
        [benhnhanid]: [],
      }));
    } finally {
      setLoadingHistoryPatientId((current) => (current === benhnhanid ? null : current));
    }
  }, []);

  const loadChainHistory = useCallback(async (benhnhanid: number) => {
    if (!isMultiBranch || !benhnhanid) return;
    setLoadingChainHistory(true);
    try {
      setChainHistory(await fetchChainHistory(benhnhanid));
    } catch {
      setChainHistory(null);
    } finally {
      setLoadingChainHistory(false);
    }
  }, [isMultiBranch]);

  const handleHistoryTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);

      if (!selectedBenhNhanId) return;
      if (tab === 'chuoi' && isMultiBranch) {
        loadChainHistory(selectedBenhNhanId);
        return;
      }
      if (tab !== 'don-thuoc' && tab !== 'don-kinh') return;

      const patient = buildActivityPatient(findPatientById(selectedBenhNhanId));
      if (!patient) return;

      pushRecentActivity({
        action: tab === 'don-thuoc' ? 'open_rx_drug' : 'open_rx_glasses',
        patient,
        source: 'benh-nhan_history_tab',
      });
    },
    [buildActivityPatient, findPatientById, selectedBenhNhanId, isMultiBranch, loadChainHistory]
  );

  const filteredDonThuocs = useMemo(() => {
    return donThuocs.map((don) => {
      const chiTiet = chiTietDonThuocs[don.id] || [];
      const dienTien = (dienTiens[selectedBenhNhanId!] || []).find(
        (dt: DienTien) => dt.ngay.slice(0, 10) === don.ngay_kham.slice(0, 10)
      );
      return {
        ...don,
        chiTietList: chiTiet,
        dienTien: dienTien ? dienTien.noidung : '-',
      };
    });
  }, [donThuocs, chiTietDonThuocs, dienTiens, selectedBenhNhanId]);

  return {
    selectedBenhNhanId,
    setSelectedBenhNhanId,
    donThuocs,
    setDonThuocs,
    donKinhs,
    setDonKinhs,
    chiTietDonThuocs,
    setChiTietDonThuocs,
    dienTiens,
    setDienTiens,
    henKhams,
    setHenKhams,
    activeTab,
    setActiveTab,
    chainHistory,
    setChainHistory,
    loadingChainHistory,
    historyNotesByPatient,
    loadingHistoryPatientId,
    fetchDonThuoc,
    loadHistoryNotesForTab,
    loadChainHistory,
    handleHistoryTabChange,
    filteredDonThuocs,
    clearRecord,
  };
}
