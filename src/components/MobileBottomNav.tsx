// src/components/MobileBottomNav.tsx
// Mobile bottom navigation — đồng bộ toàn bộ chức năng từ Header sang dưới cùng.
// Layout: [Trang chủ] [Bệnh nhân] [🔍 FAB Tìm khách] [Lịch hẹn] [Thêm]
// Sheet "Thêm" chứa: thông báo, tin nhắn, chuyển phòng khám, chuyển chi nhánh,
// toàn bộ menu, và đăng xuất.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Frame,
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
  CheckSquare,
  LogOut,
  GitBranch,
  ChevronDown,
  Pencil,
  Phone,
  Loader2,
  Lock,
  History,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { useNotificationPolling } from '../hooks/useNotificationPolling';
import { usePageTabsContext } from '../contexts/PageTabsContext';
import {
  collapseActivitiesToLatestPerPatient,
  getRecentPatientsFromActivities,
  loadRecentActivities,
  pushRecentActivity,
  subscribeRecentActivityUpdates,
  type RecentActivityAction,
  type RecentActivityEvent,
} from '../lib/recentActivity';
import {
  formatActivityClock,
  groupActivitiesByDay,
  type ActivityDayGroup,
} from '../lib/recentActivityGrouping';
import {
  getRecentActivitySyncStatus,
  scheduleRecentActivitySync,
  subscribeRecentActivitySyncStatus,
} from '../lib/recentActivitySync';
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
  diachi?: string;
  namsinh?: string;
  mabenhnhan?: string;
  ngay_kham_gan_nhat?: string;
}

type DefaultAction = 'kinh' | 'thuoc' | 'hoso';
type PatientMenuAction = DefaultAction | 'sua';
type ActivityFilter = 'all' | 'search' | 'history' | 'prescription' | 'dang_do';
const FAB_SEARCH_PAGE_SIZE = 80;
const FAB_SEARCH_INITIAL_VISIBLE = 30;
const FAB_SEARCH_VISIBLE_STEP = 30;
const ACTIVITY_TIMELINE_INITIAL = 50;
const ACTIVITY_TIMELINE_STEP = 50;

function actionFromDefault(defaultAction: DefaultAction): RecentActivityAction {
  if (defaultAction === 'kinh') return 'open_rx_glasses';
  if (defaultAction === 'thuoc') return 'open_rx_drug';
  return 'open_profile';
}

function actionLabel(action: RecentActivityAction): string {
  switch (action) {
    case 'search_hit':
      return 'Vừa tìm kiếm';
    case 'quick_history_open':
      return 'Mở nhanh lịch sử';
    case 'open_rx_drug':
      return 'Mở kê đơn thuốc';
    case 'open_rx_glasses':
      return 'Mở kê đơn kính';
    case 'open_profile':
    default:
      return 'Mở hồ sơ';
  }
}

function actionCategory(action: RecentActivityAction): ActivityFilter {
  if (action === 'search_hit') return 'search';
  if (action === 'open_rx_drug' || action === 'open_rx_glasses') return 'prescription';
  return 'history';
}

function isDangDoAction(action: RecentActivityAction): boolean {
  return action === 'search_hit' || action === 'quick_history_open' || action === 'open_profile';
}

function normalizeNameLike(text: string): string {
  return text
    .replace(/[\s,;._-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const first = word.charAt(0);
      const rest = word.slice(1);
      return `${first.toLocaleUpperCase('vi-VN')}${rest.toLocaleLowerCase('vi-VN')}`;
    })
    .join(' ');
}

function parsePatientSeed(raw: string): { ten: string; namsinh: string; dienthoai: string; diachi: string } {
  const input = raw.trim();
  if (!input) return { ten: '', namsinh: '', dienthoai: '', diachi: '' };

  const normalizedInput = input.replace(/[\s,;]+/g, ' ').trim();
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

  let namsinh = '';
  let diachi = '';
  let ten = '';
  let dienthoai = '';
  let phoneStart = -1;
  let phoneEnd = -1;

  const phoneCompactMatch = normalizedInput.match(/(?:\+?84|0)\d{8,10}\b/);
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
      ten = normalizeNameLike(leftParsed.before);
      diachi = normalizeNameLike(`${leftParsed.after} ${afterPhone}`.trim());
    } else {
      const rightParsed = splitDob(afterPhone);
      namsinh = rightParsed.dob;
      ten = normalizeNameLike(rightParsed.before);
      diachi = normalizeNameLike(rightParsed.after);
    }
  } else {
    const parsed = splitDob(normalizedInput);
    namsinh = parsed.dob;
    ten = normalizeNameLike(parsed.before);
    diachi = normalizeNameLike(parsed.after);
  }

  return { ten, namsinh, dienthoai, diachi };
}

// Sắp xếp kết quả: ưu tiên SĐT khớp chính xác → tiền tố SĐT → khớp tên
function rankResults(items: PatientResult[], term: string): PatientResult[] {
  const t = term.trim().toLowerCase();
  if (!t) return items;
  const isPhoneLike = /^\d{2,}$/.test(t);
  const birthYearMatch = t.match(/\b(19\d{2}|20\d{2})\b/);
  const birthToken = birthYearMatch?.[1] || '';
  const nameOnly = t.replace(/\b(19\d{2}|20\d{2})\b/g, ' ').replace(/\s+/g, ' ').trim();
  const nameTokens = nameOnly.split(' ').filter(Boolean);
  return [...items].sort(
    (a, b) =>
      scoreItem(b, t, isPhoneLike, nameTokens, birthToken) -
      scoreItem(a, t, isPhoneLike, nameTokens, birthToken)
  );
}

function scoreItem(
  p: PatientResult,
  t: string,
  isPhoneLike: boolean,
  nameTokens: string[],
  birthToken: string
): number {
  const phone = (p.dienthoai || '').toLowerCase();
  const name = (p.ten || '').toLowerCase();
  const birth = (p.namsinh || '').toLowerCase();
  let s = 0;
  if (isPhoneLike) {
    if (phone === t) s += 100;
    else if (phone.startsWith(t)) s += 60;
    else if (phone.includes(t)) s += 30;
  }
  if (name.startsWith(t)) s += 20;
  else if (name.includes(t)) s += 10;

  if (nameTokens.length > 0) {
    const matchedTokens = nameTokens.reduce((count, token) => count + (name.includes(token) ? 1 : 0), 0);
    s += matchedTokens * 8;
    if (matchedTokens === nameTokens.length) s += 20;
  }

  if (birthToken) {
    if (birth.includes(birthToken)) s += 18;
    if (nameTokens.length > 0 && nameTokens.every((token) => name.includes(token)) && birth.includes(birthToken)) {
      s += 30;
    }
  }
  return s;
}

function digitsOnly(value?: string): string {
  return (value || '').replace(/\D/g, '');
}

function toDialNumber(digits: string): string {
  if (!digits) return '';
  if (digits.startsWith('84')) return `+${digits}`;
  return digits;
}

function toZaloNumber(digits: string): string {
  if (!digits) return '';
  if (digits.startsWith('0')) return `84${digits.slice(1)}`;
  if (digits.startsWith('84')) return digits;
  return digits;
}

function openZaloDeepLink(zaloNumber: string) {
  const zaloUrl = `https://zalo.me/${zaloNumber}`;
  const popup = window.open(zaloUrl, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.href = zaloUrl;
  }
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
  const { pageTabs } = usePageTabsContext();
  const { counts } = useNotificationPolling();

  const [showSearch, setShowSearch] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [searchVisibleCount, setSearchVisibleCount] = useState(FAB_SEARCH_INITIAL_VISIBLE);
  const [searching, setSearching] = useState(false);
  const [recentActivities, setRecentActivities] = useState<RecentActivityEvent[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [activityVisibleCount, setActivityVisibleCount] = useState(ACTIVITY_TIMELINE_INITIAL);
  const [syncingActivity, setSyncingActivity] = useState(false);
  const [activityLastSyncAt, setActivityLastSyncAtState] = useState<number | null>(null);
  const [activitySyncError, setActivitySyncError] = useState<string>('');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [activityHasBranch, setActivityHasBranch] = useState(!!currentBranchId);
  const [expandedMenuPatientId, setExpandedMenuPatientId] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const fabHoldTimerRef = useRef<number | null>(null);
  const fabLongPressTriggeredRef = useRef(false);

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return recentActivities;
    if (activityFilter === 'dang_do') {
      return recentActivities.filter((activity) => isDangDoAction(activity.action));
    }
    return recentActivities.filter((activity) => actionCategory(activity.action) === activityFilter);
  }, [activityFilter, recentActivities]);

  const displayActivities = useMemo(
    () => collapseActivitiesToLatestPerPatient(filteredActivities),
    [filteredActivities]
  );

  const filteredPatients = useMemo(
    () => getRecentPatientsFromActivities(displayActivities) as PatientResult[],
    [displayActivities]
  );

  const visibleActivities = useMemo(
    () => displayActivities.slice(0, activityVisibleCount),
    [displayActivities, activityVisibleCount]
  );

  const activityDayGroups = useMemo(
    () => groupActivitiesByDay(visibleActivities),
    [visibleActivities]
  );

  const canLoadMoreActivities = displayActivities.length > activityVisibleCount;

  const visibleSearchResults = useMemo(
    () => searchResults.slice(0, searchVisibleCount),
    [searchResults, searchVisibleCount]
  );

  const canLoadMoreSearchResults = useMemo(
    () => searchResults.length > searchVisibleCount,
    [searchResults.length, searchVisibleCount]
  );

  const activitySyncMetaText = useMemo(() => {
    if (syncingActivity) return 'Đang đồng bộ...';
    if (activitySyncError) return activitySyncError;
    if (pendingSyncCount > 0) return `Chờ đồng bộ: ${pendingSyncCount}`;
    if (!activityLastSyncAt) return 'Chưa đồng bộ';

    const diffMs = Math.max(0, Date.now() - activityLastSyncAt);
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Đã đồng bộ: vừa xong';
    if (mins < 60) return `Đã đồng bộ: ${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    return `Đã đồng bộ: ${hours} giờ trước`;
  }, [activityLastSyncAt, activitySyncError, pendingSyncCount, syncingActivity]);

  const clearFabHoldTimer = useCallback(() => {
    if (fabHoldTimerRef.current !== null) {
      clearTimeout(fabHoldTimerRef.current);
      fabHoldTimerRef.current = null;
    }
  }, []);

  const closeAllSheets = useCallback(() => {
    clearFabHoldTimer();
    fabLongPressTriggeredRef.current = false;
    setShowFabMenu(false);
    setExpandedMenuPatientId(null);
    setShowSearch(false);
    setShowMore(false);
  }, [clearFabHoldTimer]);

  const toggleSearchSheet = useCallback(() => {
    setShowFabMenu(false);
    setShowMore(false);
    setShowSearch((prev) => !prev);
  }, []);

  const toggleMoreSheet = useCallback(() => {
    setShowFabMenu(false);
    setShowSearch(false);
    setShowMore((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => clearFabHoldTimer();
  }, [clearFabHoldTimer]);

  // Đóng sheet khi đổi route
  useEffect(() => {
    const handle = () => {
      closeAllSheets();
    };
    router.events.on('routeChangeStart', handle);
    return () => router.events.off('routeChangeStart', handle);
  }, [closeAllSheets, router.events]);

  // Hỗ trợ phím ESC để đóng sheet
  useEffect(() => {
    if (!showSearch && !showMore && !showFabMenu) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllSheets();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeAllSheets, showFabMenu, showMore, showSearch]);

  // Phím tắt toàn cục: Ctrl+K để mở nhanh tìm kiếm bệnh nhân
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping) return;
      e.preventDefault();
      toggleSearchSheet();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSearchSheet]);

  // Trigger toàn cục từ header desktop để mở tìm kiếm nhanh
  useEffect(() => {
    const onOpen = () => {
      setShowFabMenu(false);
      setShowMore(false);
      setShowSearch(true);
    };
    window.addEventListener('open-global-patient-search', onOpen as EventListener);
    return () => window.removeEventListener('open-global-patient-search', onOpen as EventListener);
  }, []);

  // Khoá scroll body khi mở sheet hoặc menu nhanh FAB
  useEffect(() => {
    const open = showSearch || showMore || showFabMenu;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showFabMenu, showSearch, showMore]);

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

  // Autofocus khi mở search sheet + nạp dữ liệu cá nhân hoá
  useEffect(() => {
    if (showSearch) {
      setRecentActivities(loadRecentActivities());
      const status = getRecentActivitySyncStatus();
      setActivityLastSyncAtState(status.lastSyncAt);
      setActivitySyncError(status.error);
      setPendingSyncCount(status.pendingCount);
      setSyncingActivity(status.syncing);
      setActivityHasBranch(status.hasBranch);
      setActivityHasBranch(status.hasBranch);
      setActivityFilter('all');
      setActivityVisibleCount(ACTIVITY_TIMELINE_INITIAL);
      setExpandedMenuPatientId(null);
      scheduleRecentActivitySync('open_search');
      const t = setTimeout(() => {
        if (window.matchMedia('(min-width: 768px)').matches) {
          desktopSearchInputRef.current?.focus();
        } else {
          searchInputRef.current?.focus();
        }
      }, 120);
      return () => clearTimeout(t);
    } else {
      setExpandedMenuPatientId(null);
      setSearchTerm('');
      setSearchResults([]);
      setSearchVisibleCount(FAB_SEARCH_INITIAL_VISIBLE);
      setActivityFilter('all');
      setActivityVisibleCount(ACTIVITY_TIMELINE_INITIAL);
    }
  }, [showSearch]);

  useEffect(() => {
    setSearchVisibleCount(FAB_SEARCH_INITIAL_VISIBLE);
  }, [searchTerm]);

  useEffect(() => {
    setActivityVisibleCount(ACTIVITY_TIMELINE_INITIAL);
  }, [activityFilter]);

  useEffect(() => {
    return subscribeRecentActivityUpdates((events) => {
      setRecentActivities(events);
    });
  }, []);

  useEffect(() => {
    return subscribeRecentActivitySyncStatus((status) => {
      setSyncingActivity(status.syncing);
      setActivityLastSyncAtState(status.lastSyncAt);
      setActivitySyncError(status.error);
      setPendingSyncCount(status.pendingCount);
      setActivityHasBranch(status.hasBranch);
    });
  }, []);

  useEffect(() => {
    setActivityHasBranch(!!currentBranchId);
  }, [currentBranchId]);

  // Debounced search
  useEffect(() => {
    if (!showSearch) return;
    const term = searchTerm.trim();
    if (!term) {
      setExpandedMenuPatientId(null);
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(
          `/api/benh-nhan?search=${encodeURIComponent(term)}&pageSize=${FAB_SEARCH_PAGE_SIZE}&_t=${Date.now()}`
        );
        const data: PatientResult[] = res.data?.data || [];
        setSearchResults(rankResults(data, term));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
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
        match: (p) => p.startsWith('/lich-hen'),
      },
    ],
    []
  );

  const moreItems = useMemo<MoreItem[]>(() => {
    const isOwnerAdmin = currentRole === 'owner' || currentRole === 'admin';
    const items: MoreItem[] = [
      { href: '/', label: 'Trang chủ', icon: Home },
      { href: '/benh-nhan', label: 'Bệnh nhân', icon: Users, feature: 'patient_management' },
      { href: '/lich-hen', label: 'Lịch hẹn', icon: CalendarDays, feature: 'appointments' },
      { href: '/don-kinh', label: 'Đơn kính', icon: Glasses, feature: 'prescription_glasses' },
      { href: '/don-thuoc', label: 'Đơn thuốc', icon: FileText, feature: 'prescription_medicine' },
      { href: '/quan-ly-kho', label: 'Kho tròng', icon: Warehouse, feature: 'lens_catalog' },
      { href: '/quan-ly-kho-gong', label: 'Kho gọng', icon: Frame, feature: 'frame_catalog' },
      { href: '/quan-ly-kho-thuoc', label: 'Kho thuốc', icon: Pill, feature: 'drug_catalog' },
      { href: '/danh-muc', label: 'Danh mục', icon: List, feature: 'categories' },
      { href: '/bao-cao', label: 'Báo cáo', icon: BarChart, feature: 'basic_reports' },
      { href: '/bao-cao-super', label: 'Báo cáo Pro', icon: BarChart, feature: 'advanced_reports' },
      { href: '/bao-cao-chuoi', label: 'Báo cáo chuỗi', icon: BarChart3, feature: 'chain_reports' },
      { href: '/ton-kho-chuoi', label: 'Tồn kho chuỗi', icon: BarChart3, feature: 'multi_branch' },
      { href: '/cham-cong', label: 'Chấm công', icon: CalendarDays, feature: 'staff_attendance' },
      { href: '/lab-gia-cong', label: 'Lab gia công', icon: Glasses, feature: 'multi_branch' },
      { href: '/cham-soc-khach-hang', label: 'Chăm sóc KH', icon: Users, feature: 'crm' },
      { href: '/quan-ly-ghi-chu-khach-hang', label: 'Việc cần làm KH', icon: CalendarDays, feature: 'crm' },
      { href: '/dieu-chuyen-kho', label: 'Điều chuyển kho', icon: ArrowRightLeft, feature: 'branch_transfer' },
      { href: '/tra-cuu-khach-hang', label: 'Tra cứu KH', icon: Search, feature: 'multi_branch' },
      { href: '/cau-hinh-in', label: 'Cấu hình in', icon: Printer },
      { href: '/tem-kinh', label: 'In tem kính', icon: Printer, feature: 'print_config' },
      { href: '/cai-dat-nhan-tin', label: 'Nhắn tin tự động', icon: Send, visible: isOwnerAdmin },
      { href: '/quan-ly-phong-kham', label: 'Phòng khám', icon: Settings, visible: isOwnerAdmin },
      { href: '/tinh-nang', label: 'Tính năng phần mềm', icon: Sparkles },
      { href: '/billing', label: 'Gói dịch vụ', icon: CreditCard },
      { href: '/admin', label: 'Quản trị nền tảng', icon: Shield, visible: userRole === 'superadmin' },
    ];
    return items.filter((i) => i.visible !== false);
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
    (counts?.thongBao || 0) + (counts?.tinNhanPlatform || 0);

  const triggerMenuAction = (
    p: PatientResult,
    action: PatientMenuAction,
    origin: 'search' | 'activity' = 'activity'
  ) => {
    // From search results, record the real action only (avoid search_hit + open_* duplicate).
    // search_hit is reserved for browse/select without navigating to a workspace action.
    if (action !== 'sua') {
      pushRecentActivity({
        action: actionFromDefault(action),
        patient: p,
        source: origin === 'search' ? 'fab_search_action' : 'fab_action',
      });
    } else if (origin === 'search') {
      pushRecentActivity({ action: 'search_hit', patient: p, source: 'fab_search' });
    }
    setExpandedMenuPatientId(null);
    setShowFabMenu(false);
    setShowSearch(false);
    if (action === 'kinh') router.push(`/ke-don-kinh?bn=${p.id}`);
    else if (action === 'thuoc') router.push(`/ke-don?bn=${p.id}`);
    else if (action === 'sua') {
      router.push(`/benh-nhan?focusId=${p.id}&edit=1`);
    } else {
      const params = new URLSearchParams();
      const searchSeed = (p.dienthoai || p.ten || '').trim();
      if (searchSeed) params.set('search', searchSeed);
      params.set('focusId', String(p.id));
      router.push(`/benh-nhan?${params.toString()}`);
    }
  };

  const openBranchPicker = () => {
    setShowSearch(false);
    setShowFabMenu(false);
    setShowMore(true);
  };

  const handlePatientZaloAction = (p: PatientResult) => {
    const zaloNumber = toZaloNumber(digitsOnly(p.dienthoai));
    if (!zaloNumber) return;

    setExpandedMenuPatientId(null);
    openZaloDeepLink(zaloNumber);
  };

  const handlePatientCallAction = (p: PatientResult) => {
    const phoneDigits = digitsOnly(p.dienthoai);
    if (phoneDigits.length < 8) return;
    const dial = toDialNumber(phoneDigits);
    if (!dial) return;
    setExpandedMenuPatientId(null);
    window.location.href = `tel:${dial}`;
  };

  const togglePatientMenu = (patientId: number) => {
    setExpandedMenuPatientId((prev) => (prev === patientId ? null : patientId));
  };

  const handleEnterExpandFirst = () => {
    const list = searchTerm.trim() ? visibleSearchResults : filteredPatients;
    if (list.length === 0) return;
    const firstId = list[0].id;
    setExpandedMenuPatientId((prev) => (prev === firstId ? null : firstId));
  };

  const handleAddNewPatient = (seedText?: string) => {
    const rawText = (seedText ?? searchTerm).trim();
    const params = new URLSearchParams();
    params.set('new', '1');

    if (rawText) {
      const seed = parsePatientSeed(rawText);
      if (seed.ten) params.set('quick_name', seed.ten);
      if (seed.namsinh) params.set('quick_namsinh', seed.namsinh);
      if (seed.dienthoai) params.set('quick_phone', seed.dienthoai);
      if (seed.diachi) params.set('quick_diachi', seed.diachi);
    }

    closeAllSheets();
    router.push(`/benh-nhan?${params.toString()}`);
  };

  const handleFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    fabLongPressTriggeredRef.current = false;
    clearFabHoldTimer();

    fabHoldTimerRef.current = window.setTimeout(() => {
      fabLongPressTriggeredRef.current = true;
      setShowSearch(false);
      setShowMore(false);
      setShowFabMenu(true);
    }, 420);
  };

  const handleFabPointerEnd = () => {
    clearFabHoldTimer();
  };

  const handleFabClick = () => {
    if (fabLongPressTriggeredRef.current) {
      fabLongPressTriggeredRef.current = false;
      return;
    }

    if (showFabMenu) {
      setShowFabMenu(false);
      return;
    }

    toggleSearchSheet();
  };

  return (
    <>
      {/* Desktop search modal */}
      {showSearch && (
        <div className="hidden md:block fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <button
            type="button"
            onClick={closeAllSheets}
            className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
            aria-label="Đóng tìm kiếm nhanh"
          />

          <div className="absolute left-1/2 top-12 w-[min(520px,86vw)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    ref={desktopSearchInputRef}
                    type="text"
                    inputMode="search"
                    enterKeyHint="go"
                    autoComplete="off"
                    placeholder="Tìm theo SĐT, tên, mã BN..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      if (e.ctrlKey || e.metaKey) {
                        handleAddNewPatient();
                        return;
                      }
                      handleEnterExpandFirst();
                    }}
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
                  onClick={closeAllSheets}
                  className="px-3 py-2 text-sm text-blue-600 font-medium"
                >
                  Đóng
                </button>
              </div>
            </div>

            <div className="max-h-[65vh] overflow-y-auto">
              {searching && (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Đang tìm...</span>
                </div>
              )}

              {!searching && searchTerm.trim() && searchResults.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <div className="text-gray-400 text-sm mb-4">
                    Không tìm thấy khách hàng &quot;{searchTerm}&quot;
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddNewPatient()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm"
                  >
                    <UserPlus className="w-4 h-4" />
                    Thêm khách hàng mới
                  </button>
                </div>
              )}

              {!searching && !searchTerm.trim() && (
                <RecentActivityTimeline
                  paddingClass="px-5"
                  activityFilter={activityFilter}
                  setActivityFilter={setActivityFilter}
                  activitySyncMetaText={activitySyncMetaText}
                  activitySyncError={!!activitySyncError}
                  syncingActivity={syncingActivity}
                  onRefresh={() => scheduleRecentActivitySync('manual')}
                  activityDayGroups={activityDayGroups}
                  canLoadMoreActivities={canLoadMoreActivities}
                  visibleCount={visibleActivities.length}
                  totalCount={displayActivities.length}
                  onLoadMore={() => setActivityVisibleCount((prev) => prev + ACTIVITY_TIMELINE_STEP)}
                  expandedMenuPatientId={expandedMenuPatientId}
                  onToggleMenu={togglePatientMenu}
                  onMenuAction={(patient, action) => triggerMenuAction(patient, action, 'activity')}
                  onCallAction={handlePatientCallAction}
                  onZaloAction={handlePatientZaloAction}
                  needsBranch={!activityHasBranch}
                  onPickBranch={openBranchPicker}
                  currentUserId={user?.id || null}
                />
              )}

              {!searching && searchResults.length > 0 && (
                <>
                  <ul className="divide-y divide-gray-100">
                    {visibleSearchResults.map((p) => (
                      <PatientRow
                        key={`sd-${p.id}`}
                        p={p}
                        isMenuOpen={expandedMenuPatientId === p.id}
                        onToggleMenu={() => togglePatientMenu(p.id)}
                        onMenuAction={(patient, action) => triggerMenuAction(patient, action, 'search')}
                        onCallAction={handlePatientCallAction}
                        onZaloAction={handlePatientZaloAction}
                      />
                    ))}
                  </ul>
                  {canLoadMoreSearchResults && (
                    <div className="px-5 py-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setSearchVisibleCount((prev) => prev + FAB_SEARCH_VISIBLE_STEP)}
                        className="w-full h-10 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"
                      >
                        Xem thêm ({visibleSearchResults.length}/{searchResults.length})
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-gray-100 p-4">
              <button
                type="button"
                onClick={() => handleAddNewPatient()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
              >
                <UserPlus className="w-4 h-4" />
                Thêm khách hàng mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spacer cho mobile để bottom bar không che nội dung */}
      <div
        aria-hidden
        className="md:hidden h-[68px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      />

      {showFabMenu && (
        <button
          type="button"
          aria-label="Đóng menu nhanh FAB"
          onClick={() => setShowFabMenu(false)}
          className="md:hidden fixed inset-0 z-[49] bg-black/10 backdrop-blur-[1px]"
        />
      )}

      {/* Bottom navigation */}
      <nav
        aria-label="Điều hướng dưới cùng"
        className={`md:hidden fixed left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] transition-transform duration-200 ${
          keyboardOpen ? 'translate-y-full' : 'translate-y-0'
        }`}
        style={{ bottom: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="relative grid grid-cols-5 h-[60px] items-stretch">
          {pageTabs ? (
            <PageTabBtn
              item={pageTabs.items[0]}
              active={pageTabs.activeIdx === 0}
              onClick={() => pageTabs.onChange(0)}
            />
          ) : (
            tabs.slice(0, 2).map((tab) => (
              <NavTabItem
                key={tab.href}
                tab={tab}
                active={isActive(tab)}
                resolveHref={resolveHref}
              />
            ))
          )}
          {pageTabs && (
            <PageTabBtn
              item={pageTabs.items[1]}
              active={pageTabs.activeIdx === 1}
              onClick={() => pageTabs.onChange(1)}
            />
          )}

          {/* FAB giữa — Tìm khách hàng */}
          <div className="relative flex items-center justify-center">
            <div
              id="mbn-fab-menu"
              className={`absolute -top-[132px] z-20 w-44 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-xl p-1.5 transition-all duration-150 ${
                showFabMenu
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-1 pointer-events-none'
              }`}
            >
              <FabQuickAction
                label="Tìm khách"
                icon={Search}
                onClick={() => {
                  setShowFabMenu(false);
                  setShowMore(false);
                  setShowSearch(true);
                }}
              />
              <FabQuickAction
                label="Thêm khách"
                icon={UserPlus}
                onClick={() => handleAddNewPatient()}
              />
              <FabQuickAction
                label="Mở menu"
                icon={Menu}
                onClick={() => {
                  setShowFabMenu(false);
                  setShowSearch(false);
                  setShowMore(true);
                }}
              />
            </div>

            <button
              type="button"
              onClick={handleFabClick}
              onPointerDown={handleFabPointerDown}
              onPointerUp={handleFabPointerEnd}
              onPointerCancel={handleFabPointerEnd}
              onPointerLeave={handleFabPointerEnd}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={showFabMenu ? 'Đóng menu nhanh FAB' : showSearch ? 'Đóng tìm khách hàng' : 'Tìm khách hàng'}
              aria-expanded={showSearch || showFabMenu}
              aria-controls={showFabMenu ? 'mbn-fab-menu' : 'mbn-search-sheet'}
              className={`w-14 h-14 rounded-full text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center ring-4 ring-white ${
                showSearch || showFabMenu
                  ? 'bg-gradient-to-br from-blue-700 to-emerald-700 scale-[0.97]'
                  : 'bg-gradient-to-br from-blue-600 to-emerald-600'
              }`}
            >
              {showSearch || showFabMenu ? (
                <X className="w-6 h-6" strokeWidth={2.5} />
              ) : (
                <Search className="w-6 h-6" strokeWidth={2.5} />
              )}
            </button>
          </div>

          {pageTabs ? (
            <PageTabBtn
              item={pageTabs.items[2]}
              active={pageTabs.activeIdx === 2}
              onClick={() => pageTabs.onChange(2)}
            />
          ) : (
            tabs.slice(2, 3).map((tab) => (
              <NavTabItem
                key={tab.href}
                tab={tab}
                active={isActive(tab)}
                resolveHref={resolveHref}
              />
            ))
          )}

          {/* Nút "Thêm" */}
          <button
            type="button"
            onClick={toggleMoreSheet}
            aria-expanded={showMore}
            aria-controls="mbn-more-sheet"
            className={`flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
              showMore
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-500 active:text-blue-600 active:bg-gray-50'
            }`}
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

      {/* ─────────── Sheet: Tìm khách hàng (Action Hub) ─────────── */}
      {showSearch && (
        <BottomSheet onClose={closeAllSheets} fullHeight sheetId="mbn-search-sheet">
          <div className="flex flex-col h-full">
            {/* Search input */}
            <div className="px-4 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    inputMode="search"
                    enterKeyHint="go"
                    autoComplete="off"
                    placeholder="Tìm theo SĐT, tên, mã BN..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      if (e.ctrlKey || e.metaKey) {
                        handleAddNewPatient();
                        return;
                      }
                      handleEnterExpandFirst();
                    }}
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

            {/* Results / Recent */}
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
                    onClick={() => handleAddNewPatient()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform"
                  >
                    <UserPlus className="w-4 h-4" />
                    Thêm khách hàng mới
                  </button>
                </div>
              )}

              {/* Empty state — show activity timeline */}
              {!searching && !searchTerm.trim() && (
                <RecentActivityTimeline
                  paddingClass="px-4"
                  activityFilter={activityFilter}
                  setActivityFilter={setActivityFilter}
                  activitySyncMetaText={activitySyncMetaText}
                  activitySyncError={!!activitySyncError}
                  syncingActivity={syncingActivity}
                  onRefresh={() => scheduleRecentActivitySync('manual')}
                  activityDayGroups={activityDayGroups}
                  canLoadMoreActivities={canLoadMoreActivities}
                  visibleCount={visibleActivities.length}
                  totalCount={displayActivities.length}
                  onLoadMore={() => setActivityVisibleCount((prev) => prev + ACTIVITY_TIMELINE_STEP)}
                  expandedMenuPatientId={expandedMenuPatientId}
                  onToggleMenu={togglePatientMenu}
                  onMenuAction={(patient, action) => triggerMenuAction(patient, action, 'activity')}
                  onCallAction={handlePatientCallAction}
                  onZaloAction={handlePatientZaloAction}
                  needsBranch={!activityHasBranch}
                  onPickBranch={openBranchPicker}
                  currentUserId={user?.id || null}
                />
              )}

              {!searching && searchResults.length > 0 && (
                <>
                  <ul className="divide-y divide-gray-100">
                    {visibleSearchResults.map((p) => (
                      <PatientRow
                        key={p.id}
                        p={p}
                        isMenuOpen={expandedMenuPatientId === p.id}
                        onToggleMenu={() => togglePatientMenu(p.id)}
                        onMenuAction={(patient, action) => triggerMenuAction(patient, action, 'search')}
                        onCallAction={handlePatientCallAction}
                        onZaloAction={handlePatientZaloAction}
                      />
                    ))}
                  </ul>
                  {canLoadMoreSearchResults && (
                    <div className="px-4 py-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setSearchVisibleCount((prev) => prev + FAB_SEARCH_VISIBLE_STEP)}
                        className="w-full h-10 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium active:scale-[0.99] transition-transform"
                      >
                        Xem thêm ({visibleSearchResults.length}/{searchResults.length})
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-gray-100 p-3">
              <button
                type="button"
                onClick={() => handleAddNewPatient()}
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
        <BottomSheet onClose={closeAllSheets} fullHeight sheetId="mbn-more-sheet">
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
              {/* Quick: thông báo + nhắc việc */}
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/thong-bao"
                  onClick={() => setShowMore(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100 active:scale-[0.98] transition-transform"
                >
                  <div className="relative">
                    <Bell className="w-5 h-5 text-amber-600" />
                    {(counts.thongBao + counts.tinNhanPlatform) > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {(counts.thongBao + counts.tinNhanPlatform) > 9
                          ? '9+'
                          : counts.thongBao + counts.tinNhanPlatform}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-amber-900">Thông báo</span>
                </Link>
                <Link
                  href="/nhac-viec"
                  onClick={() => setShowMore(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-100 active:scale-[0.98] transition-transform"
                >
                  <div className="relative">
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                    {counts.nhacViec > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {counts.nhacViec > 9 ? '9+' : counts.nhacViec}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-blue-900">Nhắc việc</span>
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

function FabQuickAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm font-medium text-gray-700 hover:bg-blue-50 active:bg-blue-100 transition-colors"
    >
      <Icon className="w-4 h-4 text-blue-600" />
      <span>{label}</span>
    </button>
  );
}

function ActivityFilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-gray-200 bg-white text-gray-600 active:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}

function staffBadgeLabel(fullName?: string | null): string {
  const name = (fullName || '').trim();
  if (!name) return '';
  const parts = name.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || name;
}

function RecentActivityTimeline({
  paddingClass,
  activityFilter,
  setActivityFilter,
  activitySyncMetaText,
  activitySyncError,
  syncingActivity,
  onRefresh,
  activityDayGroups,
  canLoadMoreActivities,
  visibleCount,
  totalCount,
  onLoadMore,
  expandedMenuPatientId,
  onToggleMenu,
  onMenuAction,
  onCallAction,
  onZaloAction,
  needsBranch,
  onPickBranch,
  currentUserId,
}: {
  paddingClass: string;
  activityFilter: ActivityFilter;
  setActivityFilter: (filter: ActivityFilter) => void;
  activitySyncMetaText: string;
  activitySyncError: boolean;
  syncingActivity: boolean;
  onRefresh: () => void;
  activityDayGroups: ActivityDayGroup[];
  canLoadMoreActivities: boolean;
  visibleCount: number;
  totalCount: number;
  onLoadMore: () => void;
  expandedMenuPatientId: number | null;
  onToggleMenu: (patientId: number) => void;
  onMenuAction: (p: PatientResult, action: PatientMenuAction) => void;
  onCallAction: (p: PatientResult) => void;
  onZaloAction: (p: PatientResult) => void;
  needsBranch?: boolean;
  onPickBranch?: () => void;
  currentUserId?: string | null;
}) {
  return (
    <>
      <div className={`${paddingClass} pt-3 pb-1 flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-400">
          <History className="w-3 h-3" />
          Khách gần đây
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10px] truncate ${activitySyncError ? 'text-amber-600' : 'text-blue-500'}`}>
            {activitySyncMetaText}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={needsBranch}
            className="p-1 rounded-md text-blue-500 hover:bg-blue-50 active:scale-95 transition-transform disabled:opacity-40"
            aria-label="Đồng bộ lại hoạt động"
            title="Đồng bộ lại"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingActivity ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {needsBranch && (
        <div className={`${paddingClass} pb-2`}>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="text-xs font-semibold text-amber-900 mb-1">
              Chọn chi nhánh để đồng bộ khách gần đây
            </div>
            <div className="text-[11px] text-amber-800 mb-2">
              Activity Hub đồng bộ theo từng chi nhánh giữa các thiết bị. Khi đang xem &quot;Tất cả chi nhánh&quot;, hãy chọn một chi nhánh cụ thể.
            </div>
            <button
              type="button"
              onClick={onPickBranch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white active:scale-[0.98]"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Chọn chi nhánh
            </button>
          </div>
        </div>
      )}

      <div className={`${paddingClass} pb-2 flex items-center gap-1.5 overflow-x-auto`}>
        <ActivityFilterPill
          label="Tất cả"
          active={activityFilter === 'all'}
          onClick={() => setActivityFilter('all')}
        />
        <ActivityFilterPill
          label="Tìm kiếm"
          active={activityFilter === 'search'}
          onClick={() => setActivityFilter('search')}
        />
        <ActivityFilterPill
          label="Lịch sử"
          active={activityFilter === 'history'}
          onClick={() => setActivityFilter('history')}
        />
        <ActivityFilterPill
          label="Kê đơn"
          active={activityFilter === 'prescription'}
          onClick={() => setActivityFilter('prescription')}
        />
        <ActivityFilterPill
          label="Đang dang dở"
          active={activityFilter === 'dang_do'}
          onClick={() => setActivityFilter('dang_do')}
        />
      </div>

      {activityDayGroups.length > 0 ? (
        <>
          {activityDayGroups.map((group) => (
            <div key={group.dayKey}>
              <div className={`${paddingClass} sticky top-0 z-[1] bg-white/95 backdrop-blur-sm py-1.5`}>
                <div className="text-[11px] font-bold text-gray-500 tracking-wide">
                  {group.header}
                </div>
              </div>
              <ul className="divide-y divide-gray-100">
                {group.items.map((activity) => {
                  const staffLabel =
                    activity.createdBy &&
                    currentUserId &&
                    activity.createdBy !== currentUserId
                      ? staffBadgeLabel(activity.createdByName)
                      : '';
                  return (
                    <PatientRow
                      key={activity.eventId}
                      p={activity.patient as PatientResult}
                      isMenuOpen={expandedMenuPatientId === activity.patient.id}
                      onToggleMenu={() => onToggleMenu(activity.patient.id)}
                      onMenuAction={onMenuAction}
                      onCallAction={onCallAction}
                      onZaloAction={onZaloAction}
                      activityLabel={actionLabel(activity.action)}
                      activityRelativeTime={formatActivityClock(activity.timestamp)}
                      staffLabel={staffLabel || undefined}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
          {canLoadMoreActivities && (
            <div className={`${paddingClass} py-3 border-t border-gray-100`}>
              <button
                type="button"
                onClick={onLoadMore}
                className="w-full h-10 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium active:scale-[0.99] transition-transform"
              >
                Xem thêm ({visibleCount}/{totalCount})
              </button>
            </div>
          )}
        </>
      ) : (
        <div className={`${paddingClass} py-10 text-center text-gray-400 text-sm`}>
          <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <div className="font-medium text-gray-500 mb-1">
            {needsBranch ? 'Chưa thể đồng bộ danh sách' : 'Chưa có khách phù hợp'}
          </div>
          <div>
            {needsBranch
              ? 'Chọn chi nhánh để tải khách gần đây từ các thiết bị khác'
              : 'Đổi bộ lọc hoặc thao tác thêm để làm đầy Activity Hub'}
          </div>
        </div>
      )}
    </>
  );
}

function PatientFabActionBtn({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  tone: 'emerald' | 'blue' | 'violet' | 'amber' | 'slate' | 'rose';
}) {
  const toneClass: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-100 active:bg-emerald-100',
    blue: 'bg-blue-50 text-blue-800 border-blue-100 active:bg-blue-100',
    violet: 'bg-violet-50 text-violet-800 border-violet-100 active:bg-violet-100',
    amber: 'bg-amber-50 text-amber-900 border-amber-100 active:bg-amber-100',
    slate: 'bg-slate-50 text-slate-800 border-slate-100 active:bg-slate-100',
    rose: 'bg-rose-50 text-rose-800 border-rose-100 active:bg-rose-100',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border px-0.5 py-1.5 min-w-0 text-[9px] font-semibold leading-tight transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed bg-gray-50 text-gray-400 border-gray-100' : toneClass[tone]
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="text-center">{label}</span>
    </button>
  );
}

function PatientRow({
  p,
  isMenuOpen,
  onToggleMenu,
  onMenuAction,
  onCallAction,
  onZaloAction,
  activityLabel,
  activityRelativeTime,
  staffLabel,
}: {
  p: PatientResult;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onMenuAction: (patient: PatientResult, action: PatientMenuAction) => void;
  onCallAction: (patient: PatientResult) => void;
  onZaloAction: (patient: PatientResult) => void;
  activityLabel?: string;
  activityRelativeTime?: string;
  staffLabel?: string;
}) {
  const phoneDigits = digitsOnly(p.dienthoai);
  const canContact = phoneDigits.length >= 8;

  return (
    <li className="bg-white">
      <button
        type="button"
        onClick={onToggleMenu}
        aria-expanded={isMenuOpen}
        className="w-full px-4 py-2.5 flex items-center gap-3 text-left active:bg-gray-50"
      >
        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {(p.ten || '?')[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-gray-800 truncate">{p.ten || '(không tên)'}</span>
            {p.namsinh && <span className="text-xs text-gray-500 shrink-0">• {p.namsinh}</span>}
          </div>
          {(p.dienthoai || p.diachi) && (
            <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 min-w-0">
              {p.dienthoai && (
                <span className="flex items-center gap-1 shrink-0">
                  <Phone className="w-3 h-3" />
                  {p.dienthoai}
                </span>
              )}
              {p.dienthoai && p.diachi && <span className="text-gray-300">•</span>}
              {p.diachi && <span className="truncate">{p.diachi}</span>}
            </div>
          )}
          {(activityLabel || activityRelativeTime || staffLabel) && (
            <div className="mt-1 flex items-center gap-1.5 min-w-0">
              {activityLabel && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 text-[10px] font-semibold truncate">
                  {activityLabel}
                </span>
              )}
              {staffLabel && (
                <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold shrink-0">
                  {staffLabel}
                </span>
              )}
              {activityRelativeTime && (
                <span className="text-[10px] text-gray-400 shrink-0">{activityRelativeTime}</span>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            isMenuOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {isMenuOpen && (
        <div className="px-3 pb-3 grid grid-cols-5 gap-1 border-t border-gray-50 pt-2">
          <PatientFabActionBtn
            label="Kê kính"
            icon={Glasses}
            tone="emerald"
            onClick={() => onMenuAction(p, 'kinh')}
          />
          <PatientFabActionBtn
            label="Kê thuốc"
            icon={FileText}
            tone="blue"
            onClick={() => onMenuAction(p, 'thuoc')}
          />
          <PatientFabActionBtn
            label="Sửa"
            icon={Pencil}
            tone="amber"
            onClick={() => onMenuAction(p, 'sua')}
          />
          <PatientFabActionBtn
            label="Gọi"
            icon={Phone}
            tone="emerald"
            disabled={!canContact}
            onClick={() => onCallAction(p)}
          />
          <PatientFabActionBtn
            label="Zalo"
            icon={MessageCircle}
            tone="blue"
            disabled={!canContact}
            onClick={() => onZaloAction(p)}
          />
        </div>
      )}
    </li>
  );
}

function PageTabBtn({
  item,
  active,
  onClick,
}: {
  item: { key: string; label: string; count?: number; icon?: React.ComponentType<{ className?: string }> } | undefined;
  active: boolean;
  onClick: () => void;
}) {
  if (!item) return <div />;
  const Icon = item.icon;
  const count = item.count;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
        active ? 'text-blue-600' : 'text-gray-500 active:text-blue-600'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {active && <span className="absolute top-0 w-8 h-0.5 rounded-full bg-blue-600" />}
      <div className="relative">
        {Icon ? (
          <Icon className={`w-5 h-5 ${active ? 'stroke-[2.4]' : ''}`} />
        ) : (
          <span className={`text-[15px] font-bold leading-none ${active ? '' : ''}`}>{item.label[0]}</span>
        )}
        {typeof count === 'number' && count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      <span className={`text-[10px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
        {item.label}
      </span>
    </button>
  );
}

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
  sheetId,
}: {
  onClose: () => void;
  children: React.ReactNode;
  fullHeight?: boolean;
  sheetId?: string;
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
        id={sheetId}
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
