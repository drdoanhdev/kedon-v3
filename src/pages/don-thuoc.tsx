//src/pages/don-thuoc.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Pagination, SimplePagination } from '../components/ui/pagination';
import { Pencil, Trash2, Settings, Wallet, Phone, MessageSquare, MessageCircle, Search } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import Link from 'next/link';
import { format } from 'date-fns';
import ProtectedRoute from '../components/ProtectedRoute';
import { useBranch } from '../contexts/BranchContext';
import { usePermissions } from '../hooks/usePermissions';

interface DonThuoc {
  id: number;
  madonthuoc: string;
  benhnhan: {
    id: number;
    ten: string | null;
    namsinh: string | null; // sửa lại kiểu string để nhận yyyy hoặc dd/mm/yyyy
    dienthoai: string | null;
    diachi: string | null;
    tuoi?: number; // thêm trường tuổi nếu có
  };
  chandoan: string;
  ngay_kham: string;
  tongtien: number;
  sotien_da_thanh_toan: number;
  no: boolean;
  lai?: number;
  con_no?: number; // trường mới backend trả về
  branch?: { id: string; ten_chi_nhanh: string } | null;
}

interface ChiTietDonThuoc {
  thuoc: {
    id: number;
    tenthuoc: string;
  };
  soluong: number;
  donvitinh: string;
  cachdung: string;
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

interface MobileDonThuocOrderCardProps {
  dt: DonThuoc;
  showProfit: boolean;
  isExpanded: boolean;
  chiTietLoaded: boolean;
  chiTiet: ChiTietDonThuoc[];
  onToggleExpand: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
  onPay: (id: number) => void;
  formatMoney: (amount: number) => string;
  formatTime: (value: string) => string;
}

const MobileDonThuocOrderCard = React.memo(function MobileDonThuocOrderCard({
  dt,
  showProfit,
  isExpanded,
  chiTietLoaded,
  chiTiet,
  onToggleExpand,
  onDelete,
  onPay,
  formatMoney,
  formatTime,
}: MobileDonThuocOrderCardProps) {
  const remaining = typeof dt.con_no === 'number' ? dt.con_no : Math.max(0, dt.tongtien - dt.sotien_da_thanh_toan);
  const isDebt = remaining > 0;
  const rightInfoWidthClass = showProfit ? 'w-[112px]' : isDebt ? 'w-[104px]' : 'w-[88px]';
  const rightInfoPaddingClass = showProfit ? 'pr-[118px]' : isDebt ? 'pr-[110px]' : 'pr-[94px]';
  const rawPhone = (dt.benhnhan?.dienthoai || '').trim();
  const dialPhone = normalizeDialPhone(rawPhone);
  const zaloPhone = normalizeZaloPhone(rawPhone);
  const hasPhone = dialPhone.length > 0;
  const benhnhanId = dt.benhnhan?.id || '';

  const handleToggleExpand = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onToggleExpand(dt.id);
  }, [dt.id, onToggleExpand]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border shadow-sm ${isDebt ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200 bg-white'}`}
      onClick={handleToggleExpand}
    >
      <div className="relative">
        <CardContent className="space-y-2.5 p-3">
          <div className="relative">
            <div className={`absolute right-0 top-0 text-right ${rightInfoWidthClass}`}>
              <p className="text-xs text-slate-500">{formatTime(dt.ngay_kham)}</p>
              <p className="mt-0.5 text-xl font-semibold leading-none text-blue-700">{formatMoney(dt.tongtien)}k</p>
              {isDebt && (
                <p className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Nợ: {formatMoney(remaining)}k
                </p>
              )}
              {showProfit && dt.lai !== undefined && (
                <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isDebt ? 'bg-yellow-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {formatMoney(dt.lai)}k{isDebt ? '/ngày' : ''}
                </p>
              )}
            </div>
            <h3 className={`min-w-0 truncate text-base font-semibold leading-tight text-slate-800 ${rightInfoPaddingClass}`}>
              {dt.benhnhan?.ten || 'Không có tên'}
            </h3>
          </div>

          {!isExpanded ? (
            <>
              <div className={`flex min-w-0 items-center gap-x-2 text-[13px] text-slate-600 ${rightInfoPaddingClass}`}>
                <span className="shrink-0">NS: {dt.benhnhan?.namsinh || '-'}</span>
                <span className="shrink-0 text-slate-300">•</span>
                <span className="shrink-0">{rawPhone || '-'}</span>
                <span className="shrink-0 text-slate-300">•</span>
                <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-clip">{dt.benhnhan?.diachi || '-'}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-[13px]">
                <span className="max-w-full truncate rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">
                  {dt.chandoan || 'Chưa có chẩn đoán'}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className={`space-y-1 text-[13px] text-slate-700 ${rightInfoPaddingClass}`}>
                <p>
                  <span className="font-medium text-slate-500">Ngày sinh: </span>
                  {dt.benhnhan?.namsinh || '-'}
                </p>
                <p>
                  <span className="font-medium text-slate-500">Số điện thoại: </span>
                  {rawPhone || '-'}
                </p>
                <p className="break-words">
                  <span className="font-medium text-slate-500">Địa chỉ: </span>
                  {dt.benhnhan?.diachi || '-'}
                </p>
                <p className="break-words">
                  <span className="font-medium text-slate-500">Chẩn đoán: </span>
                  {dt.chandoan || '-'}
                </p>
              </div>

              <div className="space-y-1.5 text-[13px] text-slate-700">
                <p className="text-xs font-semibold text-slate-500">Thuốc trong đơn</p>
                {!chiTietLoaded ? (
                  <p className="text-xs text-slate-400">Đang tải chi tiết...</p>
                ) : chiTiet.length === 0 ? (
                  <p className="text-xs text-slate-400">Không có thuốc trong đơn.</p>
                ) : (
                  <div className="space-y-1.5">
                    {chiTiet.map((ct) => (
                      <div key={ct.thuoc.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="font-medium text-slate-800">{ct.thuoc.tenthuoc}</p>
                        <p className="text-xs text-slate-500">
                          SL: {ct.soluong} {ct.donvitinh} · {ct.cachdung}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>

        {isExpanded && (
          <div
            className="space-y-2.5 border-t border-slate-200 bg-slate-50 px-3 py-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`grid gap-1.5 ${isDebt ? 'grid-cols-6' : 'grid-cols-5'}`}>
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
                href={`/ke-don?bn=${benhnhanId}&donthuocid=${dt.id}`}
                className="flex h-10 flex-col items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-[11px] font-medium text-blue-700"
              >
                <Pencil className="h-3.5 w-3.5" />
                Sửa
              </a>

              {isDebt && (
                <button
                  type="button"
                  className="flex h-10 flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-800"
                  onClick={() => onPay(dt.id)}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  Thu
                </button>
              )}

              <button
                type="button"
                className="flex h-10 flex-col items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-medium text-rose-600"
                onClick={() => { void onDelete(dt.id); }}
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

MobileDonThuocOrderCard.displayName = 'MobileDonThuocOrderCard';

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

export default function DonThuocPage() {
  const { confirm } = useConfirm();
  const [donThuocs, setDonThuocs] = useState<DonThuoc[]>([]);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterNo, setFilterNo] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [chiTietDonThuocs, setChiTietDonThuocs] = useState<{ [donthuocid: number]: ChiTietDonThuoc[] }>({});
  const [selectedDonThuocId, setSelectedDonThuocId] = useState<number | null>(null);
  // Profit visibility
  const [showProfit, setShowProfit] = useState(false);
  // Partial payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payDonId, setPayDonId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState(''); // nhập theo nghìn
  const [mobileQuickFilter, setMobileQuickFilter] = useState<MobileQuickFilter>('all');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const { has } = usePermissions();
  const canViewProfit = has('view_revenue');
  const { isMultiBranch } = useBranch();

  // Đặt tiêu đề trang tĩnh
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Đơn thuốc';
    }
  }, []);

  // Debounce search input (chờ 500ms sau khi user ngừng gõ)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!canViewProfit && showProfit) {
      setShowProfit(false);
    }
  }, [canViewProfit, showProfit]);

  useEffect(() => {
    setSelectedDonThuocId(null);
  }, [currentPage, rowsPerPage, searchDebounced, filterDate, filterNo]);

  useEffect(() => {
    setMobileQuickFilter(filterNo ? 'debt' : 'all');
  }, [filterNo]);

  useEffect(() => {
    if (!showMobileSearch) return;
    const timer = window.setTimeout(() => {
      mobileSearchInputRef.current?.focus();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [showMobileSearch]);

  const handleSettingsClick = () => {
    if (!canViewProfit) {
      toast.error('Bạn không có quyền xem lãi');
      return;
    }
    if (showProfit) {
      setShowProfit(false);
      toast.success('Đã ẩn cột lãi');
    } else {
      setShowProfit(true);
      toast.success('Đã hiện cột lãi');
    }
  };

  // Fetch danh sách đơn thuốc với pagination
  useEffect(() => {
    const fetchDonThuocs = async () => {
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
        if (filterDate) params.append('filterDate', filterDate);
        if (filterNo) params.append('filterNo', 'true');
        
        const res = await axios.get(`/api/don-thuoc?${params.toString()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        const data: DonThuoc[] = res.data.data || [];
        // Kiểm tra và lọc dữ liệu không hợp lệ
        const validData = data.filter((dt: DonThuoc) => 
          dt && dt.benhnhan && (dt.benhnhan.ten === null || typeof dt.benhnhan.ten === 'string')
        );
        setDonThuocs(validData);
        setTotal(res.data.total || 0);
        if (data.length !== validData.length) {
          toast.error('Một số đơn thuốc có dữ liệu không hợp lệ đã bị lọc bỏ');
        }
      } catch (error: unknown) {
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : error instanceof Error
            ? error.message
            : String(error);
        toast.error(`Lỗi tải danh sách đơn thuốc: ${message}`);
      }
    };
    fetchDonThuocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, searchDebounced, filterDate, filterNo]);

  // Fetch chi tiết đơn thuốc
  const fetchChiTietDonThuoc = useCallback(async (donthuocid: number) => {
    try {
      // Thêm cache-busting parameters
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const res = await axios.get(`/api/chi-tiet-don-thuoc?donthuocid=${donthuocid}&_t=${timestamp}&_r=${random}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setChiTietDonThuocs((prev) => ({
        ...prev,
        [donthuocid]: res.data.data.map((item: ChiTietDonThuoc) => ({
          thuoc: { id: item.thuoc.id, tenthuoc: item.thuoc.tenthuoc },
          soluong: item.soluong,
          donvitinh: item.donvitinh || 'N/A',
          cachdung: item.cachdung || 'N/A',
        })),
      }));
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error(`Lỗi tải chi tiết đơn thuốc: ${message}`);
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!await confirm('Bạn có chắc chắn muốn xóa đơn thuốc này?')) return;
    try {
      await axios.delete(`/api/don-thuoc?id=${id}`);
      setDonThuocs((prev) => prev.filter((dt) => dt.id !== id));
      setChiTietDonThuocs((prev) => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      if (selectedDonThuocId === id) setSelectedDonThuocId(null);
      toast.success('Đã xóa đơn thuốc');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error(`Lỗi xóa đơn thuốc: ${message}`);
    }
  }, [selectedDonThuocId]);

  const handleRowClick = useCallback((donthuocid: number) => {
    if (selectedDonThuocId === donthuocid) {
      setSelectedDonThuocId(null); // Ẩn chi tiết nếu bấm lại
    } else {
      setSelectedDonThuocId(donthuocid);
      fetchChiTietDonThuoc(donthuocid);
    }
  }, [selectedDonThuocId, fetchChiTietDonThuoc]);

  const toggleExpandedCard = useCallback((id: number) => {
    handleRowClick(id);
  }, [handleRowClick]);

  const applyMobileQuickFilter = useCallback((next: MobileQuickFilter) => {
    setMobileQuickFilter(next);
    setCurrentPage(1);
    setFilterNo(next === 'debt');
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
    setShowProfit((prev) => {
      const next = !prev;
      toast.success(next ? 'Đã hiện cột lãi' : 'Đã ẩn cột lãi');
      return next;
    });
  }, [canViewProfit]);

  const openPayDialog = useCallback((id: number) => {
    setPayDonId(id);
    setPayAmount('');
    setPayDialogOpen(true);
  }, []);

  const formatMoney = useCallback((amount: number) => {
    return (amount / 1000).toLocaleString('vi-VN');
  }, []);

  const formatOrderTime = useCallback((value: string) => {
    return formatMobileOrderTime(value);
  }, []);

  // Backend đã xử lý filter, không cần filter ở client nữa
  const filteredDonThuocs = useMemo(() => donThuocs, [donThuocs]);

  // Backend đã xử lý pagination và filtering
  const totalPages = Math.ceil(total / rowsPerPage);
  const paginatedDonThuocs = useMemo(() => filteredDonThuocs, [filteredDonThuocs]);

  const mobileGroupedByDay = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      label: string;
      items: DonThuoc[];
    }>();

    paginatedDonThuocs.forEach((dt) => {
      const key = getMobileOrderDateKey(dt.ngay_kham);
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label: formatMobileOrderDayLabel(dt.ngay_kham),
          items: [],
        });
      }
      grouped.get(key)?.items.push(dt);
    });

    return Array.from(grouped.values());
  }, [paginatedDonThuocs]);

  return (
    <ProtectedRoute>
      <div className="space-y-4 px-4 pb-4 pt-0 md:pt-4 lg:p-6">

  <div className="w-full mx-auto">
          {/* Mobile Header */}
          <div className="sticky top-0 z-40 -mx-4 block border-b border-[#1565C0] bg-gradient-to-r from-[#1f78d1] via-[#2d80d7] to-[#1f6cc0] text-white shadow-sm md:hidden">
            <div className="flex items-center justify-between px-4 py-2">
              <h1 className="text-xl font-extrabold leading-tight tracking-tight text-white">Đơn thuốc</h1>
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
                showMobileSearch ? 'max-h-28 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="space-y-2 px-4 pb-2">
                <Input
                  ref={mobileSearchInputRef}
                  placeholder="Tìm theo tên, mã BN, SĐT..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  className="h-9 border-white/30 bg-white text-slate-900 placeholder:text-slate-400"
                />
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => {
                    setFilterDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 border-white/30 bg-white text-slate-900"
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
          <div className="hidden lg:flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Tìm theo tên, mã BN, SĐT, địa chỉ..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                className="w-64"
              />
              {canViewProfit && (
                <Button variant={showProfit ? 'default' : 'outline'} size="sm" type="button" onClick={handleSettingsClick} className="h-10 px-3">
                  <Settings className="w-4 h-4" />
                </Button>
              )}
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-40"
              />
              <Button
                variant={filterNo ? 'default' : 'outline'}
                onClick={() => {
                  setFilterNo(!filterNo);
                  setCurrentPage(1);
                }}
              >
                Chỉ hiện đơn còn nợ
              </Button>
            </div>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(+e.target.value);
                setCurrentPage(1);
              }}
              className="border px-2 py-1 rounded text-sm"
            >
              {[50, 100, 200, 500].map((val) => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>

          {/* Mobile Card Layout */}
          <div
            className="block md:hidden space-y-2.5"
            onClick={() => {
              setSelectedDonThuocId(null);
            }}
          >
            {mobileGroupedByDay.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-semibold text-slate-600">{group.label}</p>
                  <p className="text-[11px] text-slate-500">{group.items.length} đơn</p>
                </div>

                <div className="space-y-2.5">
                  {group.items.map((dt) => (
                    <MobileDonThuocOrderCard
                      key={dt.id}
                      dt={dt}
                      showProfit={showProfit}
                      isExpanded={selectedDonThuocId === dt.id}
                      chiTietLoaded={chiTietDonThuocs[dt.id] !== undefined}
                      chiTiet={chiTietDonThuocs[dt.id] || []}
                      onToggleExpand={toggleExpandedCard}
                      onDelete={handleDelete}
                      onPay={openPayDialog}
                      formatMoney={formatMoney}
                      formatTime={formatOrderTime}
                    />
                  ))}
                </div>
              </div>
            ))}

            {paginatedDonThuocs.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  Không tìm thấy đơn thuốc.
                </CardContent>
              </Card>
            )}

            {paginatedDonThuocs.length > 0 && (
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-center text-[11px] text-slate-500">
                Chạm đơn để xem chi tiết và thao tác
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
                <label className="text-sm font-medium text-slate-700">Số đơn trên trang</label>
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
                Tổng: {total} đơn thuốc (trang {currentPage}/{totalPages})
              </p>
            </div>
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-1 text-left">STT</th>
                      <th className="px-2 py-1 text-left">Ngày giờ khám</th>
                      <th className="px-2 py-1 text-left">Bệnh Nhân</th>
                      <th className="px-2 py-1 text-left">Ngày sinh</th>
                      <th className="px-2 py-1 text-left">Tuổi</th>
                      <th className="px-2 py-1 text-left">SĐT</th>
                      <th className="px-2 py-1 text-left">Địa chỉ</th>
                      <th className="px-2 py-1 text-left">Chẩn Đoán</th>
                      <th className="px-2 py-1 text-right">Tổng Tiền</th>
                      <th className="px-2 py-1 text-right">Nợ</th>
                      {showProfit && <th className="px-2 py-1 text-right">Lãi (ước tính)</th>}
                      {isMultiBranch && <th className="px-2 py-1 text-left">Chi nhánh</th>}
                      <th className="px-2 py-1 text-center w-[90px]">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDonThuocs.map((dt, index) => {
                      const chiTiet = chiTietDonThuocs[dt.id] || [];
                      const stt = (currentPage - 1) * rowsPerPage + index + 1;
                      const remaining = typeof dt.con_no === 'number' ? dt.con_no : Math.max(0, dt.tongtien - dt.sotien_da_thanh_toan);
                      const isDebt = remaining > 0;
                      return (
                        <React.Fragment key={dt.id}>
                          <tr
                            className={`border-b cursor-pointer ${isDebt 
                              ? 'bg-amber-200 hover:bg-amber-200 font-semibold text-amber-900 border-amber-400' 
                              : 'hover:bg-gray-100'} `}
                            onClick={() => handleRowClick(dt.id)}
                          >
                            <td className="px-2 py-1 font-mono">{stt}</td>
                            <td className="px-2 py-1">{new Date(dt.ngay_kham).toLocaleString('vi-VN', { 
                              timeZone: 'Asia/Ho_Chi_Minh', 
                              hour12: false,
                              year: 'numeric',
                              month: '2-digit', 
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</td>
                            <td className="px-2 py-1">{dt.benhnhan?.ten || '-'}</td>
                            <td className="px-2 py-1">{dt.benhnhan?.namsinh || '-'}</td>
                            <td className="px-2 py-1">
                              {calcAge(dt.benhnhan?.namsinh ?? null)}
                            </td>
                            <td className="px-2 py-1">{dt.benhnhan?.dienthoai || '-'}</td>
                            <td className="px-2 py-1">{dt.benhnhan?.diachi || '-'}</td>
                            <td className="px-2 py-1">{dt.chandoan || '-'}</td>
                            <td className="px-2 py-1 text-right">{(dt.tongtien / 1000).toFixed(0)}k</td>
                            <td className="px-2 py-1 text-right">{isDebt ? (remaining / 1000).toFixed(0) + 'k' : '0k'}</td>
                            {showProfit && (
                              <td className="px-2 py-1 text-right text-emerald-600 font-medium">{dt.lai !== undefined ? ((dt.lai / 1000).toFixed(0) + 'k') : '...'}</td>
                            )}
                            {isMultiBranch && (
                              <td className="px-2 py-1 text-xs text-gray-500">{dt.branch?.ten_chi_nhanh || '-'}</td>
                            )}
                            <td className="px-2 py-1 text-center w-[90px]">
                              <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                                <Link href={`/ke-don?bn=${dt.benhnhan?.id || ''}&donthuocid=${dt.id}`}>
                                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={(e) => e.stopPropagation()}>
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                </Link>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-2"
                                  disabled={!isDebt}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPayDonId(dt.id);
                                    setPayAmount('');
                                    setPayDialogOpen(true);
                                  }}
                                >
                                  <Wallet className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(dt.id);
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {chiTiet.length > 0 && selectedDonThuocId === dt.id && (
                            <tr>
                              <td colSpan={12} className="px-2 py-1 bg-green-50">
                                <div className="text-xs text-gray-800">
                                  <strong>Chi tiết đơn thuốc:</strong>
                                  <table className="min-w-full text-xs mt-2">
                                    <thead>
                                      <tr className="bg-green-100">
                                        <th className="px-2 py-1 text-left">Tên Thuốc</th>
                                        <th className="px-2 py-1 text-center">Số Lượng</th>
                                        <th className="px-2 py-1 text-left">Đơn Vị</th>
                                        <th className="px-2 py-1 text-left">Cách Dùng</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {chiTiet.map((ct: ChiTietDonThuoc) => (
                                        <tr key={ct.thuoc.id} className="border-b">
                                          <td className="px-2 py-1">{ct.thuoc.tenthuoc}</td>
                                          <td className="px-2 py-1 text-center">{ct.soluong}</td>
                                          <td className="px-2 py-1">{ct.donvitinh}</td>
                                          <td className="px-2 py-1">{ct.cachdung}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {paginatedDonThuocs.length === 0 && (
                      <tr>
                          <td colSpan={showProfit ? 12 : 11} className="text-center py-2 text-muted-foreground">
                          Không tìm thấy đơn thuốc.
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
        </div>
      </div>
      {payDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setPayDialogOpen(false); setPayDonId(null); setPayAmount(''); }}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xs p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold">Cập nhật thanh toán</h2>
            <div className="space-y-2">
              <Input
                type="number"
                placeholder="Nhập số tiền (nghìn VND)"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                autoFocus
              />
              <div className="text-[11px] text-muted-foreground">Ví dụ: nhập 50 nghĩa là 50.000đ</div>
              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => { setPayDialogOpen(false); setPayDonId(null); setPayAmount(''); }}>Hủy</Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    if (!payDonId) return;
                    const add = parseInt(payAmount, 10) * 1000;
                    if (!add || add <= 0) {
                      toast.error('Số tiền không hợp lệ');
                      return;
                    }
                    try {
                      const res = await axios.patch('/api/don-thuoc', { id: payDonId, add_payment: add });
                      const updated = res.data.data;
                      setDonThuocs(prev => prev.map(d => d.id === payDonId ? { ...d, ...updated } : d));
                      toast.success('Đã cập nhật thanh toán');
                      setPayDialogOpen(false);
                      setPayDonId(null);
                      setPayAmount('');
                    } catch (err) {
                      toast.error('Lỗi cập nhật thanh toán');
                    }
                  }}
                >Lưu</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}