//src/pages/don-kinh.tsx
'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pagination, SimplePagination } from '@/components/ui/pagination';
import { Trash2, Pencil, Phone, MessageSquare, MessageCircle, Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ProtectedRoute from '../components/ProtectedRoute';
import { useBranch } from '../contexts/BranchContext';
import { usePermissions } from '../hooks/usePermissions';

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
  showProfit: boolean;
  isExpanded: boolean;
  onToggleExpand: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
  formatMoney: (amount: number) => string;
  formatTime: (value: string) => string;
}

const MobileDonKinhOrderCard = React.memo(function MobileDonKinhOrderCard({
  dk,
  showProfit,
  isExpanded,
  onToggleExpand,
  onDelete,
  formatMoney,
  formatTime,
}: MobileDonKinhOrderCardProps) {
  const totalAmount = dk.giatrong + dk.giagong;
  const debtAmount = totalAmount - dk.sotien_da_thanh_toan;
  const isDebt = debtAmount > 0;
  const rightInfoWidthClass = showProfit ? 'w-[112px]' : isDebt ? 'w-[104px]' : 'w-[88px]';
  const rightInfoPaddingClass = showProfit ? 'pr-[118px]' : isDebt ? 'pr-[110px]' : 'pr-[94px]';
  const rawPhone = (dk.benhnhan.dienthoai || '').trim();
  const dialPhone = normalizeDialPhone(rawPhone);
  const zaloPhone = normalizeZaloPhone(rawPhone);
  const hasPhone = dialPhone.length > 0;

  const handleToggleExpand = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onToggleExpand(dk.id);
  }, [dk.id, onToggleExpand]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border shadow-sm ${isDebt ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200 bg-white'}`}
      onClick={handleToggleExpand}
    >
      <div className="relative">
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
              {showProfit && (
                <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isDebt ? 'bg-yellow-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {formatMoney(dk.lai)}k{isDebt ? '/ngày' : ''}
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

function MobileHeaderIconButton({
  children,
  active = false,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
        active
          ? 'bg-white text-[#1f6cc0] shadow-sm ring-2 ring-white/70'
          : 'bg-white/15 text-white hover:bg-white/25'
      }`}
    >
      {children}
    </button>
  );
}

type MobileQuickFilter = 'all' | 'debt';

export default function DonKinhPage() {
  const { confirm } = useConfirm();
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [debtFilter, setDebtFilter] = useState<boolean | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  // Profit reveal
  const [showProfit, setShowProfit] = useState(false);
  const [mobileQuickFilter, setMobileQuickFilter] = useState<MobileQuickFilter>('all');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const { has } = usePermissions();
  const canViewProfit = has('view_revenue');
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
  }, [currentPage, rowsPerPage, searchDebounced, debtFilter]);

  useEffect(() => {
    if (!canViewProfit && showProfit) {
      setShowProfit(false);
    }
  }, [canViewProfit, showProfit]);

  useEffect(() => {
    if (!showMobileSearch) return;
    const timer = window.setTimeout(() => {
      mobileSearchInputRef.current?.focus();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [showMobileSearch]);

  const applyMobileQuickFilter = useCallback((next: MobileQuickFilter) => {
    setMobileQuickFilter(next);
    setCurrentPage(1);

    if (next === 'all') {
      setDebtFilter(null);
      return;
    }

    setDebtFilter(true);
  }, []);

  const toggleExpandedCard = useCallback((id: number) => {
    setExpandedCardId((prev) => (prev === id ? null : id));
  }, []);

  const toggleMobileSearch = useCallback(() => {
    setShowMobileSearch((prev) => {
      if (prev) {
        setSearch('');
      }
      return !prev;
    });
  }, []);

  const toggleShowProfit = useCallback(() => {
    if (!canViewProfit) {
      toast.error('Bạn không có quyền xem lãi');
      return;
    }
    const nextShowProfit = !showProfit;
    setShowProfit(nextShowProfit);
    toast.success(nextShowProfit ? 'Đã bật xem lãi' : 'Đã tắt xem lãi');
  }, [canViewProfit, showProfit]);

  const handleProfitViewChange = useCallback((value: 'basic' | 'profit') => {
    if (!canViewProfit) {
      toast.error('Bạn không có quyền xem lãi');
      return;
    }

    const nextShowProfit = value === 'profit';
    if (nextShowProfit === showProfit) return;

    setShowProfit(nextShowProfit);
    toast.success(nextShowProfit ? 'Đã hiện cột lãi' : 'Đã ẩn cột lãi');
  }, [canViewProfit, showProfit]);

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
  }, [currentPage, rowsPerPage, searchDebounced, debtFilter]);

  const handleDelete = async (id: number) => {
    if (!await confirm('Bạn có chắc muốn xóa đơn kính này?')) return;
    try {
      const res = await axios.delete(`/api/don-kinh?id=${id}`);
      if (res.status === 200) {
        setDonKinhs((prev) => prev.filter((dk) => dk.id !== id));
        setExpandedCardId((prev) => (prev === id ? null : prev));
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
    setMobileQuickFilter(debtFilter === true ? 'debt' : 'all');
  }, [debtFilter]);

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
              <div className="flex items-center justify-between px-4 py-2">
                <h1 className="text-xl font-extrabold leading-tight tracking-tight text-white">Đơn kính</h1>
                <MobileHeaderIconButton
                  ariaLabel="Tìm kiếm"
                  active={showMobileSearch}
                  onClick={toggleMobileSearch}
                >
                  <Search className="h-4 w-4" />
                </MobileHeaderIconButton>
              </div>

              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  showMobileSearch ? 'max-h-14 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-4 pb-2">
                  <Input
                    ref={mobileSearchInputRef}
                    placeholder="Tìm tên, mã BN, SĐT..."
                    value={search}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setSearch(e.target.value);
                    }}
                    className="h-9 border-white/30 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-white/20 bg-black/10 px-4 py-2">
                <button
                  type="button"
                  onClick={() => applyMobileQuickFilter('all')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    mobileQuickFilter === 'all'
                      ? 'bg-white text-[#1f6cc0]'
                      : 'bg-white/15 text-white/90'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => applyMobileQuickFilter('debt')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    mobileQuickFilter === 'debt'
                      ? 'bg-white text-[#1f6cc0]'
                      : 'bg-white/15 text-white/90'
                  }`}
                >
                  Còn nợ
                </button>
                <div className="flex-1" />
                {canViewProfit && (
                  <button
                    type="button"
                    onClick={toggleShowProfit}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      showProfit
                        ? 'bg-amber-400 text-amber-950 font-semibold shadow-sm'
                        : 'bg-white/15 text-white/90'
                    }`}
                  >
                    Xem
                  </button>
                )}
              </div>
            </div>

            {/* Desktop Controls */}
            <div className="hidden lg:flex flex-col sm:flex-row gap-4 items-center">
              <Input
                placeholder="Tìm tên, mã BN, số ĐT..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSearch(e.target.value);
                  // Không set currentPage ở đây, để debounce xử lý
                }}
                className="w-full sm:w-1/3"
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
              {canViewProfit && (
                <select
                  value={showProfit ? 'profit' : 'basic'}
                  onChange={(e) => handleProfitViewChange(e.target.value as 'basic' | 'profit')}
                  className="ml-auto h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
                >
                  <option value="basic">Xem: Mặc định</option>
                  <option value="profit">Xem: Có lãi</option>
                </select>
              )}
            </div>

            {/* Mobile Card Layout */}
            <div
              className="block md:hidden space-y-2.5"
              onClick={() => {
                setExpandedCardId(null);
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
                        showProfit={showProfit}
                        isExpanded={expandedCardId === dk.id}
                        onToggleExpand={toggleExpandedCard}
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
                  Chạm bệnh nhân để xem chi tiết và thao tác
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

              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-slate-700">Số người trên trang</label>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(+e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                  >
                    {[25, 50, 100, 200].map((val) => (
                      <option key={val} value={val}>{val} / trang</option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Tổng: {total} đơn kính (hiển thị {filtered.length} trên trang {currentPage})
                </p>
              </div>
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

              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-700">Số người trên trang</label>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(+e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                  >
                    {[25, 50, 100, 200].map((val) => (
                      <option key={val} value={val}>{val} / trang</option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  Tổng: {total} đơn kính (hiển thị {filtered.length} trên trang {currentPage})
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}