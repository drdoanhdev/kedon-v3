//src/pages/benh-nhan.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination, SimplePagination } from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Users, Check } from "lucide-react";
import axios from "axios";
import Link from "next/link";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import ProtectedRoute from '../components/ProtectedRoute'
import { searchByStartsWith, capitalizeWords } from '@/lib/utils';
import ChoKhamPanel, { ChoKhamPanelRef } from '@/components/ChoKhamPanel';
import { useBranch } from '../contexts/BranchContext';

interface BenhNhan {
  id?: number;
  ten: string;
  namsinh: string; // dd/mm/yyyy hoặc yyyy
  dienthoai: string;
  diachi: string;
  tuoi?: number;
  created_at?: string;
  ngay_kham_gan_nhat?: string;
  branch?: { id: string; ten_chi_nhanh: string } | null;
}

interface DonThuoc {
  id: number;
  madonthuoc: string;
  chandoan: string;
  ngay_kham: string;
  tongtien: number;
  trangthai_thanh_toan: string;
  sotien_da_thanh_toan: number;
  branch?: { id: string; ten_chi_nhanh: string } | null;
}

interface DonKinh {
  id: number;
  madonkinh: string;
  benhnhanid: number;
  ngaykham: string;
  sokinh_moi_mp?: string;
  sokinh_moi_mt?: string;
  sokinh_cu_mp?: string;
  sokinh_cu_mt?: string;
  ten_gong?: string;
  giatrong: number;
  giagong: number;
  no: boolean;
  sotien_da_thanh_toan: number;
  trangthai_thanh_toan: string;
  branch?: { id: string; ten_chi_nhanh: string } | null;
}

interface ChiTietDonThuoc {
  thuoc: {
    id: number;
    tenthuoc: string;
  };
  soluong: number;
}

interface DienTien {
  id: number;
  ngay: string;
  noidung: string;
}

interface HenKham {
  id: number;
  benhnhanid: number;
  ten_benhnhan: string;
  dienthoai: string;
  ngay_hen: string;
  gio_hen: string | null;
  ly_do: string;
  trang_thai: string;
  ghichu: string;
}

const TRANG_THAI_MAP: Record<string, { label: string; color: string; bg: string }> = {
  cho: { label: 'Chờ', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  da_den: { label: 'Đã đến', color: 'text-green-700', bg: 'bg-green-100' },
  huy: { label: 'Hủy', color: 'text-red-700', bg: 'bg-red-100' },
  qua_han: { label: 'Quá hạn', color: 'text-gray-700', bg: 'bg-gray-200' },
};

export default function BenhNhanPage() {
  const { confirm } = useConfirm();
  const { isMultiBranch } = useBranch();
  const [benhNhans, setBenhNhans] = useState<BenhNhan[]>([]);
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [open, setOpen] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [form, setForm] = useState<BenhNhan>({
    ten: "",
    namsinh: "",
    dienthoai: "",
    diachi: "",
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(100);
  const [selectedBenhNhanId, setSelectedBenhNhanId] = useState<number | null>(null);
  const [donThuocs, setDonThuocs] = useState<DonThuoc[]>([]);
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]);
  const [chiTietDonThuocs, setChiTietDonThuocs] = useState<Record<number, ChiTietDonThuoc[]>>({});
  const [dienTiens, setDienTiens] = useState<Record<number, DienTien[]>>({});
  const [henKhams, setHenKhams] = useState<HenKham[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>("don-thuoc");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // Đặt tiêu đề trang tĩnh
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Bệnh nhân';
    }
  }, []);
  // Sorting state - hỗ trợ multi-level sorting
  type SortField = 'ten' | 'namsinh' | 'tuoi' | 'dienthoai' | 'diachi' | 'created_at' | 'ngay_kham_gan_nhat';
  const [sortConfig, setSortConfig] = useState<Array<{ field: SortField; direction: 'asc' | 'desc' }>>([]);
  
  // States cho tính năng gộp bệnh nhân
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState<boolean>(false);
  const [mainPatientId, setMainPatientId] = useState<number | null>(null);

  // Refs for quick data entry in Add/Edit dialog
  const tenRef = useRef<HTMLInputElement | null>(null);
  const namsinhRef = useRef<HTMLInputElement | null>(null);
  const dienthoaiRef = useRef<HTMLInputElement | null>(null);
  const diachiRef = useRef<HTMLInputElement | null>(null);
  const choKhamPanelRef = useRef<ChoKhamPanelRef>(null);

  // Auto-focus Tên when opening dialog for creating new patient
  useEffect(() => {
    if (open && !isEditing) {
      // focus after dialog mounts
      const id = window.setTimeout(() => {
        tenRef.current?.focus();
        // select existing value if any
        try { tenRef.current?.select?.(); } catch {}
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [open, isEditing]);

  // Debounce search: chỉ gọi API sau 300ms ngừng gõ
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const abortController = new AbortController();
    const fetchList = async () => {
      try {
        const timestamp = Date.now();
        const res = await axios.get(`/api/benh-nhan?page=${currentPage}&pageSize=${rowsPerPage}&search=${encodeURIComponent(debouncedSearch)}&_t=${timestamp}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          },
          signal: abortController.signal,
        });
        setBenhNhans(res.data.data || []);
        setTotal(res.data.total || 0);
      } catch (error: unknown) {
        if (axios.isCancel(error)) return; // Request bị hủy, bỏ qua
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Lỗi tải danh sách bệnh nhân: ${message}`);
      }
    };
    fetchList();
    return () => abortController.abort();
  }, [currentPage, rowsPerPage, debouncedSearch]);

  const totalPages = Math.ceil(total / rowsPerPage);

  const fetchDonThuoc = useCallback(async (benhnhanid: number): Promise<void> => {
    if (!benhnhanid || isNaN(benhnhanid)) {
      toast.error("Mã bệnh nhân không hợp lệ");
      setDonThuocs([]);
      setDonKinhs([]);
      setChiTietDonThuocs({});
      setDienTiens({});
      setHenKhams([]);
      return;
    }
    try {
      // Thêm cache-busting parameters
      const timestamp = Date.now();
      const resDon = await axios.get(`/api/don-thuoc?benhnhanid=${benhnhanid}&limit=20&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      const donThuocs: DonThuoc[] = resDon.data.data || [];
      setDonThuocs(donThuocs);

      const chiTietPromises = donThuocs.map((don) =>
        axios.get(`/api/chi-tiet-don-thuoc?donthuocid=${don.id}&_t=${timestamp}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
      );
      const chiTietResponses = await Promise.all(chiTietPromises);
      const chiTietMap: Record<number, ChiTietDonThuoc[]> = {};
      chiTietResponses.forEach((res, idx) => {
        const donId = donThuocs[idx].id;
        chiTietMap[donId] = res.data.data.map((item: ChiTietDonThuoc) => ({
          thuoc: { id: item.thuoc.id, tenthuoc: item.thuoc.tenthuoc },
          soluong: item.soluong,
        }));
      });
      setChiTietDonThuocs(chiTietMap);

      const resDienTien = await axios.get(`/api/dien-tien?benhnhanid=${benhnhanid}&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setDienTiens({ [benhnhanid]: resDienTien.data.data || [] });

      // Fetch đơn kính
      const resDonKinh = await axios.get(`/api/don-kinh?benhnhanid=${benhnhanid}&limit=20&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setDonKinhs(resDonKinh.data.data || []);

      // Fetch lịch hẹn khám lại
      const resHenKham = await axios.get(`/api/hen-kham-lai?benhnhanid=${benhnhanid}&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setHenKhams(resHenKham.data.data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi tải dữ liệu: ${message}`);
      setDonThuocs([]);
      setDonKinhs([]);
      setChiTietDonThuocs({});
      setDienTiens({});
      setHenKhams([]);
    }
  }, []);

  const handleSelectBenhNhan = useCallback(
    (benhnhanid: number) => {
      if (!benhnhanid || isNaN(benhnhanid)) {
        toast.error('Mã bệnh nhân không hợp lệ');
        return;
      }
      if (selectedBenhNhanId === benhnhanid) {
        setSelectedBenhNhanId(null);
        setDonThuocs([]);
        setDonKinhs([]);
        setChiTietDonThuocs({});
        setDienTiens({});
        setHenKhams([]);
        setActiveTab("don-thuoc");
      } else {
        setSelectedBenhNhanId(benhnhanid);
        setActiveTab("don-thuoc");
        fetchDonThuoc(benhnhanid);
      }
    },
    [selectedBenhNhanId, fetchDonThuoc]
  );

  

  // Function để thực hiện gộp bệnh nhân
  const handleMergePatients = useCallback(async () => {
    if (selectedForMerge.length < 2) {
      toast.error('Vui lòng chọn ít nhất 2 bệnh nhân để gộp!');
      return;
    }

    // Hiển thị dialog để chọn bệnh nhân chính
    setShowMergeDialog(true);
  }, [selectedForMerge.length]);

  // Function để xác nhận gộp bệnh nhân
  const handleConfirmMerge = useCallback(async () => {
    if (!mainPatientId) {
      toast.error('Vui lòng chọn bệnh nhân chính!');
      return;
    }

    const patientIdsToMerge = selectedForMerge.filter(id => id !== mainPatientId);

    const confirmMessage = `Bạn có chắc chắn muốn gộp ${patientIdsToMerge.length} bệnh nhân vào bệnh nhân đã chọn?\n\n` +
      `✅ HÀNH ĐỘNG SẼ THỰC HIỆN:\n` +
      `- Giữ lại bệnh nhân: ID ${mainPatientId}\n` +
      `- Chuyển tất cả đơn thuốc của ${patientIdsToMerge.length} bệnh nhân còn lại vào bệnh nhân chính\n` +
      `- Xóa ${patientIdsToMerge.length} bệnh nhân còn lại\n\n` +
      `⚠️ LƯU Ý: Hành động này KHÔNG THỂ HOÀN TÁC!`;

    if (!await confirm(confirmMessage)) return;

    try {
      await axios.post('/api/benh-nhan/merge', {
        mainPatientId,
        patientIdsToMerge
      });

      toast.success(`Đã gộp thành công ${patientIdsToMerge.length} bệnh nhân!`);
      
      // Reset states
      setSelectedForMerge([]);
      setShowMergeDialog(false);
      setMainPatientId(null);
      
      // Refresh danh sách
      const timestamp = Date.now();
      const res = await axios.get(`/api/benh-nhan?page=${currentPage}&pageSize=${rowsPerPage}&search=${encodeURIComponent(debouncedSearch)}&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setBenhNhans(res.data.data || []);
      setTotal(res.data.total || 0);
      
    } catch (error: unknown) {
      console.error('❌ Merge error:', error);
      const message = axios.isAxiosError(error) && error.response?.data?.message 
        ? error.response.data.message 
        : error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi khi gộp bệnh nhân: ${message}`);
    }
  }, [selectedForMerge, mainPatientId, currentPage, rowsPerPage, debouncedSearch]);

  // Function để toggle chọn bệnh nhân để gộp
  const toggleSelectForMerge = useCallback((patientId: number) => {
    setSelectedForMerge(prev => {
      if (prev.includes(patientId)) {
        return prev.filter(id => id !== patientId);
      } else {
        return [...prev, patientId];
      }
    });
  }, []);

  // Keyboard shortcut (moved here after handlers are defined): Ctrl+Enter for merge
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when add/edit patient dialog is open
      if (open) return;
      if (!e.ctrlKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (showMergeDialog) {
          if (mainPatientId) {
            handleConfirmMerge();
          } else {
            toast.error('Chọn bệnh nhân chính trước khi gộp (Ctrl+Enter).');
          }
        } else {
          if (selectedForMerge.length >= 2) {
            handleMergePatients();
          } else {
            toast.error('Cần chọn ≥ 2 bệnh nhân để gộp (Ctrl+Enter).');
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, showMergeDialog, mainPatientId, selectedForMerge.length, handleConfirmMerge, handleMergePatients]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;

    if (!form.ten || !form.namsinh || !form.diachi) {
      toast.error('Họ tên, năm sinh/ngày sinh và địa chỉ là bắt buộc!');
      return;
    }
    // Kiểm tra định dạng năm sinh/ngày sinh
    const namsinhStr = form.namsinh.trim();
    if (!/^\d{4}$/.test(namsinhStr) && !/^\d{2}\/\d{2}\/\d{4}$/.test(namsinhStr)) {
      toast.error('Năm sinh phải là yyyy hoặc dd/mm/yyyy');
      return;
    }
    const finalForm: BenhNhan = { ...form, namsinh: namsinhStr };

    setIsSubmitting(true);
    try {
      if (isEditing) {
        await axios.put('/api/benh-nhan', finalForm);
        toast.success('Đã cập nhật bệnh nhân');
      } else {
        await axios.post('/api/benh-nhan', finalForm);
        toast.success('Đã thêm bệnh nhân');
      }
      setOpen(false);
      // Thêm cache-busting parameters khi refetch
      const timestamp = Date.now();
      const res = await axios.get(`/api/benh-nhan?page=${currentPage}&pageSize=${rowsPerPage}&search=${encodeURIComponent(debouncedSearch)}&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setBenhNhans(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, isEditing, currentPage, rowsPerPage, debouncedSearch, isSubmitting]);

  const handleEdit = useCallback((bn: BenhNhan) => {
    setForm(bn);
    setIsEditing(true);
    setOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    const confirmMessage = 'Bạn có chắc chắn muốn xóa bệnh nhân này?\n\n⚠️ LƯU Ý: Việc xóa sẽ xóa luôn TẤT CẢ:\n- Đơn thuốc của bệnh nhân\n- Chi tiết đơn thuốc\n- Diễn tiến bệnh\n\nHành động này KHÔNG THỂ HOÀN TÁC!';
    
    if (!await confirm(confirmMessage)) return;
    
    try {
      console.log('🗑️ Deleting patient with ID:', id, 'Type:', typeof id);
      const response = await axios.delete(`/api/benh-nhan?id=${id}`);
      console.log('✅ Delete response:', response.data);
      
      setBenhNhans((prev) => prev.filter((bn) => bn.id !== id));
      if (selectedBenhNhanId === id) {
        setSelectedBenhNhanId(null);
        setDonThuocs([]);
        setChiTietDonThuocs({});
        setDienTiens({});
        setHenKhams([]);
      }
      toast.success('Đã xóa bệnh nhân và tất cả dữ liệu liên quan');
    } catch (error: unknown) {
      console.error('❌ Delete error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
      }
      const message = axios.isAxiosError(error) && error.response?.data?.message 
        ? error.response.data.message 
        : error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi khi xóa bệnh nhân: ${message}`);
    }
  }, [selectedBenhNhanId]);

  const filtered = useMemo(() => {
    const searchTerm = search.trim();
    if (!searchTerm) return benhNhans;
    
    return benhNhans.filter((bn) => {
      // 1. Tìm theo tên (hỗ trợ nhiều từ, không dấu)
      if (bn.ten && searchByStartsWith(bn.ten, searchTerm)) {
        return true;
      }
      
      // 2. Tìm theo số điện thoại
      if (bn.dienthoai && /\d/.test(searchTerm)) {
        const cleanPhone = bn.dienthoai.replace(/\D/g, '');
        const cleanSearch = searchTerm.replace(/\D/g, '');
        if (cleanSearch && cleanPhone.includes(cleanSearch)) {
          return true;
        }
      }
      
      // 3. Tìm theo địa chỉ
      if (bn.diachi && searchByStartsWith(bn.diachi, searchTerm)) {
        return true;
      }
      
      return false;
    });
  }, [benhNhans, search]);

  // Helper to parse namsinh (yyyy or dd/mm/yyyy) to a comparable number (timestamp)
  const parseNgaySinh = useCallback((val: string | number | undefined): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') {
      // treat as year
      return new Date(val, 0, 1).getTime();
    }
    const s = val.trim();
    if (/^\d{4}$/.test(s)) {
      return new Date(parseInt(s), 0, 1).getTime();
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/').map((p) => parseInt(p));
      return new Date(y, m - 1, d).getTime();
    }
    // fallback attempt Date.parse
    const t = Date.parse(s);
    return isNaN(t) ? 0 : t;
  }, []);

  const sortedFiltered = useMemo(() => {
    if (sortConfig.length === 0) return filtered;
    
    return [...filtered].sort((a, b) => {
      // Duyệt qua từng level sắp xếp
      for (const { field, direction } of sortConfig) {
        const multiplier = direction === 'asc' ? 1 : -1;
        let av: any = (a as any)[field];
        let bv: any = (b as any)[field];
        
        if (field === 'namsinh') {
          av = parseNgaySinh(av);
          bv = parseNgaySinh(bv);
        } else if (field === 'tuoi') {
          av = av ?? 0;
          bv = bv ?? 0;
        } else if (field === 'created_at' || field === 'ngay_kham_gan_nhat') {
          av = av ? new Date(av).getTime() : 0;
          bv = bv ? new Date(bv).getTime() : 0;
        } else {
          av = (av ?? '').toString().toLowerCase();
          bv = (bv ?? '').toString().toLowerCase();
        }
        
        if (av < bv) return -1 * multiplier;
        if (av > bv) return 1 * multiplier;
        // Nếu bằng nhau, tiếp tục với trường tiếp theo
      }
      return 0;
    });
  }, [filtered, sortConfig, parseNgaySinh]);

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginated = useMemo(
    () => sortedFiltered.slice(startIndex, startIndex + rowsPerPage),
    [sortedFiltered, startIndex, rowsPerPage]
  );

  const allSelectedCurrentPage = useMemo(() => (
    paginated.length > 0 && paginated.every(bn => bn.id && selectedForMerge.includes(bn.id))
  ), [paginated, selectedForMerge]);

  const toggleSelectAllCurrentPage = useCallback(() => {
    if (allSelectedCurrentPage) {
      // Unselect all of current page
      setSelectedForMerge(prev => prev.filter(id => !paginated.some(bn => bn.id === id)));
    } else {
      // Add all ids from current page
      setSelectedForMerge(prev => {
        const set = new Set(prev);
        paginated.forEach(bn => { if (bn.id) set.add(bn.id); });
        return Array.from(set);
      });
    }
  }, [allSelectedCurrentPage, paginated]);

  const handleSort = useCallback((field: SortField, isShiftKey: boolean = false) => {
    setSortConfig((prev) => {
      if (isShiftKey) {
        // Shift+Click: Thêm level sắp xếp phụ
        const existingIndex = prev.findIndex(s => s.field === field);
        if (existingIndex >= 0) {
          // Nếu đã tồn tại, toggle direction
          const updated = [...prev];
          updated[existingIndex] = {
            field,
            direction: updated[existingIndex].direction === 'asc' ? 'desc' : 'asc'
          };
          return updated;
        } else {
          // Thêm mới vào cuối
          return [...prev, { field, direction: 'asc' }];
        }
      } else {
        // Click thường: Chỉ sắp xếp theo trường này
        const existing = prev.find(s => s.field === field);
        if (existing) {
          // Toggle direction
          return [{ field, direction: existing.direction === 'asc' ? 'desc' : 'asc' }];
        } else {
          return [{ field, direction: 'asc' }];
        }
      }
    });
    setCurrentPage(1);
  }, []);

  const renderSortIndicator = (field: SortField) => {
    const sortIndex = sortConfig.findIndex(s => s.field === field);
    if (sortIndex === -1) return <span className="opacity-30">↕</span>;
    
    const sort = sortConfig[sortIndex];
    const arrow = sort.direction === 'asc' ? '▲' : '▼';
    const level = sortConfig.length > 1 ? <sub className="text-[9px]">{sortIndex + 1}</sub> : null;
    
    return <span className="text-blue-600 font-bold">{arrow}{level}</span>;
  };

  // Danh sách chờ khám (tạm thời lấy 10 bệnh nhân đầu)
  const dsChoKham = useMemo(() => benhNhans.slice(0, 10), [benhNhans]);

  // Format lịch sử khám và đơn thuốc
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

  return (
    <ProtectedRoute>
      <div className="p-2 lg:p-4">
        
        {/* Mobile Layout */}
  <div className="block md:hidden space-y-3">
          {/* Header Mobile */}
          <div className="bg-white border rounded p-3">
            <h1 className="text-lg font-semibold mb-3">Quản Lý Bệnh Nhân</h1>
            <div className="space-y-3">
              <Input
                placeholder="Tên, SĐT hoặc địa chỉ..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                  setSelectedBenhNhanId(null);
                  setDonThuocs([]);
                  setChiTietDonThuocs({});
                  setDienTiens({});
                  setHenKhams([]);
                }}
                className="h-10"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  className="flex-1 h-10"
                  onClick={() => {
                    setIsEditing(false);
                    setForm({
                      ten: capitalizeWords(search.trim()),
                      namsinh: '',
                      dienthoai: '',
                      diachi: '',
                    });
                    setOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" /> Thêm BN
                </Button>
                
                {/* Nút quản lý gộp bệnh nhân */}
                <Button
                  variant="outline"
                  className="h-10 px-3"
                  onClick={handleMergePatients}
                  disabled={selectedForMerge.length < 2}
                >
                  <Users className="w-4 h-4 mr-1" />
                  Gộp BN ({selectedForMerge.length})
                </Button>

                
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(+e.target.value);
                    setCurrentPage(1);
                  }}
                  className="border px-3 py-2 rounded h-10 bg-white"
                >
                  {[50, 100, 200].map((val) => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-gray-600">
                Tổng: {filtered.length} bệnh nhân
                {selectedForMerge.length > 0 && (
                  <span className="ml-2 text-blue-600 font-medium">
                    • Đã chọn {selectedForMerge.length} để gộp
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Patient List Mobile */}
          <div className="bg-white border rounded p-3">
            <h2 className="font-semibold text-base mb-2">👥 Danh sách bệnh nhân</h2>
            <div className="space-y-2">
              {paginated.length === 0 ? (
                <p className="text-sm text-gray-500">Không tìm thấy bệnh nhân.</p>
              ) : (
                paginated.map((bn, index) => {
                  const isSelected = selectedForMerge.includes(bn.id!);
                  const stt = startIndex + index + 1;
                  
                  return (
                  <div 
                    key={bn.id} 
                    className={`border rounded p-3 transition-colors ${isSelected 
                      ? 'bg-green-200 border-green-600 shadow-sm ring-1 ring-green-500' 
                      : 'hover:border-blue-500 hover:bg-blue-100'} `}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono px-1 rounded ${isSelected ? 'bg-green-700 text-white' : 'bg-gray-300 text-gray-800'}`}>{stt}</span>
                          <div 
                            className={`cursor-pointer ${isSelected ? 'font-bold text-green-800' : 'font-medium text-blue-700 hover:text-blue-800'} `}
                            onClick={() => handleSelectBenhNhan(bn.id!)}
                          >
                            {bn.ten}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => handleEdit(bn)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <button
                          onClick={() => toggleSelectForMerge(bn.id!)}
                          className={`w-8 h-8 border-2 rounded flex items-center justify-center transition-colors ${
                            isSelected 
                              ? 'bg-green-700 border-green-700 text-white shadow' 
                              : 'border-gray-300 hover:border-blue-500 hover:bg-blue-100'
                          }`}
                          aria-pressed={isSelected}
                        >
                          {isSelected && <Check className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                      <div>Sinh: {typeof bn.namsinh === 'number' ? bn.namsinh : bn.namsinh}</div>
                      <div>Tuổi: {bn.tuoi ?? "N/A"}</div>
                      <div>SĐT: {bn.dienthoai || "Chưa có"}</div>
                      <div>Ngày lập: {bn.created_at ? new Date(bn.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</div>
                      <div className="col-span-2">Địa chỉ: {bn.diachi}</div>
                      <div className="col-span-2">Khám gần nhất: {bn.ngay_kham_gan_nhat ? new Date(bn.ngay_kham_gan_nhat).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Chưa khám'}</div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-xs text-white"
                        onClick={async () => {
                          await choKhamPanelRef.current?.addPatient(bn.id!);
                          window.open(`/ke-don?bn=${bn.id}`, '_blank');
                        }}
                      >
                        Kê đơn thuốc
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-xs text-white"
                        onClick={async () => {
                          await choKhamPanelRef.current?.addPatient(bn.id!);
                          window.open(`/ke-don-kinh?bn=${bn.id}`, '_blank');
                        }}
                      >
                        Kê đơn kính
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-8 bg-yellow-500 hover:bg-yellow-600 text-xs text-white"
                        onClick={() => choKhamPanelRef.current?.addPatient(bn.id!)}
                      >
                        + Chờ khám
                      </Button>
                    </div>

                    {/* Medical History Mobile */}
                    {selectedBenhNhanId === bn.id && (
                      <div className="mt-3 pt-3 border-t">
                        <h3 className="font-medium text-sm mb-2">📋 Lịch sử khám bệnh</h3>
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="don-thuoc">Đơn thuốc ({filteredDonThuocs.length})</TabsTrigger>
                            <TabsTrigger value="don-kinh">Đơn kính ({donKinhs.length})</TabsTrigger>
                            <TabsTrigger value="lich-hen">Lịch hẹn ({henKhams.length})</TabsTrigger>
                          </TabsList>
                          
                          <TabsContent value="don-thuoc" className="mt-2">
                            {filteredDonThuocs.length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có đơn thuốc nào.</p>
                            ) : (
                              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                                {filteredDonThuocs.map((don) => (
                                  <div key={don.id} className="bg-white border rounded-lg p-2.5 shadow-sm">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                          {new Date(don.ngay_kham).toLocaleDateString('vi-VN')}
                                        </span>
                                        {isMultiBranch && don.branch?.ten_chi_nhanh && (
                                          <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded font-medium">
                                            🏬 {don.branch.ten_chi_nhanh}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-xs font-bold text-blue-600">
                                        {(don.tongtien / 1000).toFixed(0)}k
                                      </span>
                                    </div>
                                    {don.chandoan && (
                                      <div className="text-xs font-semibold text-gray-800 mb-1.5">{don.chandoan}</div>
                                    )}
                                    {don.chiTietList.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mb-1.5">
                                        {don.chiTietList.map((ct, i) => (
                                          <span key={i} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full border border-blue-100">
                                            {ct.thuoc.tenthuoc} ×{ct.soluong}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {don.dienTien !== '-' && (
                                      <div className="text-[10px] text-gray-500 italic">
                                        Diễn tiến: {don.dienTien}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </TabsContent>
                          
                          <TabsContent value="don-kinh" className="mt-2">
                            {donKinhs.length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có đơn kính nào.</p>
                            ) : (
                              <div className="space-y-2">
                                {donKinhs.map((don) => (
                                  <div key={don.id} className="bg-blue-50 border rounded p-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="text-xs text-gray-600">
                                        {new Date(don.ngaykham).toLocaleDateString('vi-VN')}
                                      </div>
                                      {isMultiBranch && (don as any).branch?.ten_chi_nhanh && (
                                        <span className="text-[10px] text-purple-700 bg-white border border-purple-100 px-1.5 py-0.5 rounded font-medium">
                                          🏬 {(don as any).branch.ten_chi_nhanh}
                                        </span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                                      <div>
                                        <strong>MP:</strong> {don.sokinh_moi_mp || 'Chưa có'}
                                      </div>
                                      <div>
                                        <strong>MT:</strong> {don.sokinh_moi_mt || 'Chưa có'}
                                      </div>
                                    </div>
                                    {don.ten_gong && (
                                      <div className="text-[11px] text-gray-500 mb-1.5">Gọng: {don.ten_gong}</div>
                                    )}
                                    <div className="flex justify-between items-center">
                                      <div className="text-sm font-medium text-blue-600">
                                        {(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k VND
                                      </div>
                                      {(() => {
                                        const tongTienKinh = (don.giatrong || 0) + (don.giagong || 0);
                                        const conNo = tongTienKinh - (don.sotien_da_thanh_toan || 0);
                                        return (
                                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                            conNo <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                          }`}>
                                            {conNo <= 0 ? 'Đã TT' : `Nợ: ${(conNo / 1000).toFixed(0)}k`}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="lich-hen" className="mt-2">
                            {henKhams.length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có lịch hẹn nào.</p>
                            ) : (
                              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                                {henKhams.map((hen) => {
                                  const st = TRANG_THAI_MAP[hen.trang_thai] || TRANG_THAI_MAP.cho;
                                  return (
                                    <div key={hen.id} className="bg-white border rounded-lg p-2.5 shadow-sm">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                          {new Date(hen.ngay_hen).toLocaleDateString('vi-VN')}
                                          {hen.gio_hen && ` ${hen.gio_hen.substring(0, 5)}`}
                                        </span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.color}`}>
                                          {st.label}
                                        </span>
                                      </div>
                                      {hen.ly_do && <div className="text-xs font-semibold text-gray-800 mb-1">{hen.ly_do}</div>}
                                      {hen.ghichu && <div className="text-[10px] text-gray-500 italic">{hen.ghichu}</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>

            {/* Mobile Pagination */}
            <div className="mt-3 pt-3 border-t">
              <SimplePagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  setCurrentPage(page);
                  setSelectedBenhNhanId(null);
                  setDonThuocs([]);
                  setChiTietDonThuocs({});
                  setDienTiens({});
                  setHenKhams([]);
                }}
              />
            </div>
          </div>
        </div>

        {/* Desktop Layout - Keep original */}
  <div className="hidden md:flex gap-4">
          {/* Left: Danh sách chờ khám */}
          <div className="w-72 shrink-0">
            <ChoKhamPanel ref={choKhamPanelRef} />
          </div>
          {/* Right: Danh sách bệnh nhân */}
          <div className="flex-1 min-w-0">
          <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">Quản Lý Bệnh Nhân</h1>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Tên, SĐT hoặc địa chỉ..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                    setSelectedBenhNhanId(null);
                    setDonThuocs([]);
                    setChiTietDonThuocs({});
                    setDienTiens({});
                    setHenKhams([]);
                  }}
                  className="w-64 text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setForm({
                      ten: capitalizeWords(search.trim()),
                      namsinh: '',
                      dienthoai: '',
                      diachi: '',
                    });
                    setOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" /> Thêm
                </Button>
                
                {/* Nút quản lý gộp bệnh nhân - Desktop */}
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleMergePatients}
                  disabled={selectedForMerge.length < 2}
                >
                  <Users className="w-4 h-4 mr-1" />
                  Gộp bệnh nhân ({selectedForMerge.length})
                </Button>

                
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(+e.target.value);
                    setCurrentPage(1);
                  }}
                  className="border px-2 py-1 rounded text-sm"
                >
                  {[100, 200, 500, 1000].map((val) => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tổng số bệnh nhân */}
            <div className="text-sm text-muted-foreground">
              Tổng cộng: {filtered.length} bệnh nhân
              {selectedForMerge.length > 0 && (
                <span className="ml-4 text-blue-600 font-medium">
                  • Đã chọn {selectedForMerge.length} bệnh nhân để gộp
                </span>
              )}
              {sortConfig.length > 0 && (
                <span className="ml-4 text-green-600 font-medium">
                  • Sắp xếp: {sortConfig.map((s, i) => {
                    const fieldNames: Record<SortField, string> = {
                      ten: 'Tên',
                      namsinh: 'Năm sinh',
                      tuoi: 'Tuổi',
                      dienthoai: 'SĐT',
                      diachi: 'Địa chỉ',
                      created_at: 'Ngày lập',
                      ngay_kham_gan_nhat: 'Khám gần nhất'
                    };
                    return `${i + 1}. ${fieldNames[s.field]} ${s.direction === 'asc' ? '↑' : '↓'}`;
                  }).join(' → ')}
                </span>
              )}
            </div>

            {/* Bảng bệnh nhân */}
            <Card>
              <CardContent className="p-0">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-1 py-1 w-8 text-center">
                        <button
                          onClick={toggleSelectAllCurrentPage}
                          title={allSelectedCurrentPage ? 'Bỏ chọn tất cả' : 'Chọn tất cả trang này'}
                          className={`h-5 w-5 border-2 rounded flex items-center justify-center transition-colors mx-auto ${
                            allSelectedCurrentPage
                              ? 'bg-green-700 border-green-700 text-white'
                              : 'border-gray-400 hover:border-blue-500'
                          }`}
                        >
                          {allSelectedCurrentPage && <Check className="w-3 h-3" />}
                        </button>
                      </th>
                      <th className="px-2 py-1 w-12">STT</th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => handleSort('ten', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Họ Tên {renderSortIndicator('ten')}</div>
                      </th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => handleSort('namsinh', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Ngày Sinh {renderSortIndicator('namsinh')}</div>
                      </th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => handleSort('tuoi', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Tuổi {renderSortIndicator('tuoi')}</div>
                      </th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => handleSort('dienthoai', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Điện Thoại {renderSortIndicator('dienthoai')}</div>
                      </th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => handleSort('diachi', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Địa Chỉ {renderSortIndicator('diachi')}</div>
                      </th>
                      <th
                        className="px-1 py-1 cursor-pointer select-none whitespace-nowrap"
                        onClick={(e) => handleSort('created_at', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Ngày lập {renderSortIndicator('created_at')}</div>
                      </th>
                      <th
                        className="px-1 py-1 cursor-pointer select-none whitespace-nowrap"
                        onClick={(e) => handleSort('ngay_kham_gan_nhat', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Khám GN {renderSortIndicator('ngay_kham_gan_nhat')}</div>
                      </th>
                      {isMultiBranch && <th className="px-2 py-1">Chi nhánh</th>}
                      <th className="px-2 py-1 text-center">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((bn, index) => {
                      const isSelected = selectedForMerge.includes(bn.id!);
                      const stt = startIndex + index + 1;
                      
                      return (
                      <React.Fragment key={bn.id}>
                        <tr className={`border-b transition-colors ${isSelected ? 'bg-green-200 font-semibold border-green-500' : 'hover:bg-blue-100'}`}>
                          <td className="px-1 py-1 text-center">
                            <button
                              onClick={() => toggleSelectForMerge(bn.id!)}
                              title={isSelected ? 'Bỏ chọn gộp' : 'Chọn để gộp'}
                              className={`h-5 w-5 border-2 rounded flex items-center justify-center transition-colors mx-auto ${
                                isSelected
                                  ? 'bg-green-700 border-green-700 text-white shadow'
                                  : 'border-gray-300 hover:border-blue-500 hover:bg-blue-100'
                              }`}
                              aria-pressed={isSelected}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </button>
                          </td>
                          <td className="px-2 py-1 font-mono text-center">{stt}</td>
                          <td
                            className={`px-2 py-1 cursor-pointer ${isSelected ? 'text-green-800 font-bold' : 'text-black font-bold hover:text-blue-700'}`}
                            onClick={() => handleSelectBenhNhan(bn.id!)}
                          >
                            {bn.ten}
                          </td>
                          <td className="px-2 py-1">{typeof bn.namsinh === 'number' ? bn.namsinh : bn.namsinh}</td>
                          <td className="px-2 py-1">{bn.tuoi ?? ""}</td>
                          <td className="px-2 py-1">{bn.dienthoai}</td>
                          <td className="px-2 py-1">{bn.diachi}</td>
                          <td className="px-1 py-1 text-xs text-gray-600 whitespace-nowrap">{bn.created_at ? new Date(bn.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</td>
                          <td className="px-1 py-1 text-xs text-gray-600 whitespace-nowrap">{bn.ngay_kham_gan_nhat ? new Date(bn.ngay_kham_gan_nhat).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</td>
                          {isMultiBranch && (
                            <td className="px-2 py-1 text-xs text-gray-500">{bn.branch?.ten_chi_nhanh || '-'}</td>
                          )}
                          <td className="px-2 py-1 text-center">
                            <div className="inline-flex items-center gap-0.5">
                              <Button size="sm" variant="outline" onClick={() => handleEdit(bn)} className="h-7 w-7 p-0" title="Sửa">
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 w-7 p-0 bg-yellow-500 hover:bg-yellow-600 text-white"
                                onClick={() => choKhamPanelRef.current?.addPatient(bn.id!)}
                                title="Thêm vào chờ khám"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                              <div className="flex items-center rounded-md overflow-hidden border border-blue-600 ml-0.5">
                                <button
                                  className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                                  onClick={async () => {
                                    await choKhamPanelRef.current?.addPatient(bn.id!);
                                    window.open(`/ke-don?bn=${bn.id}`, '_blank');
                                  }}
                                  title="Kê đơn thuốc"
                                >
                                  Thuốc
                                </button>
                                <div className="w-px h-5 bg-blue-400" />
                                <button
                                  className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                                  onClick={async () => {
                                    await choKhamPanelRef.current?.addPatient(bn.id!);
                                    window.open(`/ke-don-kinh?bn=${bn.id}`, '_blank');
                                  }}
                                  title="Kê đơn kính"
                                >
                                  Kính
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {selectedBenhNhanId === bn.id && (
                          <tr>
                            <td colSpan={10} className="px-2 py-1">
                              <Card className="shadow-sm bg-gray-50 border-gray-200">
                                <CardContent className="p-3">
                                  {/* Tab buttons */}
                                  <div className="flex gap-1 mb-3 border-b pb-2">
                                    <button
                                      onClick={() => setActiveTab('don-thuoc')}
                                      className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${
                                        activeTab === 'don-thuoc'
                                          ? 'bg-white text-blue-700 border border-b-white -mb-[9px] pb-[13px] shadow-sm'
                                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      📋 Đơn thuốc ({filteredDonThuocs.length})
                                    </button>
                                    <button
                                      onClick={() => setActiveTab('don-kinh')}
                                      className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${
                                        activeTab === 'don-kinh'
                                          ? 'bg-white text-blue-700 border border-b-white -mb-[9px] pb-[13px] shadow-sm'
                                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      👓 Đơn kính ({donKinhs.length})
                                    </button>
                                    <button
                                      onClick={() => setActiveTab('lich-hen')}
                                      className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${
                                        activeTab === 'lich-hen'
                                          ? 'bg-white text-blue-700 border border-b-white -mb-[9px] pb-[13px] shadow-sm'
                                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      📅 Lịch hẹn ({henKhams.length})
                                    </button>
                                  </div>
                                    
                                  {/* Content */}
                                  <div className="max-h-[400px] overflow-y-auto">
                                    {activeTab === 'don-thuoc' && (
                                      filteredDonThuocs.length === 0 ? (
                                        <p className="text-xs text-gray-400 py-4 text-center">Chưa có đơn thuốc nào.</p>
                                      ) : (
                                        <div className="space-y-2">
                                          {filteredDonThuocs.map((don) => (
                                            <div key={don.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                                              <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                    {new Date(don.ngay_kham).toLocaleDateString('vi-VN')}
                                                  </span>
                                                  <span className="text-xs font-semibold text-gray-800">{don.chandoan || '-'}</span>
                                                </div>
                                                <span className="text-xs font-bold text-blue-600 whitespace-nowrap ml-2">
                                                  {(don.tongtien / 1000).toFixed(0)}k
                                                </span>
                                              </div>
                                              {don.chiTietList.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mb-1.5">
                                                  {don.chiTietList.map((ct, i) => (
                                                    <span key={i} className="inline-flex items-center text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">
                                                      {ct.thuoc.tenthuoc} <span className="font-semibold ml-1">×{ct.soluong}</span>
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                              {don.dienTien !== '-' && (
                                                <div className="text-[11px] text-gray-500 italic">
                                                  Diễn tiến: {don.dienTien}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    )}

                                    {activeTab === 'don-kinh' && (
                                      donKinhs.length === 0 ? (
                                        <p className="text-xs text-gray-400 py-4 text-center">Chưa có đơn kính nào.</p>
                                      ) : (
                                        <div className="space-y-2">
                                          {donKinhs.map((don) => (
                                            <div key={don.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                                              <div className="flex items-start justify-between mb-2">
                                                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                  {new Date(don.ngaykham).toLocaleDateString('vi-VN')}
                                                </span>
                                                <div className="flex items-center gap-3 text-xs">
                                                  <span className="font-bold text-blue-600">
                                                    {(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k
                                                  </span>
                                                  {(() => {
                                                    const tongTienKinh = (don.giatrong || 0) + (don.giagong || 0);
                                                    const conNo = tongTienKinh - (don.sotien_da_thanh_toan || 0);
                                                    return (
                                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                        conNo <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                      }`}>
                                                        {conNo <= 0 ? 'Đã TT' : `Nợ: ${(conNo / 1000).toFixed(0)}k`}
                                                      </span>
                                                    );
                                                  })()}
                                                </div>
                                              </div>
                                              <div className="grid grid-cols-2 gap-x-6 text-[11px] text-gray-600">
                                                <div>
                                                  <span className="font-medium text-gray-700">MP:</span> {don.sokinh_moi_mp || 'Chưa có'}
                                                </div>
                                                <div>
                                                  <span className="font-medium text-gray-700">MT:</span> {don.sokinh_moi_mt || 'Chưa có'}
                                                </div>
                                                {don.ten_gong && (
                                                  <div className="col-span-2 mt-0.5 text-gray-400">Gọng: {don.ten_gong}</div>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    )}

                                    {/* Lịch hẹn tab content */}
                                    {activeTab === 'lich-hen' && (
                                      henKhams.length === 0 ? (
                                        <p className="text-xs text-gray-400 py-4 text-center">Chưa có lịch hẹn nào.</p>
                                      ) : (
                                        <div className="space-y-2">
                                          {henKhams.map((hen) => {
                                            const st = TRANG_THAI_MAP[hen.trang_thai] || TRANG_THAI_MAP.cho;
                                            return (
                                              <div key={hen.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                                                <div className="flex items-start justify-between mb-1.5">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                      {new Date(hen.ngay_hen).toLocaleDateString('vi-VN')}
                                                      {hen.gio_hen && ` ${hen.gio_hen.substring(0, 5)}`}
                                                    </span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.color}`}>
                                                      {st.label}
                                                    </span>
                                                  </div>
                                                </div>
                                                {hen.ly_do && <div className="text-xs font-semibold text-gray-800 mb-0.5">{hen.ly_do}</div>}
                                                {hen.ghichu && <div className="text-[11px] text-gray-500 italic">{hen.ghichu}</div>}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                      );
                    })}
                    {paginated.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center py-2 text-muted-foreground">
                          Không tìm thấy bệnh nhân.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Desktop Pagination */}
            <div className="mt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  setCurrentPage(page);
                  setSelectedBenhNhanId(null);
                  setDonThuocs([]);
                  setChiTietDonThuocs({});
                  setDienTiens({});
                  setHenKhams([]);
                }}
              />
            </div>
          </div>
          </div>
        </div>        {/* Popup Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Sửa Bệnh Nhân' : 'Thêm Bệnh Nhân'}</DialogTitle>
              {isEditing && form.id && (
                <div className="text-sm text-gray-500">Mã BN: {form.id}</div>
              )}
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label>Họ Tên *</Label>
              <Input
                ref={tenRef}
                value={form.ten}
                onChange={(e) => {
                  const value = e.target.value;
                  // Tự động viết hoa chữ cái đầu mỗi từ khi người dùng nhập khoảng trắng
                  const lastChar = value.slice(-1);
                  if (lastChar === ' ' && value.trim()) {
                    setForm({ ...form, ten: capitalizeWords(value) });
                  } else {
                    setForm({ ...form, ten: value });
                  }
                }}
                onBlur={(e) => {
                  // Khi rời khỏi ô input, tự động capitalize toàn bộ
                  const value = e.target.value.trim();
                  if (value) {
                    setForm({ ...form, ten: capitalizeWords(value) });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    namsinhRef.current?.focus();
                    try { namsinhRef.current?.select?.(); } catch {}
                  }
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <Label>Năm sinh hoặc ngày sinh (yyyy hoặc dd/mm/yyyy) *</Label>
              <Input
                type="text"
                value={form.namsinh}
                placeholder="VD: 1980 hoặc 01/01/1980"
                ref={namsinhRef}
                onChange={(e) => setForm({ ...form, namsinh: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    dienthoaiRef.current?.focus();
                    try { dienthoaiRef.current?.select?.(); } catch {}
                  }
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <Label>Điện Thoại</Label>
              <Input
                ref={dienthoaiRef}
                value={form.dienthoai}
                onChange={(e) => setForm({ ...form, dienthoai: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    diachiRef.current?.focus();
                    try { diachiRef.current?.select?.(); } catch {}
                  }
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <Label>Địa Chỉ *</Label>
              <Input
                ref={diachiRef}
                value={form.diachi}
                onChange={(e) => setForm({ ...form, diachi: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    // cycle back to name for quick data entry
                    tenRef.current?.focus();
                    try { tenRef.current?.select?.(); } catch {}
                  }
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
            </div>
            <DialogFooter className="mt-2 flex items-center gap-2">
              {isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={async () => {
                    if (!form.id) { toast.error('Không xác định được ID bệnh nhân'); return; }
                    const confirmMessage = 'Bạn chắc chắn muốn xóa bệnh nhân này?\n\n⚠ TẤT CẢ đơn thuốc, đơn kính, diễn tiến sẽ bị xóa và KHÔNG THỂ HOÀN TÁC!';
                    if (!await confirm(confirmMessage)) return;
                    await handleDelete(form.id);
                    setOpen(false);
                  }}
                  className="mr-auto"
                >
                  Xóa
                </Button>
              )}
              <Button variant="outline" onClick={() => setOpen(false)}>
                Hủy
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} title="Ctrl+Enter để lưu" className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? 'Đang lưu...' : 'Lưu (Ctrl+Enter)'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog chọn bệnh nhân chính để gộp */}
        <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Chọn bệnh nhân chính để giữ lại</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-gray-600 mb-4">
                Chọn bệnh nhân muốn giữ lại. Tất cả đơn thuốc của các bệnh nhân khác sẽ được chuyển cho bệnh nhân này.
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {benhNhans
                  .filter(bn => selectedForMerge.includes(bn.id!))
                  .map((bn) => (
                    <div 
                      key={bn.id} 
                      className={`border rounded p-3 cursor-pointer transition-colors ${
                        mainPatientId === bn.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setMainPatientId(bn.id!)}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="mainPatient"
                          checked={mainPatientId === bn.id}
                          onChange={() => setMainPatientId(bn.id!)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {bn.ten} (ID: {bn.id})
                          </div>
                          <div className="text-sm text-gray-600">
                            Mã BN: {bn.id} • Năm sinh: {bn.namsinh} • SĐT: {bn.dienthoai || 'Chưa có'}
                          </div>
                          <div className="text-sm text-gray-500">
                            Địa chỉ: {bn.diachi}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowMergeDialog(false);
                  setMainPatientId(null);
                }}
              >
                Hủy
              </Button>
              <Button 
                onClick={handleConfirmMerge}
                disabled={!mainPatientId}
                className="bg-green-600 hover:bg-green-700"
              >
                Gộp bệnh nhân
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}