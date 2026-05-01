// src/components/MobileBottomNav.tsx
// Mobile bottom navigation — đồng bộ toàn bộ chức năng từ Header sang dưới cùng.
// Layout: [Trang chủ] [Bệnh nhân] [🔍 FAB Tìm khách] [Lịch hẹn] [Thêm]
// Sheet "Thêm" chứa: thông báo, tin nhắn, chuyển phòng khám, chuyển chi nhánh,
// toàn bộ menu, và đăng xuất.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import {
  Home,
  Users,
  CalendarDays,
  Menu,
  Search,
  X,
  Glasses,
  FileText,
  UserPlus,
  Warehouse,
  Pill,
  List,
  BarChart,
  BarChart3,
  ArrowRightLeft,
  Bell,
  MessageCircle,
  CreditCard,
  Printer,
  Shield,
  Building2,
  Settings,
  Send,
  LogOut,
  GitBranch,
  ChevronRight,
  Phone,
  Loader2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { useNotificationPolling } from '../hooks/useNotificationPolling';
import type { FeatureKey } from '../lib/featureConfig';

const HIDDEN_ON_PATHS = new Set<string>([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

interface NavTab {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: FeatureKey;
  match?: (pathname: string) => boolean;
}

interface MoreItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: FeatureKey;
  visible?: boolean;
}

interface PatientResult {
  id: number;
  ten: string;
  dienthoai?: string;
  namsinh?: string;
  mabenhnhan?: string;
}

export default function MobileBottomNav() {
  const router = useRouter();
  const {
    user,
    signOut,
    tenants,
    currentTenant,
    currentTenantId,
    switchTenant,
    currentRole,
    userRole,
  } = useAuth();
  const { branches, currentBranchId, switchBranch, isMultiBranch } = useBranch();
  const { canAccessFeature } = useFeatureGate();
  const { counts } = useNotificationPolling();

  const [showSearch, setShowSearch] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Đóng sheet khi đổi route
  useEffect(() => {
    const handle = () => {
      setShowSearch(false);
      setShowMore(false);
    };
    router.events.on('routeChangeStart', handle);
    return () => router.events.off('routeChangeStart', handle);
  }, [router.events]);

  // Khoá scroll body khi mở sheet
  useEffect(() => {
    const open = showSearch || showMore;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showSearch, showMore]);

  // Phát hiện bàn phím ảo — ẩn bottom bar khi gõ
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onResize = () => {
      const heightDiff = window.innerHeight - vv.height;
      setKeyboardOpen(heightDiff > 150);
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // Autofocus khi mở search sheet
  useEffect(() => {
    if (showSearch) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    } else {
      setSearchTerm('');
      setSearchResults([]);
    }
  }, [showSearch]);

  // Debounced search
  useEffect(() => {
    if (!showSearch) return;
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(
          `/api/benh-nhan?search=${encodeURIComponent(term)}&pageSize=15&_t=${Date.now()}`
        );
        setSearchResults(res.data?.data || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [searchTerm, showSearch]);

  const tabs: NavTab[] = useMemo(
    () => [
      { href: '/', label: 'Trang chủ', icon: Home, match: (p) => p === '/' },
      {
        href: '/benh-nhan',
        label: 'Bệnh nhân',
        icon: Users,
        feature: 'patient_management',
        match: (p) => p.startsWith('/benh-nhan') || p.startsWith('/tra-cuu-khach-hang'),
      },
      {
        href: '/lich-hen',
        label: 'Lịch hẹn',
        icon: CalendarDays,
        feature: 'appointments',
        match: (p) => p.startsWith('/lich-hen') || p.startsWith('/cho-kham'),
      },
    ],
    []
  );

  const moreItems: MoreItem[] = useMemo(() => {
    const isOwnerAdmin = currentRole === 'owner' || currentRole === 'admin';
    return [
      { href: '/don-kinh', label: 'Đơn kính', icon: Glasses, feature: 'prescription_glasses' },
      { href: '/don-thuoc', label: 'Đơn thuốc', icon: FileText, feature: 'prescription_medicine' },
      { href: '/quan-ly-kho', label: 'Kho kính', icon: Warehouse, feature: 'inventory_lens' },
      { href: '/quan-ly-kho-thuoc', label: 'Kho thuốc', icon: Pill, feature: 'inventory_drug' },
      { href: '/danh-muc', label: 'Danh mục', icon: List, feature: 'categories' },
      { href: '/bao-cao', label: 'Báo cáo', icon: BarChart, feature: 'basic_reports' },
      { href: '/bao-cao-super', label: 'Báo cáo Pro', icon: BarChart, feature: 'advanced_reports' },
      { href: '/bao-cao-chuoi', label: 'Báo cáo chuỗi', icon: BarChart3, feature: 'chain_reports' },
      { href: '/cham-soc-khach-hang', label: 'Chăm sóc KH', icon: Users, feature: 'crm' },
      { href: '/dieu-chuyen-kho', label: 'Điều chuyển kho', icon: ArrowRightLeft, feature: 'branch_transfer' },
      { href: '/tra-cuu-khach-hang', label: 'Tra cứu KH', icon: Search, feature: 'multi_branch' },
      { href: '/cau-hinh-in', label: 'Cấu hình in', icon: Printer },
      { href: '/cai-dat-nhan-tin', label: 'Nhắn tin tự động', icon: Send, visible: isOwnerAdmin },
      { href: '/quan-ly-phong-kham', label: 'Phòng khám', icon: Settings, visible: isOwnerAdmin },
      { href: '/billing', label: 'Gói dịch vụ', icon: CreditCard },
      { href: '/admin', label: 'Quản trị nền tảng', icon: Shield, visible: userRole === 'superadmin' },
    ].filter((i) => i.visible !== false);
  }, [currentRole, userRole]);

  if (!user) return null;
  if (HIDDEN_ON_PATHS.has(router.pathname)) return null;

  const isActive = (tab: NavTab) =>
    tab.match ? tab.match(router.pathname) : router.pathname === tab.href;

  const resolveHref = (href: string, feature?: FeatureKey) => {
    if (feature && !canAccessFeature(feature)) return '/billing';
    return href;
  };

  const userInitial = (user?.email?.[0] || 'U').toUpperCase();
  const userName = user?.email?.split('@')[0] || 'Guest';
  const totalNotif =
    (counts?.thongBao || 0) + (counts?.tinNhan || 0) + (counts?.tinNhanPlatform || 0);

  const handleSelectPatient = (p: PatientResult) => {
    setShowSearch(false);
    if (p.dienthoai) {
      router.push(`/benh-nhan?search=${encodeURIComponent(p.dienthoai)}`);
    } else {
      router.push(`/benh-nhan?search=${encodeURIComponent(p.ten || '')}`);
    }
  };

  const handleAddNewPatient = () => {
    setShowSearch(false);
    router.push('/benh-nhan?new=1');
  };

  return (
    <>
      {/* Spacer cho mobile để bottom bar không che nội dung */}
      <div
        aria-hidden
        className="md:hidden h-[68px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      />

      {/* Bottom navigation */}
      <nav
        aria-label="Điều hướng dưới cùng"
        className={`md:hidden fixed left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] transition-transform duration-200 ${
          keyboardOpen ? 'translate-y-full' : 'translate-y-0'
        }`}
        style={{ bottom: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="relative grid grid-cols-5 h-[60px] items-stretch">
          {tabs.slice(0, 2).map((tab) => (
            <NavTabItem
              key={tab.href}
              tab={tab}
              active={isActive(tab)}
              resolveHref={resolveHref}
            />
          ))}

          {/* FAB giữa — Tìm khách hàng */}
          <div className="flex items-start justify-center">
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              aria-label="Tìm khách hàng"
              className="-mt-6 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-emerald-600 text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center ring-4 ring-white"
            >
              <Search className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </div>

          {tabs.slice(2, 3).map((tab) => (
            <NavTabItem
              key={tab.href}
              tab={tab}
              active={isActive(tab)}
              resolveHref={resolveHref}
            />
          ))}

          {/* Nút "Thêm" */}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-gray-500 active:text-blue-600 active:bg-gray-50 relative"
            aria-label="Mở menu thêm"
          >
            <div className="relative">
              <Menu className="w-5 h-5" />
              {totalNotif > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {totalNotif > 99 ? '99+' : totalNotif}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-tight">Thêm</span>
          </button>
        </div>
      </nav>

      {/* ─────────── Sheet: Tìm khách hàng ─────────── */}
      {showSearch && (
        <BottomSheet onClose={() => setShowSearch(false)} fullHeight>
          <div className="flex flex-col h-full">
            <div className="px-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    placeholder="Tìm theo SĐT, tên, mã BN..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-12 pl-10 pr-10 rounded-xl bg-gray-100 text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:bg-white transition-all"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-gray-200 text-gray-400"
                      aria-label="Xoá"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowSearch(false)}
                  className="px-3 py-2 text-sm text-blue-600 font-medium"
                >
                  Đóng
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {searching && (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Đang tìm...</span>
                </div>
              )}

              {!searching && searchTerm.trim() && searchResults.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <div className="text-gray-400 text-sm mb-4">
                    Không tìm thấy khách hàng &quot;{searchTerm}&quot;
                  </div>
                  <button
                    type="button"
                    onClick={handleAddNewPatient}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform"
                  >
                    <UserPlus className="w-4 h-4" />
                    Thêm khách hàng mới
                  </button>
                </div>
              )}

              {!searching && !searchTerm.trim() && (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <div className="font-medium text-gray-500 mb-1">Tìm khách hàng</div>
                  <div>Gõ SĐT, tên hoặc mã bệnh nhân để bắt đầu</div>
                </div>
              )}

              {!searching && searchResults.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {searchResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectPatient(p)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {(p.ten || '?')[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">
                            {p.ten || '(không tên)'}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                            {p.dienthoai && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {p.dienthoai}
                              </span>
                            )}
                            {p.namsinh && <span>• {p.namsinh}</span>}
                            {p.mabenhnhan && (
                              <span className="text-gray-400">#{p.mabenhnhan}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-gray-100 p-3">
              <button
                type="button"
                onClick={handleAddNewPatient}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-600 text-sm font-medium active:bg-gray-50"
              >
                <UserPlus className="w-4 h-4" />
                Thêm khách hàng mới
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ─────────── Sheet: Thêm (account + menu + logout) ─────────── */}
      {showMore && (
        <BottomSheet onClose={() => setShowMore(false)} fullHeight>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-base font-bold border border-blue-200 flex-shrink-0">
                  {userInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{userName}</div>
                  <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMore(false)}
                  className="p-2 rounded-full text-gray-400 hover:bg-gray-100"
                  aria-label="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* Quick: thông báo + tin nhắn */}
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/thong-bao"
                  onClick={() => setShowMore(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100 active:scale-[0.98] transition-transform"
                >
                  <div className="relative">
                    <Bell className="w-5 h-5 text-amber-600" />
                    {counts.thongBao > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {counts.thongBao > 9 ? '9+' : counts.thongBao}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-amber-900">Thông báo</span>
                </Link>
                <Link
                  href="/tin-nhan"
                  onClick={() => setShowMore(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-100 active:scale-[0.98] transition-transform"
                >
                  <div className="relative">
                    <MessageCircle className="w-5 h-5 text-blue-600" />
                    {counts.tinNhan + counts.tinNhanPlatform > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {counts.tinNhan + counts.tinNhanPlatform > 9
                          ? '9+'
                          : counts.tinNhan + counts.tinNhanPlatform}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-blue-900">Tin nhắn</span>
                </Link>
              </div>

              {/* Tenant selector */}
              {tenants.length > 1 && (
                <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
                    <Building2 className="w-3 h-3 text-blue-600" />
                    Chuyển phòng khám
                  </label>
                  <select
                    className="w-full h-11 text-sm rounded-lg px-3 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                    value={currentTenantId || ''}
                    onChange={(e) => switchTenant(e.target.value)}
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {tenants.length <= 1 && currentTenant?.name && (
                <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-600 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium text-gray-700 truncate">{currentTenant.name}</span>
                </div>
              )}

              {/* Branch selector */}
              {isMultiBranch && branches.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
                    <GitBranch className="w-3 h-3 text-amber-600" />
                    Chi nhánh
                  </label>
                  <select
                    className="w-full h-11 text-sm rounded-lg px-3 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                    value={currentBranchId || ''}
                    onChange={(e) => switchBranch(e.target.value || null)}
                  >
                    {(currentRole === 'owner' || currentRole === 'admin') && (
                      <option value="">Tất cả chi nhánh</option>
                    )}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.ten_chi_nhanh}
                        {b.is_main ? ' (Chính)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Menu grid */}
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2 px-1">
                  Tất cả chức năng
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {moreItems.map((item) => {
                    const Icon = item.icon;
                    const locked = item.feature ? !canAccessFeature(item.feature) : false;
                    const href = locked ? '/billing' : item.href;
                    return (
                      <Link
                        key={item.href}
                        href={href}
                        onClick={() => setShowMore(false)}
                        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-center transition-all active:scale-[0.98] ${
                          locked
                            ? 'border-gray-100 bg-gray-50'
                            : 'border-gray-200 bg-white active:bg-gray-50'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center relative ${
                            locked ? 'bg-gray-200 text-gray-400' : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {locked && (
                            <Lock className="absolute -bottom-1 -right-1 w-3 h-3 text-gray-400 bg-white rounded-full p-0.5" />
                          )}
                        </div>
                        <span
                          className={`text-[11px] font-medium leading-tight ${
                            locked ? 'text-gray-400' : 'text-gray-700'
                          }`}
                        >
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sticky logout */}
            <div className="border-t border-gray-100 p-3 bg-white flex-shrink-0">
              <button
                type="button"
                onClick={async () => {
                  setShowMore(false);
                  await signOut();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold text-sm active:bg-red-100 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Đăng xuất
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

/* ───────── Sub components ───────── */

function NavTabItem({
  tab,
  active,
  resolveHref,
}: {
  tab: NavTab;
  active: boolean;
  resolveHref: (href: string, feature?: FeatureKey) => string;
}) {
  const Icon = tab.icon;
  const href = resolveHref(tab.href, tab.feature);
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
        active ? 'text-blue-600' : 'text-gray-500 active:text-blue-600'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {active && <span className="absolute top-0 w-8 h-0.5 rounded-full bg-blue-600" />}
      <Icon className={`w-5 h-5 ${active ? 'stroke-[2.4]' : ''}`} />
      <span className={`text-[10px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
        {tab.label}
      </span>
    </Link>
  );
}

function BottomSheet({
  onClose,
  children,
  fullHeight,
}: {
  onClose: () => void;
  children: React.ReactNode;
  fullHeight?: boolean;
}) {
  return (
    <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] mbn-fade-in"
      />
      <div
        className={`absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col mbn-slide-up ${
          fullHeight ? 'h-[92vh]' : 'max-h-[80vh]'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
