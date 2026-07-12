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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Users, Check, Pill, Eye, Search, UserPlus, Calendar, Phone, MapPin, PanelLeftOpen, BellRing, AlertTriangle } from "lucide-react";
import axios from "axios";
import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import ProtectedRoute from '../components/ProtectedRoute'
import { searchByStartsWith, capitalizeWords } from '@/lib/utils';
import ChoKhamPanel, { ChoKhamPanelRef } from '@/components/ChoKhamPanel';
import FamilyCard from '@/components/FamilyCard';
import { useBranch } from '../contexts/BranchContext';
import { buildActivityPatientRef, pushRecentActivity } from '@/lib/recentActivity';
import { usePermissions } from '@/hooks/usePermissions';

interface BenhNhan {
  id?: number;
  mabenhnhan?: string | null;
  ten: string;
  namsinh: string; // dd/mm/yyyy hoặc yyyy
  dienthoai: string;
  diachi: string;
  ghichu?: string | null;
  tuoi?: number;
  created_at?: string;
  ngay_kham_gan_nhat?: string;
  branch?: { id: string; ten_chi_nhanh: string } | null;
}

function calcPatientAge(namsinh: string): number {
  if (!namsinh) return 0;
  const now = new Date();
  if (/^\d{4}$/.test(namsinh)) return now.getFullYear() - parseInt(namsinh, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(namsinh)) {
    const [d, m, y] = namsinh.split('/').map(Number);
    let age = now.getFullYear() - y;
    const birthdayThisYear = new Date(now.getFullYear(), m - 1, d);
    if (now < birthdayThisYear) age--;
    return age;
  }
  return 0;
}

interface PatientNote {
  id: number;
  benhnhan_id: number;
  branch_id?: string | null;
  content: string;
  note_type: 'important' | 'normal';
  deleted_at?: string | null;
  created_at: string;
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

const WAITING_PANEL_COLLAPSED_KEY = 'benhNhan.waitingPanelCollapsed.v1';

export default function BenhNhanPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { isMultiBranch } = useBranch();
  const { role } = usePermissions();
  const canClearDoneCases = role === 'admin' || role === 'doctor';
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
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);
  const [selectedBenhNhanId, setSelectedBenhNhanId] = useState<number | null>(null);
  const [donThuocs, setDonThuocs] = useState<DonThuoc[]>([]);
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]);
  const [chiTietDonThuocs, setChiTietDonThuocs] = useState<Record<number, ChiTietDonThuoc[]>>({});
  const [dienTiens, setDienTiens] = useState<Record<number, DienTien[]>>({});
  const [henKhams, setHenKhams] = useState<HenKham[]>([]);
  const [openPatientNotesDialog, setOpenPatientNotesDialog] = useState<boolean>(false);
  const [notesPatient, setNotesPatient] = useState<BenhNhan | null>(null);
  const [patientNotes, setPatientNotes] = useState<PatientNote[]>([]);
  const [historyNotesByPatient, setHistoryNotesByPatient] = useState<Record<number, PatientNote[]>>({});
  const [loadingHistoryPatientId, setLoadingHistoryPatientId] = useState<number | null>(null);
  const [loadingPatientNotes, setLoadingPatientNotes] = useState<boolean>(false);
  const [noteForm, setNoteForm] = useState<{ content: string; note_type: 'important' | 'normal' }>({
    content: '',
    note_type: 'normal',
  });
  const [includeDeletedNotes, setIncludeDeletedNotes] = useState<boolean>(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteEditForm, setNoteEditForm] = useState<{ content: string; note_type: 'important' | 'normal' }>({
    content: '',
    note_type: 'normal',
  });
  const [notesViewMode, setNotesViewMode] = useState<'active' | 'all' | 'trash'>('active');
  const [total, setTotal] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>("don-thuoc");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isWaitingPanelCollapsed, setIsWaitingPanelCollapsed] = useState<boolean>(false);
  
  // Đặt tiêu đề trang tĩnh
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Bệnh nhân';
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storedState = window.localStorage.getItem(WAITING_PANEL_COLLAPSED_KEY);
      if (storedState !== null) {
        setIsWaitingPanelCollapsed(storedState === '1');
      }
    } catch {
      // Ignore localStorage errors to avoid breaking page render.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(WAITING_PANEL_COLLAPSED_KEY, isWaitingPanelCollapsed ? '1' : '0');
    } catch {
      // Ignore localStorage errors to keep interaction responsive.
    }
  }, [isWaitingPanelCollapsed]);

  // Nhận tham số từ FAB "Hồ sơ": /benh-nhan?search=...&focusId=...
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
      setDonThuocs([]);
      setDonKinhs([]);
      setChiTietDonThuocs({});
      setDienTiens({});
      setHenKhams([]);
      setActiveTab("don-thuoc");
    }

    if (focusRaw) {
      const parsedFocusId = Number(focusRaw);
      if (Number.isFinite(parsedFocusId) && parsedFocusId > 0) {
        pendingFocusPatientIdRef.current = parsedFocusId;
      }
    }
  }, [router.isReady, router.asPath]);

  // Sorting state - hỗ trợ multi-level sorting
  type SortField = 'ten' | 'namsinh' | 'tuoi' | 'dienthoai' | 'diachi' | 'created_at' | 'ngay_kham_gan_nhat';
  const [sortConfig, setSortConfig] = useState<Array<{ field: SortField; direction: 'asc' | 'desc' }>>([]);
  
  // States cho tính năng gộp bệnh nhân
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState<boolean>(false);
  const [mainPatientId, setMainPatientId] = useState<number | null>(null);

  // States cho vuốt card mobile: chỉ mở một card mỗi lần
  const SWIPE_ACTION_WIDTH_PX = 192;
  const [openSwipePatientId, setOpenSwipePatientId] = useState<number | null>(null);
  const [draggingPatientId, setDraggingPatientId] = useState<number | null>(null);
  const [dragOffsetPx, setDragOffsetPx] = useState<number>(0);
  const touchStartXRef = useRef<number>(0);
  const touchCurrentXRef = useRef<number>(0);
  const swipingPatientIdRef = useRef<number | null>(null);
  const swipeBaseOffsetRef = useRef<number>(0);
  const swipeRafRef = useRef<number | null>(null);
  const pendingDragOffsetRef = useRef<number>(0);

  // Refs for quick data entry in Add/Edit dialog
  const tenRef = useRef<HTMLInputElement | null>(null);
  const namsinhRef = useRef<HTMLInputElement | null>(null);
  const dienthoaiRef = useRef<HTMLInputElement | null>(null);
  const diachiRef = useRef<HTMLInputElement | null>(null);
  const initialAddFocusRef = useRef<'ten' | 'namsinh' | 'dienthoai' | 'diachi' | null>(null);
  const choKhamPanelRef = useRef<ChoKhamPanelRef>(null);
  const pendingFocusPatientIdRef = useRef<number | null>(null);

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

  const findPatientById = useCallback((benhNhanId: number) => {
    return benhNhans.find((bn) => bn.id === benhNhanId);
  }, [benhNhans]);

  const scheduleDragOffset = useCallback((offsetPx: number) => {
    pendingDragOffsetRef.current = offsetPx;
    if (swipeRafRef.current !== null) return;

    swipeRafRef.current = window.requestAnimationFrame(() => {
      setDragOffsetPx(pendingDragOffsetRef.current);
      swipeRafRef.current = null;
    });
  }, []);

  const handleSwipeStart = useCallback((patientId: number, e: React.TouchEvent<HTMLDivElement>) => {
    if (openSwipePatientId !== null && openSwipePatientId !== patientId) {
      setOpenSwipePatientId(null);
    }

    swipingPatientIdRef.current = patientId;
    touchStartXRef.current = e.touches[0]?.clientX ?? 0;
    touchCurrentXRef.current = touchStartXRef.current;
    swipeBaseOffsetRef.current = openSwipePatientId === patientId ? -SWIPE_ACTION_WIDTH_PX : 0;
    setDraggingPatientId(patientId);
    setDragOffsetPx(swipeBaseOffsetRef.current);
  }, [openSwipePatientId]);

  const handleSwipeMove = useCallback((patientId: number, e: React.TouchEvent<HTMLDivElement>) => {
    if (swipingPatientIdRef.current !== patientId) return;

    touchCurrentXRef.current = e.touches[0]?.clientX ?? touchStartXRef.current;

    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    const rawOffset = swipeBaseOffsetRef.current + deltaX;
    const clampedOffset = Math.max(-SWIPE_ACTION_WIDTH_PX, Math.min(0, rawOffset));
    scheduleDragOffset(clampedOffset);
  }, [scheduleDragOffset]);

  const handleSwipeEnd = useCallback((patientId: number) => {
    if (swipingPatientIdRef.current !== patientId) return;

    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    const rawOffset = swipeBaseOffsetRef.current + deltaX;
    const clampedOffset = Math.max(-SWIPE_ACTION_WIDTH_PX, Math.min(0, rawOffset));
    const shouldOpen = clampedOffset <= -SWIPE_ACTION_WIDTH_PX * 0.35;

    if (shouldOpen) {
      setOpenSwipePatientId(patientId);
    } else {
      setOpenSwipePatientId(null);
    }

    if (swipeRafRef.current !== null) {
      window.cancelAnimationFrame(swipeRafRef.current);
      swipeRafRef.current = null;
    }

    setDraggingPatientId(null);
    setDragOffsetPx(0);
    swipingPatientIdRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (swipeRafRef.current !== null) {
        window.cancelAnimationFrame(swipeRafRef.current);
      }
    };
  }, []);

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
  }, [router.isReady, router.pathname, router.asPath]);

  // Auto-focus the next field when opening dialog for creating new patient
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
        try { targetRef.current?.select?.(); } catch {}
        initialAddFocusRef.current = null;
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
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.response?.data?.error || error.message
          : error instanceof Error
            ? error.message
            : String(error);
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

  const loadHistoryNotesForTab = useCallback(async (benhnhanid: number) => {
    if (!benhnhanid) return;
    setLoadingHistoryPatientId(benhnhanid);
    try {
      const notesRes = await axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&includeDeleted=0&_t=${Date.now()}`);
      setHistoryNotesByPatient((prev) => ({
        ...prev,
        [benhnhanid]: notesRes.data?.data || [],
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

  // Khi đã tải xong list và có focusId từ query, tự mở hồ sơ bệnh nhân mục tiêu
  useEffect(() => {
    if (!router.isReady || typeof window === 'undefined') return;

    const focusId = pendingFocusPatientIdRef.current;
    if (!focusId) return;

    const targetExists = benhNhans.some((bn) => bn.id === focusId);
    if (!targetExists) return;

    setSelectedBenhNhanId(focusId);
    setActiveTab("don-thuoc");
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

    const params = new URLSearchParams(window.location.search);
    if (params.has('focusId')) {
      params.delete('focusId');
      const queryString = params.toString();
      const nextUrl = queryString ? `${router.pathname}?${queryString}` : router.pathname;
      router.replace(nextUrl, undefined, { shallow: true });
    }
  }, [benhNhans, fetchDonThuoc, findPatientById, loadHistoryNotesForTab, router.isReady, router.pathname]);

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
        loadHistoryNotesForTab(benhnhanid);

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
    [selectedBenhNhanId, fetchDonThuoc, loadHistoryNotesForTab, buildActivityPatient, findPatientById]
  );

  // Mở hồ sơ 1 thành viên khác trong nhóm gia đình.
  // Điều hướng qua query string để dùng lại flow focusId hiện có
  // (effect ở phía trên sẽ reset search + queue focus).
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

  const handleHistoryTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);

      if (!selectedBenhNhanId) return;
      if (tab !== 'don-thuoc' && tab !== 'don-kinh') return;

      const patient = buildActivityPatient(findPatientById(selectedBenhNhanId));
      if (!patient) return;

      pushRecentActivity({
        action: tab === 'don-thuoc' ? 'open_rx_drug' : 'open_rx_glasses',
        patient,
        source: 'benh-nhan_history_tab',
      });
    },
    [buildActivityPatient, findPatientById, selectedBenhNhanId]
  );

  const loadPatientNotes = useCallback(async (benhnhanid: number, options?: { includeDeleted?: boolean }) => {
    if (!benhnhanid) return;
    const includeDeleted = options?.includeDeleted ?? includeDeletedNotes;
    setLoadingPatientNotes(true);
    try {
      const notesRes = await axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&includeDeleted=${includeDeleted ? 1 : 0}&_t=${Date.now()}`);
      setPatientNotes(notesRes.data?.data || []);
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
      await axios.post('/api/benh-nhan/notes', {
        benhnhanid: notesPatient.id,
        content: noteForm.content,
        note_type: noteForm.note_type,
      });
      toast.success('Đã thêm ghi chú');
      setNoteForm({ content: '', note_type: 'normal' });
      loadPatientNotes(notesPatient.id);
      loadHistoryNotesForTab(notesPatient.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi tạo ghi chú: ${message}`);
    }
  }, [noteForm, notesPatient, loadPatientNotes, loadHistoryNotesForTab]);

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
      await axios.put('/api/benh-nhan/notes', {
        id: editingNoteId,
        content: noteEditForm.content,
        note_type: noteEditForm.note_type,
      });
      toast.success('Đã cập nhật ghi chú');
      setEditingNoteId(null);
      loadPatientNotes(notesPatient.id);
      loadHistoryNotesForTab(notesPatient.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi cập nhật ghi chú: ${message}`);
    }
  }, [editingNoteId, notesPatient, loadPatientNotes, noteEditForm, loadHistoryNotesForTab]);

  const deleteNote = useCallback(async (id: number) => {
    if (!notesPatient?.id) return;
    const ok = await confirm('Bạn có chắc muốn chuyển ghi chú này vào thùng rác?');
    if (!ok) return;
    try {
      await axios.delete('/api/benh-nhan/notes', { data: { id } });
      toast.success('Đã chuyển ghi chú vào thùng rác');
      loadPatientNotes(notesPatient.id);
      loadHistoryNotesForTab(notesPatient.id);
    } catch {
      toast.error('Lỗi xóa ghi chú');
    }
  }, [confirm, notesPatient, loadPatientNotes, loadHistoryNotesForTab]);

  const restoreNote = useCallback(async (id: number) => {
    if (!notesPatient?.id) return;
    try {
      await axios.patch('/api/benh-nhan/notes', { id });
      toast.success('Đã khôi phục ghi chú');
      loadPatientNotes(notesPatient.id);
      loadHistoryNotesForTab(notesPatient.id);
    } catch {
      toast.error('Lỗi khôi phục ghi chú');
    }
  }, [notesPatient, loadPatientNotes, loadHistoryNotesForTab]);

  const purgeNote = useCallback(async (id: number) => {
    if (!notesPatient?.id) return;
    const ok = await confirm('Bạn sắp xóa vĩnh viễn ghi chú này. Hành động không thể hoàn tác. Tiếp tục?');
    if (!ok) return;
    const verify = window.prompt('Nhập XOA VINH VIEN để xác nhận:', '');
    if ((verify || '').trim().toUpperCase() !== 'XOA VINH VIEN') return;

    try {
      await axios.delete('/api/benh-nhan/notes?hard=1', { data: { id, hard: true } });
      toast.success('Đã xóa vĩnh viễn ghi chú');
      loadPatientNotes(notesPatient.id);
      loadHistoryNotesForTab(notesPatient.id);
    } catch {
      toast.error('Lỗi xóa vĩnh viễn ghi chú');
    }
  }, [confirm, loadPatientNotes, notesPatient, loadHistoryNotesForTab]);

  const extractPatientSeedFromSearch = useCallback((raw: string) => {
    const input = raw.trim();
    if (!input) {
      return { ten: '', namsinh: '', dienthoai: '', diachi: '' };
    }

    const normalizedInput = input.replace(/[\s,;]+/g, ' ').trim();
    const normalizeWords = (text: string) => capitalizeWords(text.replace(/[\s,;._-]+/g, ' ').trim());
    const splitDob = (text: string) => {
      const fullDateMatch = text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/);
      if (fullDateMatch && fullDateMatch.index !== undefined) {
        const idx = fullDateMatch.index;
        const token = fullDateMatch[0];
        return {
          dob: fullDateMatch[1].replace(/-/g, '/'),
          before: text.slice(0, idx).trim(),
          after: text.slice(idx + token.length).trim(),
        };
      }

      const yearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch && yearMatch.index !== undefined) {
        const idx = yearMatch.index;
        const token = yearMatch[0];
        return {
          dob: yearMatch[1],
          before: text.slice(0, idx).trim(),
          after: text.slice(idx + token.length).trim(),
        };
      }

      return { dob: '', before: text.trim(), after: '' };
    };

    let working = '';
    let namsinh = '';
    let diachi = '';

    let dienthoai = '';
    const phoneCompactMatch = normalizedInput.match(/(?:\+?84|0)\d{8,10}\b/);
    let phoneStart = -1;
    let phoneEnd = -1;

    if (phoneCompactMatch) {
      dienthoai = phoneCompactMatch[0].replace(/\D/g, '');
      phoneStart = phoneCompactMatch.index ?? -1;
      if (phoneStart >= 0) {
        phoneEnd = phoneStart + phoneCompactMatch[0].length;
      }
    } else {
      const fallbackMatch = [...normalizedInput.matchAll(/\d{6,}/g)]
        .sort((a, b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0))[0];

      if (fallbackMatch?.[0]) {
        dienthoai = fallbackMatch[0];
        phoneStart = fallbackMatch.index ?? -1;
        if (phoneStart >= 0) {
          phoneEnd = phoneStart + fallbackMatch[0].length;
        }
      }
    }

    if (phoneStart >= 0) {
      const beforePhone = normalizedInput.slice(0, phoneStart).trim();
      const afterPhone = normalizedInput.slice(phoneEnd).trim();
      const hasLettersBeforePhone = /[A-Za-zÀ-ỹ]/.test(beforePhone);

      if (hasLettersBeforePhone) {
        const leftParsed = splitDob(beforePhone);
        namsinh = leftParsed.dob;
        working = leftParsed.before;
        diachi = normalizeWords(`${leftParsed.after} ${afterPhone}`.trim());
      } else {
        const rightParsed = splitDob(afterPhone);
        namsinh = rightParsed.dob;
        working = rightParsed.before;
        diachi = normalizeWords(rightParsed.after);
      }
    } else {
      const parsed = splitDob(normalizedInput);
      namsinh = parsed.dob;
      working = parsed.before;
      diachi = normalizeWords(parsed.after);
    }

    const ten = normalizeWords(working);
    return { ten, namsinh, dienthoai, diachi };
  }, []);

  const openCreatePatientFromSearch = useCallback(() => {
    const seed = extractPatientSeedFromSearch(search);

    setIsEditing(false);
    setForm({
      ten: seed.ten,
      namsinh: seed.namsinh,
      dienthoai: seed.dienthoai,
      diachi: seed.diachi,
    });

    if (!seed.ten) {
      initialAddFocusRef.current = 'ten';
    } else if (!seed.namsinh) {
      initialAddFocusRef.current = 'namsinh';
    } else if (!seed.dienthoai) {
      initialAddFocusRef.current = 'dienthoai';
    } else {
      initialAddFocusRef.current = 'diachi';
    }

    setOpen(true);
  }, [extractPatientSeedFromSearch, search]);

  

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
        const res = await axios.put('/api/benh-nhan', finalForm);
        const updated = (res.data?.data ?? finalForm) as BenhNhan;
        toast.success('Đã cập nhật bệnh nhân');
        setBenhNhans((prev) => prev.map((bn) => (
          bn.id === updated.id
            ? { ...bn, ...updated, tuoi: calcPatientAge(updated.namsinh) }
            : bn
        )));
      } else {
        const res = await axios.post('/api/benh-nhan', finalForm);
        const created = res.data?.data as BenhNhan;
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
      const message = axios.isAxiosError(error) && error.response?.data
        ? [error.response.data.message, error.response.data.error].filter(Boolean).join(': ')
        : error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi khi xóa bệnh nhân: ${message}`);
    }
  }, [selectedBenhNhanId]);

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

    Promise.resolve(choKhamPanelRef.current?.addPatient(benhNhanId)).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Không thêm được vào chờ khám';
      toast.error(message);
    });

    router.push(url);
  }, [buildActivityPatient, router]);

  const handleAddPatientToWaiting = useCallback((bn: BenhNhan) => {
    if (!bn.id) return;

    Promise.resolve(choKhamPanelRef.current?.addPatient(bn.id)).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Không thêm được vào chờ khám';
      toast.error(message);
    });

    const patient = buildActivityPatient(bn);
    if (patient) {
      pushRecentActivity({
        action: 'add_waiting',
        patient,
        source: 'benh-nhan_waiting',
      });
    }
  }, [buildActivityPatient]);

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
    // API /api/benh-nhan đã phân trang theo currentPage + rowsPerPage,
    // nên không slice lần nữa ở client để tránh trang 2/3 bị rỗng.
    () => sortedFiltered,
    [sortedFiltered]
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

  const visibleNotes = useMemo(() => {
    if (notesViewMode === 'trash') return patientNotes.filter((a) => Boolean(a.deleted_at));
    if (notesViewMode === 'all') return patientNotes;
    return patientNotes.filter((a) => !a.deleted_at);
  }, [notesViewMode, patientNotes]);

  return (
    <ProtectedRoute>
      <Head>
        <meta name="theme-color" content="#3a7efb" key="theme-color" />
        <meta name="msapplication-navbutton-color" content="#3a7efb" key="msapplication-navbutton-color" />
      </Head>
      <div className="px-2 pb-2 pt-0 lg:p-4">
        
        {/* Mobile Layout */}
  <div className="block md:hidden">
          {/* Header Mobile */}
          <div className="sticky top-0 z-30 -mx-2 bg-[#1976D2] px-2.5 py-2">
            <div className="flex items-center gap-2">
              <Search className="w-[1.6rem] h-[1.6rem] text-white shrink-0" />
              <div className="flex-1 overflow-hidden">
                <Input
                  placeholder="Tên hoặc SĐT"
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
                  className="h-10 border-0 bg-transparent text-white placeholder:text-white/80 shadow-none focus:bg-white focus:text-gray-900 focus:placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <Button
                type="button"
                className={`shrink-0 rounded-none border-0 bg-transparent text-white shadow-none hover:bg-transparent ${selectedForMerge.length > 0 ? 'h-10 px-2' : 'h-12 w-14 p-0'}`}
                onClick={() => {
                  if (selectedForMerge.length > 0) {
                    handleMergePatients();
                    return;
                  }

                  openCreatePatientFromSearch();
                }}
              >
                {selectedForMerge.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-5 h-5" />
                    Gộp BN
                  </span>
                ) : (
                  <UserPlus className="size-[1.6rem]" />
                )}
              </Button>
            </div>
          </div>

          {/* Patient List Mobile */}
          <div className="mt-0 -mx-2">
            <div className="space-y-0">
              {paginated.length === 0 ? (
                <p className="px-2 py-2 text-sm text-gray-500">Không tìm thấy bệnh nhân.</p>
              ) : (
                paginated.map((bn, index) => {
                  const isSelected = selectedForMerge.includes(bn.id!);
                  const isSwipeOpen = openSwipePatientId === bn.id;
                  const isDraggingThisCard = draggingPatientId === bn.id;
                  const ngaySinhText = typeof bn.namsinh === 'number' ? `${bn.namsinh}` : (bn.namsinh || '--');
                  const cardTranslateX = isDraggingThisCard
                    ? dragOffsetPx
                    : (isSwipeOpen ? -SWIPE_ACTION_WIDTH_PX : 0);
                  
                  return (
                  <div key={bn.id} className="space-y-2">
                    {/* Vuốt ngang để lộ action panel giống FAB list */}
                    <div className={`relative bg-white overflow-hidden border-x border-b border-gray-200 ${index === 0 ? 'border-t' : ''}`}>
                      <div
                        className="absolute inset-y-0 right-0 grid grid-cols-3 overflow-hidden rounded-l-lg"
                        style={{ width: SWIPE_ACTION_WIDTH_PX }}
                      >
                        <button
                          type="button"
                          className="h-full bg-red-600 text-white text-[11px] font-semibold leading-tight active:bg-red-700 flex flex-col items-center justify-center gap-1 px-1"
                          onClick={() => {
                            setOpenSwipePatientId(null);
                            handleEdit(bn);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="h-full bg-blue-600 text-white text-[11px] font-semibold leading-tight active:bg-blue-700 flex flex-col items-center justify-center gap-1 px-1"
                          onClick={() => openPrescriptionFromList(bn, 'thuoc')}
                        >
                          <Pill className="w-3.5 h-3.5" />
                          Đơn thuốc
                        </button>
                        <button
                          type="button"
                          className="h-full bg-emerald-600 text-white text-[11px] font-semibold leading-tight active:bg-emerald-700 flex flex-col items-center justify-center gap-1 px-1"
                          onClick={() => openPrescriptionFromList(bn, 'kinh')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Đơn kính
                        </button>
                      </div>

                      <div
                        className={`relative p-3 touch-pan-y ${isDraggingThisCard ? '' : 'transition-transform duration-200 ease-out'} ${isSelected ? 'bg-green-100' : 'bg-white'}`}
                        style={{
                          transform: `translateX(${cardTranslateX}px)`,
                          willChange: 'transform',
                        }}
                        onTouchStart={(e) => handleSwipeStart(bn.id!, e)}
                        onTouchMove={(e) => handleSwipeMove(bn.id!, e)}
                        onTouchEnd={() => handleSwipeEnd(bn.id!)}
                        onTouchCancel={() => handleSwipeEnd(bn.id!)}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-green-700 border-green-700 text-white'
                                : 'bg-blue-100 border-blue-200 text-blue-700'
                            }`}
                            onClick={() => toggleSelectForMerge(bn.id!)}
                            aria-pressed={isSelected}
                            title={isSelected ? 'Bỏ chọn gộp' : 'Chọn để gộp'}
                          >
                            {isSelected ? <Check className="w-4 h-4" /> : (bn.ten || '?')[0]?.toUpperCase()}
                          </button>

                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left"
                            onClick={() => {
                              setOpenSwipePatientId(null);
                              handleSelectBenhNhan(bn.id!);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <span className={`flex-1 min-w-0 text-[16px] leading-5 truncate ${isSelected ? 'font-bold text-green-800' : 'font-semibold text-gray-800'}`}>
                                {bn.ten}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[13px] text-gray-500 shrink-0 ml-2">
                                <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
                                {ngaySinhText}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-700 min-w-0">
                              <span className="inline-flex items-center gap-1.5">
                                <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                                {bn.dienthoai || '--'}
                              </span>
                              <span className="inline-flex items-center gap-1.5 min-w-0 flex-1">
                                <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
                                <span className="truncate">{bn.diachi || '--'}</span>
                              </span>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Medical History Mobile */}
                    {selectedBenhNhanId === bn.id && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="mb-2">
                          <h3 className="font-medium text-sm">📋 Lịch sử khám bệnh</h3>
                        </div>
                        <Tabs value={activeTab} onValueChange={handleHistoryTabChange} className="w-full">
                          <TabsList className="mb-2 w-full justify-start overflow-x-auto">
                            <TabsTrigger value="don-thuoc">Đơn thuốc ({filteredDonThuocs.length})</TabsTrigger>
                            <TabsTrigger value="don-kinh">Đơn kính ({donKinhs.length})</TabsTrigger>
                            <TabsTrigger value="lich-hen">Lịch hẹn ({henKhams.length})</TabsTrigger>
                            <TabsTrigger value="gia-dinh">Gia đình</TabsTrigger>
                            <TabsTrigger value="ghi-chu">Ghi chú</TabsTrigger>
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

                          <TabsContent value="gia-dinh" className="mt-2">
                            <FamilyCard
                              benhnhanId={bn.id!}
                              patientName={bn.ten || ''}
                              onSelectMember={handleOpenFamilyMember}
                            />
                          </TabsContent>

                          <TabsContent value="ghi-chu" className="mt-2">
                            {loadingHistoryPatientId === bn.id ? (
                              <p className="text-xs text-gray-500">Đang tải ghi chú...</p>
                            ) : ((historyNotesByPatient[bn.id!] || []).filter((a) => !a.deleted_at).length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có ghi chú nào.</p>
                            ) : (
                              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                                {(historyNotesByPatient[bn.id!] || [])
                                  .filter((a) => !a.deleted_at)
                                  .map((a) => (
                                    <div key={a.id} className="bg-white border rounded-lg p-2.5 shadow-sm">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-[11px] text-gray-500">
                                          {new Date(a.created_at).toLocaleTimeString('vi-VN')} - {new Date(a.created_at).toLocaleDateString('vi-VN')}
                                        </p>
                                        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${a.note_type === 'important' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                                          {a.note_type === 'important' ? 'Quan trọng' : 'Thông thường'}
                                        </span>
                                      </div>
                                      <p className="mt-1.5 whitespace-pre-wrap text-xs text-gray-800">{a.content}</p>
                                    </div>
                                  ))}
                              </div>
                            ))}
                            <div className="mt-2">
                              <Button size="sm" variant="outline" className="h-8" onClick={() => openPatientNotesManager(bn)}>
                                <BellRing className="w-3.5 h-3.5 mr-1" /> Quản lý ghi chú
                              </Button>
                            </div>
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
            <div className="mt-3 pt-3 px-2">
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

              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-600">
                <span>{filtered.length} bệnh nhân</span>
                <div className="flex items-center gap-1.5">
                  <span>/ trang</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(+e.target.value);
                      setCurrentPage(1);
                    }}
                    className="border px-2 py-1 rounded h-8 bg-white text-sm"
                  >
                    {[50, 100, 200].map((val) => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedForMerge.length > 0 && (
                <div className="mt-1 text-xs text-blue-600 font-medium">
                  Đã chọn {selectedForMerge.length} để gộp
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Layout - Keep original */}
  <div className="hidden md:flex gap-4">
          {/* Left: Danh sách chờ khám */}
          <div className={`relative shrink-0 transition-all duration-300 ${isWaitingPanelCollapsed ? 'w-0' : 'w-72'}`}>
            <div className={`${isWaitingPanelCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'} transition-opacity duration-200`}>
              <ChoKhamPanel
                ref={choKhamPanelRef}
                onCollapse={() => setIsWaitingPanelCollapsed(true)}
                canClearDoneCases={canClearDoneCases}
              />
            </div>
            {isWaitingPanelCollapsed && (
              <Button
                type="button"
                variant="outline"
                className="fixed left-0 top-16 z-40 rounded-l-none rounded-r-md border-l-0 bg-white !px-1.5 !py-1 h-auto min-h-0 w-auto min-w-0 text-xs leading-none shadow-md"
                onClick={() => setIsWaitingPanelCollapsed(false)}
                title="Hiện danh sách chờ khám"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                <PanelLeftOpen className="w-3.5 h-3.5 mb-0.5" /> Hiện chờ khám
              </Button>
            )}
          </div>
          {/* Right: Danh sách bệnh nhân */}
          <div className="flex-1 min-w-0">
          <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">Quản Lý Bệnh Nhân</h1>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Tên hoặc SĐT..."
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
                    openCreatePatientFromSearch();
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
                  {[50, 100, 200, 500, 1000].map((val) => (
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
                                variant="outline"
                                className="h-7 w-7 p-0"
                                onClick={() => openPatientNotesManager(bn)}
                                title="Ghi chú bệnh nhân"
                              >
                                <AlertTriangle className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 w-7 p-0 bg-yellow-500 hover:bg-yellow-600 text-white"
                                onClick={() => handleAddPatientToWaiting(bn)}
                                title="Thêm vào chờ khám"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                              <div className="flex items-center rounded-md overflow-hidden border border-blue-600 ml-0.5">
                                <button
                                  className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                                  onClick={() => openPrescriptionFromList(bn, 'thuoc')}
                                  title="Kê đơn thuốc"
                                >
                                  Thuốc
                                </button>
                                <div className="w-px h-5 bg-blue-400" />
                                <button
                                  className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                                  onClick={() => openPrescriptionFromList(bn, 'kinh')}
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
                                      onClick={() => handleHistoryTabChange('don-thuoc')}
                                      className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${
                                        activeTab === 'don-thuoc'
                                          ? 'bg-white text-blue-700 border border-b-white -mb-[9px] pb-[13px] shadow-sm'
                                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      📋 Đơn thuốc ({filteredDonThuocs.length})
                                    </button>
                                    <button
                                      onClick={() => handleHistoryTabChange('don-kinh')}
                                      className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${
                                        activeTab === 'don-kinh'
                                          ? 'bg-white text-blue-700 border border-b-white -mb-[9px] pb-[13px] shadow-sm'
                                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      👓 Đơn kính ({donKinhs.length})
                                    </button>
                                    <button
                                      onClick={() => handleHistoryTabChange('lich-hen')}
                                      className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${
                                        activeTab === 'lich-hen'
                                          ? 'bg-white text-blue-700 border border-b-white -mb-[9px] pb-[13px] shadow-sm'
                                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      📅 Lịch hẹn ({henKhams.length})
                                    </button>
                                    <button
                                      onClick={() => handleHistoryTabChange('gia-dinh')}
                                      className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${
                                        activeTab === 'gia-dinh'
                                          ? 'bg-white text-blue-700 border border-b-white -mb-[9px] pb-[13px] shadow-sm'
                                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      👨‍👩‍👧‍👦 Gia đình
                                    </button>
                                    <button
                                      onClick={() => handleHistoryTabChange('ghi-chu')}
                                      className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${
                                        activeTab === 'ghi-chu'
                                          ? 'bg-white text-blue-700 border border-b-white -mb-[9px] pb-[13px] shadow-sm'
                                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      📝 Ghi chú
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

                                    {activeTab === 'gia-dinh' && (
                                      <FamilyCard
                                        benhnhanId={bn.id!}
                                        patientName={bn.ten || ''}
                                        onSelectMember={handleOpenFamilyMember}
                                      />
                                    )}

                                    {activeTab === 'ghi-chu' && (
                                      <div className="space-y-2">
                                        {loadingHistoryPatientId === bn.id ? (
                                          <p className="text-xs text-gray-500">Đang tải ghi chú...</p>
                                        ) : ((historyNotesByPatient[bn.id!] || []).filter((a) => !a.deleted_at).length === 0 ? (
                                          <p className="text-xs text-gray-400 py-4 text-center">Chưa có ghi chú nào.</p>
                                        ) : (
                                          <div className="space-y-2">
                                            {(historyNotesByPatient[bn.id!] || [])
                                              .filter((a) => !a.deleted_at)
                                              .map((a) => (
                                                <div key={a.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                                                  <div className="flex items-start justify-between gap-2">
                                                    <p className="text-xs text-gray-500">
                                                      {new Date(a.created_at).toLocaleTimeString('vi-VN')} - {new Date(a.created_at).toLocaleDateString('vi-VN')}
                                                    </p>
                                                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${a.note_type === 'important' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                                                      {a.note_type === 'important' ? 'Quan trọng' : 'Thông thường'}
                                                    </span>
                                                  </div>
                                                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{a.content}</p>
                                                </div>
                                              ))}
                                          </div>
                                        ))}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-8"
                                          onClick={() => openPatientNotesManager(bn)}
                                        >
                                          <BellRing className="w-3.5 h-3.5 mr-1" /> Quản lý ghi chú
                                        </Button>
                                      </div>
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
                <div className="text-sm text-gray-500">Mã BN: {form.mabenhnhan || '—'}</div>
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
                onChange={(e) => {
                  const value = e.target.value;
                  const lastChar = value.slice(-1);
                  if (lastChar === ' ' && value.trim()) {
                    setForm({ ...form, diachi: capitalizeWords(value) });
                  } else {
                    setForm({ ...form, diachi: value });
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value) {
                    setForm({ ...form, diachi: capitalizeWords(value) });
                  }
                }}
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

        <Dialog open={openPatientNotesDialog} onOpenChange={setOpenPatientNotesDialog}>
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
                      const mode = e.target.value as 'active' | 'all' | 'trash';
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
                    onClick={() => setOpenPatientNotesDialog(false)}
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
                  {visibleNotes.length === 0 && <p className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">Không có ghi chú trong bộ lọc hiện tại.</p>}
                  {visibleNotes.map((a) => (
                    <div key={a.id} className={`rounded-lg border px-3 py-3 ${a.deleted_at ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-gray-500">{new Date(a.created_at).toLocaleTimeString('vi-VN')} - {new Date(a.created_at).toLocaleDateString('vi-VN')}</p>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${a.note_type === 'important' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                          {a.note_type === 'important' ? 'Quan trọng' : 'Thông thường'}
                        </span>
                      </div>

                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{a.content}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {!a.deleted_at ? (
                          <>
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => startEditNote(a)}>Sửa</Button>
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded-md px-3 text-xs text-red-700 border-red-300 hover:bg-red-50" onClick={() => deleteNote(a.id)}>Xóa</Button>
                          </>
                        ) : (
                          <>
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => restoreNote(a.id)}>Khôi phục</Button>
                            <Button type="button" variant="destructive" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => purgeNote(a.id)}>Xóa hẳn</Button>
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
                            <Button type="button" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={saveEditNote}>Lưu</Button>
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
                  <Button type="button" className="h-10 w-full rounded-md" onClick={createPatientNote}>Lưu ghi chú</Button>
                </div>
              </div>
            )}

            <DialogFooter className="border-t border-gray-200 px-5 py-3">
              <Button variant="outline" onClick={() => setOpenPatientNotesDialog(false)} className="rounded-md px-4">
                Đóng
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
                            Mã BN: {bn.mabenhnhan || '—'} • Năm sinh: {bn.namsinh} • SĐT: {bn.dienthoai || 'Chưa có'}
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