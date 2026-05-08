//src/pages/don-kinh.tsx
'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pagination, SimplePagination } from '@/components/ui/pagination';
import { Trash2, Pencil, Settings, Phone, MessageSquare, MessageCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';

interface DonKinh {
  id: number;
  benhnhanid: number;
  chandoan: string;
  ngaykham: string;
  giatrong: number;
  giagong: number;
  ghichu: string | null;
  thiluc_khongkinh_mp: string | null;
  thiluc_kinhcu_mp: string | null;
  thiluc_kinhmoi_mp: string | null;
  sokinh_cu_mp: string | null;
  sokinh_moi_mp: string | null;
  hangtrong_mp: string | null;
  ax_mp: number | null;
  thiluc_khongkinh_mt: string | null;
  thiluc_kinhcu_mt: string | null;
  thiluc_kinhmoi_mt: string | null;
  sokinh_cu_mt: string | null;
  sokinh_moi_mt: string | null;
  hangtrong_mt: string | null;
  ax_mt: number | null;
  no: boolean;
  sotien_da_thanh_toan: number;
  lai: number;
  benhnhan: {
    id: number;
    ten: string | null;
    namsinh: string | null; // sửa lại kiểu string để nhận yyyy hoặc dd/mm/yyyy
    dienthoai: string | null;
    diachi: string | null;
    tuoi?: number; // thêm trường tuổi nếu có
  };
  branch?: { id: string; ten_chi_nhanh: string } | null;
}

// Hàm tính tuổi từ namsinh (yyyy hoặc dd/mm/yyyy)
function calcAge(namsinh: string | null): number | "" {
  if (!namsinh) return "";
  const now = new Date();
  if (/^\d{4}$/.test(namsinh)) {
    return now.getFullYear() - parseInt(namsinh, 10);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(namsinh)) {
    const [d, m, y] = namsinh.split("/").map(Number);
    let age = now.getFullYear() - y;
    const birthdayThisYear = new Date(now.getFullYear(), m - 1, d);
    if (now < birthdayThisYear) age--;
    return age;
  }
  return "";
}

function getTodayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function formatMobileOrderTime(dateValue: string): string {
  return new Date(dateValue).toLocaleTimeString('vi-VN', {
    timeZone: APP_TIME_ZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMobileOrderDateKey(dateValue: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(dateValue));
}

function formatMobileOrderDayLabel(dateValue: string): string {
  const raw = new Intl.DateTimeFormat('vi-VN', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateValue));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function normalizeDialPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/[^\d+]/g, '');
}

function normalizeZaloPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `84${digits.slice(1)}`;
  return digits;
}

interface MobileDonKinhOrderCardProps {
  dk: DonKinh;
  showProfitUnlocked: boolean;
  isExpanded: boolean;
  isProfitRevealed: boolean;
  onToggleExpand: (id: number) => void;
  onRevealProfit: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
  formatMoney: (amount: number) => string;
  formatTime: (value: string) => string;
}

const PROFIT_REVEAL_WIDTH = 92;
const PROFIT_SWIPE_THRESHOLD = 38;

const MobileDonKinhOrderCard = React.memo(function MobileDonKinhOrderCard({
  dk,
  showProfitUnlocked,
  isExpanded,
  isProfitRevealed,
  onToggleExpand,
  onRevealProfit,
  onDelete,
  formatMoney,
  formatTime,
}: MobileDonKinhOrderCardProps) {
  const swipeRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const lockAxisRef = useRef<'x' | 'y' | null>(null);
  const draggingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const suppressToggleClickRef = useRef(false);

  const totalAmount = dk.giatrong + dk.giagong;
  const debtAmount = totalAmount - dk.sotien_da_thanh_toan;
  const isDebt = debtAmount > 0;
  const rightInfoWidthClass = isDebt ? 'w-[104px]' : 'w-[88px]';
  const rightInfoPaddingClass = isDebt ? 'pr-[110px]' : 'pr-[94px]';
  const rawPhone = (dk.benhnhan.dienthoai || '').trim();
  const dialPhone = normalizeDialPhone(rawPhone);
  const zaloPhone = normalizeZaloPhone(rawPhone);
  const hasPhone = dialPhone.length > 0;

  const applyOffset = useCallback((offset: number, animate: boolean) => {
    const node = swipeRef.current;
    if (!node) return;
    node.style.transition = animate
      ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
      : 'none';
    node.style.transform = `translate3d(${offset}px, 0, 0)`;
    currentOffsetRef.current = offset;
  }, []);

  useEffect(() => {
    const targetOffset = isProfitRevealed && showProfitUnlocked ? -PROFIT_REVEAL_WIDTH : 0;
    applyOffset(targetOffset, true);
  }, [applyOffset, isProfitRevealed, showProfitUnlocked]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const queueOffset = useCallback((offset: number) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      applyOffset(offset, false);
      frameRef.current = null;
    });
  }, [applyOffset]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!showProfitUnlocked) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressToggleClickRef.current = false;
    pointerIdRef.current = e.pointerId;
    draggingRef.current = true;
    lockAxisRef.current = null;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startOffsetRef.current = isProfitRevealed ? -PROFIT_REVEAL_WIDTH : 0;
    applyOffset(startOffsetRef.current, false);
  }, [applyOffset, isProfitRevealed, showProfitUnlocked]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || pointerIdRef.current !== e.pointerId) return;

    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;

    if (!lockAxisRef.current) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < 7 && absY < 7) return;
      lockAxisRef.current = absX > absY ? 'x' : 'y';
      if (lockAxisRef.current === 'x' && swipeRef.current) {
        suppressToggleClickRef.current = true;
        swipeRef.current.setPointerCapture(e.pointerId);
        swipeRef.current.style.willChange = 'transform';
      }
    }

    if (lockAxisRef.current !== 'x') return;
    if (deltaX > 0) return;

    const nextOffset = Math.max(
      -PROFIT_REVEAL_WIDTH,
      startOffsetRef.current + deltaX
    );
    queueOffset(nextOffset);
  }, [queueOffset]);

  const finalizeSwipe = useCallback((pointerId: number) => {
    if (!draggingRef.current || pointerIdRef.current !== pointerId) return;

    const lockAxis = lockAxisRef.current;
    draggingRef.current = false;
    pointerIdRef.current = null;
    lockAxisRef.current = null;

    if (swipeRef.current?.hasPointerCapture(pointerId)) {
      swipeRef.current.releasePointerCapture(pointerId);
    }
    if (swipeRef.current) {
      swipeRef.current.style.willChange = 'auto';
    }

    if (lockAxis !== 'x') return;

    if (!isProfitRevealed && currentOffsetRef.current <= -PROFIT_SWIPE_THRESHOLD) {
      onRevealProfit(dk.id);
      return;
    }

    const targetOffset = isProfitRevealed && showProfitUnlocked ? -PROFIT_REVEAL_WIDTH : 0;
    applyOffset(targetOffset, true);
  }, [applyOffset, dk.id, isProfitRevealed, onRevealProfit, showProfitUnlocked]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    finalizeSwipe(e.pointerId);
  }, [finalizeSwipe]);

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    finalizeSwipe(e.pointerId);
  }, [finalizeSwipe]);

  const handleToggleExpand = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (suppressToggleClickRef.current) {
      suppressToggleClickRef.current = false;
      return;
    }
    onToggleExpand(dk.id);
  }, [dk.id, onToggleExpand]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border shadow-sm ${isDebt ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200 bg-white'}`}
      onClick={handleToggleExpand}
    >
      {showProfitUnlocked && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-[92px] items-center justify-center border-l border-emerald-200 bg-emerald-50">
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Lãi</p>
            <p className="text-sm font-bold text-emerald-700">{formatMoney(dk.lai)}k</p>
          </div>
        </div>
      )}

      <div
        ref={swipeRef}
        className="relative"
        style={{ transform: 'translate3d(0px, 0, 0)', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <CardContent className="space-y-2.5 p-3">
          <div className="relative">
            <div className={`absolute right-0 top-0 text-right ${rightInfoWidthClass}`}>
              <p className="text-xs text-slate-500">{formatTime(dk.ngaykham)}</p>
              <p className="mt-0.5 text-xl font-semibold leading-none text-blue-700">{formatMoney(totalAmount)}k</p>
              {isDebt && (
                <p className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Nợ: {formatMoney(debtAmount)}k
                </p>
              )}
            </div>
            <h3 className={`min-w-0 truncate text-base font-semibold leading-tight text-slate-800 ${rightInfoPaddingClass}`}>{dk.benhnhan.ten || 'Không có tên'}</h3>
          </div>

          {isExpanded ? (
            <div className={`space-y-1 text-[13px] text-slate-700 ${rightInfoPaddingClass}`}>
              <p>
                <span className="font-medium text-slate-500">Ngày sinh: </span>
                {dk.benhnhan.namsinh || '-'}
              </p>
              <p>
                <span className="font-medium text-slate-500">Số điện thoại: </span>
                {rawPhone || '-'}
              </p>
              <p className="break-words">
                <span className="font-medium text-slate-500">Địa chỉ: </span>
                {dk.benhnhan.diachi || '-'}
              </p>
            </div>
          ) : (
            <div className={`flex min-w-0 items-center gap-x-2 text-[13px] text-slate-600 ${rightInfoPaddingClass}`}>
              <span className="shrink-0">NS: {dk.benhnhan.namsinh || '-'}</span>
              <span className="shrink-0 text-slate-300">•</span>
              <span className="shrink-0">{rawPhone || '-'}</span>
              <span className="shrink-0 text-slate-300">•</span>
              <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-clip">{dk.benhnhan.diachi || '-'}</span>
            </div>
          )}

          {isExpanded ? (
            <div className="space-y-1.5 text-[13px] text-slate-700">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 break-words">
                  <span className="font-medium text-slate-500">MP: </span>
                  {dk.sokinh_moi_mp || '-'}
                </p>
                <p className="shrink-0 text-right text-slate-500">Thị lực: {dk.thiluc_kinhmoi_mp || '-'}</p>
              </div>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 break-words">
                  <span className="font-medium text-slate-500">MT: </span>
                  {dk.sokinh_moi_mt || '-'}
                </p>
                <p className="shrink-0 text-right text-slate-500">Thị lực: {dk.thiluc_kinhmoi_mt || '-'}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 text-[13px]">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">MP: {dk.sokinh_moi_mp || '-'}</span>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">MT: {dk.sokinh_moi_mt || '-'}</span>
            </div>
          )}
        </CardContent>

        {isExpanded && (
          <div
            className="space-y-2.5 border-t border-slate-200 bg-slate-50 px-3 py-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-5 gap-1.5">
              {hasPhone ? (
                <a
                  href={`tel:${dialPhone}`}
                  className="flex h-10 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Gọi
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex h-10 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[11px] font-medium text-slate-400"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Gọi
                </button>
              )}

              {hasPhone ? (
                <a
                  href={`sms:${dialPhone}`}
                  className="flex h-10 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Nhắn
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex h-10 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[11px] font-medium text-slate-400"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Nhắn
                </button>
              )}

              {zaloPhone ? (
                <a
                  href={`https://zalo.me/${zaloPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-sky-700"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Zalo
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex h-10 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[11px] font-medium text-slate-400"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Zalo
                </button>
              )}

              <a
                href={`/ke-don-kinh?bn=${dk.benhnhanid}`}
                className="flex h-10 flex-col items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-[11px] font-medium text-blue-700"
              >
                <Pencil className="h-3.5 w-3.5" />
                Sửa
              </a>

              <button
                type="button"
                className="flex h-10 flex-col items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-medium text-rose-600"
                onClick={() => { void onDelete(dk.id); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xóa
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

MobileDonKinhOrderCard.displayName = 'MobileDonKinhOrderCard';

type MobileQuickFilter = 'all' | 'debt' | 'today' | 'custom';

export default function DonKinhPage() {
  const { confirm } = useConfirm();
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [debtFilter, setDebtFilter] = useState<boolean | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  // Profit reveal
  const [showProfit, setShowProfit] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [mobileQuickFilter, setMobileQuickFilter] = useState<MobileQuickFilter>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [revealedProfitCardId, setRevealedProfitCardId] = useState<number | null>(null);
  const { user, signIn } = useAuth();
  const { isMultiBranch } = useBranch();

  // Đặt tiêu đề trang tĩnh
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Đơn kính';
    }
  }, []);

  // Debounce search input (chờ 500ms sau khi user ngừng gõ)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setExpandedCardId(null);
    setRevealedProfitCardId(null);
  }, [currentPage, rowsPerPage, searchDebounced, dateFilter, debtFilter]);

  useEffect(() => {
    if (!showProfit) {
      setRevealedProfitCardId(null);
    }
  }, [showProfit]);

  const applyMobileQuickFilter = useCallback((next: MobileQuickFilter) => {
    const today = getTodayLocalDate();
    setMobileQuickFilter(next);
    setCurrentPage(1);

    if (next === 'all') {
      setDebtFilter(null);
      setDateFilter('');
      return;
    }

    if (next === 'debt') {
      setDebtFilter(true);
      setDateFilter('');
      return;
    }

    if (next === 'today') {
      setDebtFilter(null);
      setDateFilter(`${today}T00:00`);
      return;
    }

    setDebtFilter(null);
    if (!dateFilter) {
      setDateFilter(`${today}T00:00`);
    }
    setShowMobileFilters(true);
  }, [dateFilter]);

  const toggleExpandedCard = useCallback((id: number) => {
    setExpandedCardId((prev) => (prev === id ? null : id));
    setRevealedProfitCardId(null);
  }, []);

  const revealMobileProfit = useCallback((id: number) => {
    if (!showProfit) {
      setShowPasswordDialog(true);
      return;
    }
    setExpandedCardId(null);
    setRevealedProfitCardId(id);
  }, [showProfit]);

  const handleSettingsClick = () => {
    if (showProfit) {
      setShowProfit(false);
      toast.success('Đã ẩn cột lãi');
    } else {
      setShowPasswordDialog(true);
    }
  };

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      setPasswordError('Không tìm thấy email người dùng');
      return;
    }
    try {
      const { error } = await signIn(user.email, passwordInput);
      if (!error) {
        setShowProfit(true);
        setShowPasswordDialog(false);
        setPasswordError("");
        setPasswordInput("");
        toast.success('Đã mở khóa cột lãi');
      } else {
        setPasswordError('Mật khẩu không đúng');
        toast.error('Sai mật khẩu');
      }
    } catch {
      setPasswordError('Lỗi xác thực');
    }
  }, [passwordInput, signIn, user?.email]);

  useEffect(() => {
    const fetchData = async () => {
      // Chỉ dùng isLoading cho lần đầu, isFetching cho các lần sau
      if (donKinhs.length === 0) {
        setIsLoading(true);
      } else {
        setIsFetching(true);
      }
      try {
        // Thêm cache-busting parameters
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        
        // Build URL với search/filter parameters
        const params = new URLSearchParams({
          page: currentPage.toString(),
          pageSize: rowsPerPage.toString(),
          _t: timestamp.toString(),
          _r: random
        });
        
        if (searchDebounced && searchDebounced.trim()) params.append('search', searchDebounced.trim());
        if (dateFilter && dateFilter.trim()) {
          const dateOnly = dateFilter.includes('T') ? dateFilter.split('T')[0] : dateFilter;
          params.append('filterDate', dateOnly);
        }
        if (debtFilter === true) params.append('filterNo', 'true');
        
        const resDonKinh = await axios.get(`/api/don-kinh?${params.toString()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        setDonKinhs(resDonKinh.data.data || []);
        setTotal(resDonKinh.data.total || 0);
      } catch (error: unknown) {
        let errorMessage = 'Lỗi không xác định';
        let errorDetails = '';
        if (axios.isAxiosError(error)) {
          errorMessage = error.response?.data?.message || error.message;
          errorDetails = error.response?.data?.details || '';
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }
        toast.error(`Lỗi khi tải dữ liệu: ${errorMessage}${errorDetails ? ' - ' + errorDetails : ''}`);
      } finally {
        setIsLoading(false);
        setIsFetching(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, searchDebounced, dateFilter, debtFilter]);

  const handleDelete = async (id: number) => {
    if (!await confirm('Bạn có chắc muốn xóa đơn kính này?')) return;
    try {
      const res = await axios.delete(`/api/don-kinh?id=${id}`);
      if (res.status === 200) {
        setDonKinhs((prev) => prev.filter((dk) => dk.id !== id));
        setExpandedCardId((prev) => (prev === id ? null : prev));
        setRevealedProfitCardId((prev) => (prev === id ? null : prev));
        toast.success('Đã xóa đơn kính');
      }
    } catch (error: unknown) {
      let errorMessage = 'Lỗi không xác định';
      let errorDetails = '';
      if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.message || error.message;
        errorDetails = error.response?.data?.details || '';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast.error(`Lỗi khi xóa đơn kính: ${errorMessage}${errorDetails ? ' - ' + errorDetails : ''}`);
    }
  };

  // Backend đã xử lý filter, không cần filter ở client nữa
  // Dùng useMemo để tránh re-render không cần thiết
  const filtered = useMemo(() => donKinhs, [donKinhs]);
  const totalPages = useMemo(() => Math.ceil(total / rowsPerPage), [total, rowsPerPage]);
  const paginated = useMemo(() => filtered, [filtered]);
  const mobileTodayLabel = useMemo(() => new Date().toLocaleDateString('vi-VN'), []);
  const mobileDebtCount = useMemo(
    () => filtered.filter((dk) => (dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan) > 0).length,
    [filtered]
  );
  const mobileTotalAmount = useMemo(
    () => filtered.reduce((sum, dk) => sum + dk.giatrong + dk.giagong, 0),
    [filtered]
  );
  const mobileGroupedByDay = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      label: string;
      items: DonKinh[];
    }>();

    paginated.forEach((dk) => {
      const key = getMobileOrderDateKey(dk.ngaykham);
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label: formatMobileOrderDayLabel(dk.ngaykham),
          items: [],
        });
      }
      grouped.get(key)?.items.push(dk);
    });

    return Array.from(grouped.values());
  }, [paginated]);

  useEffect(() => {
    if (debtFilter === true) {
      setMobileQuickFilter('debt');
      return;
    }
    if (dateFilter) {
      const dateOnly = dateFilter.includes('T') ? dateFilter.split('T')[0] : dateFilter;
      setMobileQuickFilter(dateOnly === getTodayLocalDate() ? 'today' : 'custom');
      return;
    }
    setMobileQuickFilter('all');
  }, [dateFilter, debtFilter]);

  const formatMoney = useCallback((amount: number) => {
    return (amount / 1000).toLocaleString('vi-VN');
  }, []);

  const formatOrderTime = useCallback((value: string) => {
    return formatMobileOrderTime(value);
  }, []);

  return (
    <ProtectedRoute>
      <div className="space-y-4 px-4 pb-4 pt-0 md:pt-4 lg:p-6">

        {isFetching && (
          <div className="fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
            Đang tìm kiếm...
          </div>
        )}
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground">Đang tải dữ liệu...</div>
        ) : (
          <>
            {/* Mobile Header */}
            <div className="sticky top-0 z-40 -mx-4 block border-b border-[#1565C0] bg-gradient-to-r from-[#1f78d1] via-[#2d80d7] to-[#1f6cc0] text-white shadow-sm md:hidden">
              <div className="px-4 pb-2 pt-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-xl font-extrabold leading-tight tracking-tight text-white">Đơn kính</h1>
                  </div>
                  <span className="text-[11px] text-white/90">{mobileTodayLabel}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-white/15 px-2 py-0.5">● {filtered.length} đơn kính</span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5">● Nợ: {mobileDebtCount}</span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5">● Tổng: {formatMoney(mobileTotalAmount)}k</span>
                </div>
              </div>

              <div className="border-t border-white/20 bg-black/10 px-2 pb-2 pt-1.5">
                <div className="grid grid-cols-4 gap-1">
                  <button
                    type="button"
                    onClick={() => applyMobileQuickFilter('all')}
                    className={`h-8 rounded-lg text-xs font-medium ${mobileQuickFilter === 'all' ? 'bg-white text-[#1f6cc0]' : 'text-white/85'}`}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => applyMobileQuickFilter('debt')}
                    className={`h-8 rounded-lg text-xs font-medium ${mobileQuickFilter === 'debt' ? 'bg-white text-[#1f6cc0]' : 'text-white/85'}`}
                  >
                    Còn nợ
                  </button>
                  <button
                    type="button"
                    onClick={() => applyMobileQuickFilter('today')}
                    className={`h-8 rounded-lg text-xs font-medium ${mobileQuickFilter === 'today' ? 'bg-white text-[#1f6cc0]' : 'text-white/85'}`}
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    onClick={() => applyMobileQuickFilter('custom')}
                    className={`h-8 rounded-lg text-xs font-medium ${mobileQuickFilter === 'custom' ? 'bg-white text-[#1f6cc0]' : 'text-white/85'}`}
                  >
                    Khoảng
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Controls */}
            <div className="block md:hidden -mt-1">
              <div className="rounded-xl border border-slate-200 bg-[#f3f1ec] p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Tìm tên, SĐT, địa chỉ..."
                    value={search}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setSearch(e.target.value);
                    }}
                    className="h-9 border-slate-300 bg-white"
                  />

                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(+e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                  >
                    {[25, 50, 100, 200].map((val) => (
                      <option key={val} value={val}>{val} / trang</option>
                    ))}
                  </select>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setShowMobileFilters((prev) => !prev)}
                  >
                    Bộ lọc
                  </Button>
                </div>

                {showMobileFilters && (
                  <div className="mt-2.5 space-y-2">
                    <Input
                      type="datetime-local"
                      value={dateFilter}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setDateFilter(e.target.value);
                        setMobileQuickFilter('custom');
                        setCurrentPage(1);
                      }}
                      className="h-9 border-slate-300 bg-white"
                    />

                    <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-2.5 py-2">
                      <label className="text-sm font-medium text-slate-700">Chỉ hiện đơn còn nợ</label>
                      <Switch
                        checked={debtFilter === true}
                        onCheckedChange={(checked: boolean) => {
                          setDebtFilter(checked ? true : null);
                          setMobileQuickFilter(checked ? 'debt' : (dateFilter ? 'custom' : 'all'));
                          setCurrentPage(1);
                        }}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={showProfit ? 'default' : 'outline'}
                        size="sm"
                        className="h-9 flex-1"
                        onClick={handleSettingsClick}
                      >
                        <Settings className="mr-1 h-4 w-4" />
                        {showProfit ? 'Đang mở lãi' : 'Mở khóa lãi'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9"
                        onClick={() => {
                          setSearch('');
                          setDateFilter('');
                          setDebtFilter(null);
                          setMobileQuickFilter('all');
                          setCurrentPage(1);
                        }}
                      >
                        Xóa lọc
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>Hiển thị {filtered.length} đơn · trang {currentPage}</span>
                  <span>← vuốt trái để xem lãi</span>
                </div>
              </div>
            </div>

            {/* Desktop Controls */}
            <div className="hidden lg:flex flex-col sm:flex-row gap-4 items-center">
              <Input
                placeholder="Tìm tên, số ĐT, địa chỉ..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSearch(e.target.value);
                  // Không set currentPage ở đây, để debounce xử lý
                }}
                className="w-full sm:w-1/3"
              />
              <Input
                type="datetime-local"
                value={dateFilter}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full sm:w-1/4"
              />
              <div className="flex items-center space-x-2">
                <Switch
                  checked={debtFilter === true}
                  onCheckedChange={(checked: boolean) => {
                    setDebtFilter(checked ? true : null);
                    setCurrentPage(1);
                  }}
                />
                <label className="text-sm font-semibold">Chỉ hiển thị đơn còn nợ</label>
              </div>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(+e.target.value);
                  setCurrentPage(1);
                }}
                className="border px-2 py-1 rounded text-sm"
              >
                {[25, 50, 100, 200].map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                Tổng: {total} đơn kính (hiển thị {filtered.length} trên trang {currentPage})
              </div>
              <Button type="button" variant={showProfit ? 'default' : 'outline'} size="sm" onClick={handleSettingsClick} className="h-10 px-3 ml-auto">
                <Settings className="w-4 h-4" />
              </Button>
            </div>

            {/* Mobile Card Layout */}
            <div
              className="block md:hidden space-y-2.5"
              onClick={() => {
                setExpandedCardId(null);
                setRevealedProfitCardId(null);
              }}
            >
              {mobileGroupedByDay.map((group) => (
                <div key={group.key} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-semibold text-slate-600">{group.label}</p>
                    <p className="text-[11px] text-slate-500">{group.items.length} đơn</p>
                  </div>

                  <div className="space-y-2.5">
                    {group.items.map((dk) => (
                      <MobileDonKinhOrderCard
                        key={dk.id}
                        dk={dk}
                        showProfitUnlocked={showProfit}
                        isExpanded={expandedCardId === dk.id}
                        isProfitRevealed={revealedProfitCardId === dk.id}
                        onToggleExpand={toggleExpandedCard}
                        onRevealProfit={revealMobileProfit}
                        onDelete={handleDelete}
                        formatMoney={formatMoney}
                        formatTime={formatOrderTime}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {paginated.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Không tìm thấy đơn kính.
                  </CardContent>
                </Card>
              )}

              {paginated.length > 0 && (
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-center text-[11px] text-slate-500">
                  ← Vuốt trái để xem lãi đơn · Chạm bệnh nhân để xem chi tiết và thao tác
                </div>
              )}
            </div>

            {/* Mobile Pagination */}
            <div className="block md:hidden">
              <SimplePagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                className="mt-4"
              />
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden md:block">
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-4 py-2">STT</th>
                        <th className="px-4 py-2">Ngày khám</th>
                        <th className="px-4 py-2">Họ tên</th>
                        <th className="px-4 py-2">NS</th>
                        <th className="px-4 py-2">Tuổi</th>
                        <th className="px-4 py-2">Điện thoại</th>
                        <th className="px-4 py-2">Địa chỉ</th>
                        <th className="px-4 py-2">Mắt phải</th>
                        <th className="px-4 py-2">Mắt trái</th>
                        <th className="px-4 py-2">Tổng tiền</th>
                        {showProfit && <th className="px-4 py-2">Lãi</th>}
                        <th className="px-4 py-2">còn nợ</th>
                        {isMultiBranch && <th className="px-4 py-2">Chi nhánh</th>}
                        <th className="px-4 py-2 text-center w-[90px]">Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((dk, index) => {
                        const stt = (currentPage - 1) * rowsPerPage + index + 1;
                        const isDebt = (dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan) > 0;
                        return (
                        <tr key={dk.id} className={`border-b ${isDebt ? 'bg-amber-200 font-semibold text-amber-900 border-amber-400' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2 text-center font-mono">{stt}</td>
                          <td className="px-4 py-2">
                            {new Date(dk.ngaykham).toLocaleString('vi-VN', {
                              timeZone: 'Asia/Ho_Chi_Minh',
                              hour12: false,
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-4 py-2">{dk.benhnhan.ten || '-'}</td>
                          <td className="px-4 py-2">{dk.benhnhan.namsinh || '-'}</td>
                          <td className="px-4 py-2">{calcAge(dk.benhnhan.namsinh ?? null)}</td>
                          <td className="px-4 py-2">{dk.benhnhan.dienthoai || '-'}</td>
                          <td className="px-4 py-2">{dk.benhnhan.diachi || '-'}</td>
                          <td className="px-4 py-2">{dk.sokinh_moi_mp || '-'}</td>
                          <td className="px-4 py-2">{dk.sokinh_moi_mt || '-'}</td>
                          <td className="px-4 py-2">{formatMoney(dk.giatrong + dk.giagong)}</td>
                          {showProfit && (
                            <td className="px-4 py-2 text-emerald-600 font-medium">{formatMoney(dk.lai)}</td>
                          )}
                          <td className="px-4 py-2">
                            {dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan > 0
                              ? formatMoney(dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan)
                              : '-'}
                          </td>
                          {isMultiBranch && (
                            <td className="px-4 py-2 text-xs text-gray-500">{(dk as any).branch?.ten_chi_nhanh || '-'}</td>
                          )}
                          <td className="px-4 py-2 text-center w-[90px]">
                            <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                              <Button size="sm" variant="outline" asChild className="h-7 px-2">
                                <a href={`/ke-don-kinh?bn=${dk.benhnhanid}`}>
                                  <Pencil className="w-3 h-3" />
                                </a>
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleDelete(dk.id)} className="h-7 px-2">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        )})}
                      {paginated.length === 0 && (
                        <tr>
                          <td colSpan={showProfit ? (isMultiBranch ? 14 : 13) : (isMultiBranch ? 13 : 12)} className="text-center py-4 text-muted-foreground">
                            Không tìm thấy đơn kính.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>

            {/* Desktop Pagination */}
            <div className="hidden md:block">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                className="mt-6"
              />
            </div>
          </>
        )}
      </div>
      {showPasswordDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setShowPasswordDialog(false); setPasswordInput(''); setPasswordError(''); }}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xs p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold">Nhập mật khẩu để xem lãi</h2>
            <form onSubmit={handleUnlock} className="space-y-2">
              <Input
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
                autoFocus
                placeholder="Mật khẩu"
              />
              {passwordError && <div className="text-xs text-red-600">{passwordError}</div>}
              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowPasswordDialog(false); setPasswordInput(''); setPasswordError(''); }}>Hủy</Button>
                <Button type="submit" size="sm">Xác nhận</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}