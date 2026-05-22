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
  ChevronRight,
  Phone,
  Loader2,
  Lock,
  History,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { useNotificationPolling } from '../hooks/useNotificationPolling';
import { usePageTabsContext } from '../contexts/PageTabsContext';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import {
  clearActivitySyncBackoffState,
  getActivityLastSyncAt,
  getActivitySyncBackoffState,
  getMaxServerUpdatedAt,
  getPendingActivityCount,
  getPendingActivityPayload,
  getRecentPatientsFromActivities,
  loadRecentActivities,
  markActivitiesSynced,
  mergeRecentActivityFromServer,
  pushRecentActivity,
  setActivityLastSyncAt,
  setActivitySyncBackoffState,
  subscribeRecentActivityUpdates,
  type RecentActivityAction,
  type RecentActivityEvent,
  type RecentActivityServerRow,
} from '../lib/recentActivity';
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
type ActivityFilter = 'all' | 'search' | 'history' | 'prescription' | 'dang_do';

const LAST_ACTION_KEY = 'mbn:last_action';
const CONTACT_SWIPE_HINT_KEY = 'mbn:contact_swipe_hint_seen';
const FAB_SEARCH_PAGE_SIZE = 80;
const FAB_SEARCH_INITIAL_VISIBLE = 30;
const FAB_SEARCH_VISIBLE_STEP = 30;

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
    case 'add_waiting':
      return 'Đưa vào chờ khám';
    case 'open_profile':
    default:
      return 'Mở hồ sơ';
  }
}

function formatRelativeActivityTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

function actionCategory(action: RecentActivityAction): ActivityFilter {
  if (action === 'search_hit') return 'search';
  if (action === 'open_rx_drug' || action === 'open_rx_glasses') return 'prescription';
  return 'history';
}

function isDangDoAction(action: RecentActivityAction): boolean {
  return action === 'search_hit' || action === 'quick_history_open' || action === 'open_profile' || action === 'add_waiting';
}

function loadLastAction(): DefaultAction {
  if (typeof window === 'undefined') return 'kinh';
  try {
    const v = localStorage.getItem(LAST_ACTION_KEY);
    if (v === 'kinh' || v === 'thuoc' || v === 'hoso') return v;
  } catch {
    /* ignore */
  }
  return 'kinh';
}

function saveLastAction(a: DefaultAction) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_ACTION_KEY, a);
  } catch {
    /* ignore */
  }
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

function hasSeenContactSwipeHint(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(CONTACT_SWIPE_HINT_KEY) === '1';
  } catch {
    return true;
  }
}

function markContactSwipeHintSeen() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONTACT_SWIPE_HINT_KEY, '1');
  } catch {
    /* ignore */
  }
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
  const [syncingActivity, setSyncingActivity] = useState(false);
  const [activityLastSyncAt, setActivityLastSyncAtState] = useState<number | null>(null);
  const [activitySyncError, setActivitySyncError] = useState<string>('');
  const [showContactSwipeHint, setShowContactSwipeHint] = useState(false);
  const [openContactSwipeId, setOpenContactSwipeId] = useState<number | null>(null);
  const [defaultAction, setDefaultAction] = useState<DefaultAction>('kinh');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const fabHoldTimerRef = useRef<number | null>(null);
  const fabLongPressTriggeredRef = useRef(false);
  const syncingActivityRef = useRef(false);

  const recentPatients = useMemo(
    () => getRecentPatientsFromActivities(recentActivities, 8) as PatientResult[],
    [recentActivities]
  );

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return recentActivities;
    if (activityFilter === 'dang_do') {
      return recentActivities.filter((activity) => isDangDoAction(activity.action));
    }
    return recentActivities.filter((activity) => actionCategory(activity.action) === activityFilter);
  }, [activityFilter, recentActivities]);

  const filteredPatients = useMemo(
    () => getRecentPatientsFromActivities(filteredActivities, 8) as PatientResult[],
    [filteredActivities]
  );

  const pendingSyncCount = useMemo(
    () => recentActivities.reduce((count, item) => count + (item.pendingSync ? 1 : 0), 0),
    [recentActivities]
  );

  const visibleSearchResults = useMemo(
    () => searchResults.slice(0, searchVisibleCount),
    [searchResults, searchVisibleCount]
  );

  const canLoadMoreSearchResults = useMemo(
    () => searchResults.length > searchVisibleCount,
    [searchResults.length, searchVisibleCount]
  );

  const shouldShowSearchContactHint = useMemo(
    () => visibleSearchResults.some((item) => digitsOnly(item.dienthoai).length >= 8),
    [visibleSearchResults]
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

  const latestActivityByPatientId = useMemo(() => {
    const map = new Map<number, RecentActivityEvent>();
    for (const activity of recentActivities) {
      if (!map.has(activity.patient.id)) map.set(activity.patient.id, activity);
    }
    return map;
  }, [recentActivities]);

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
    setOpenContactSwipeId(null);
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
      setActivityLastSyncAtState(getActivityLastSyncAt());
      setActivitySyncError('');
      setActivityFilter('all');
      setDefaultAction(loadLastAction());
      setShowContactSwipeHint(!hasSeenContactSwipeHint());
      const t = setTimeout(() => {
        if (window.matchMedia('(min-width: 768px)').matches) {
          desktopSearchInputRef.current?.focus();
        } else {
          searchInputRef.current?.focus();
        }
      }, 120);
      return () => clearTimeout(t);
    } else {
      setShowContactSwipeHint(false);
      setOpenContactSwipeId(null);
      setSearchTerm('');
      setSearchResults([]);
      setSearchVisibleCount(FAB_SEARCH_INITIAL_VISIBLE);
      setActivityFilter('all');
    }
  }, [showSearch]);

  useEffect(() => {
    setSearchVisibleCount(FAB_SEARCH_INITIAL_VISIBLE);
  }, [searchTerm]);

  useEffect(() => {
    return subscribeRecentActivityUpdates((events) => {
      setRecentActivities(events);
      setActivityLastSyncAtState(getActivityLastSyncAt());
    });
  }, []);

  const syncActivityWithServer = useCallback(async () => {
    if (syncingActivityRef.current) return;

    const backoffState = getActivitySyncBackoffState();
    if (backoffState && backoffState.nextRetryAt > Date.now()) {
      const remainSec = Math.max(1, Math.ceil((backoffState.nextRetryAt - Date.now()) / 1000));
      setActivitySyncError(`Tạm hoãn đồng bộ ${remainSec}s`);
      return;
    }

    syncingActivityRef.current = true;
    setSyncingActivity(true);
    setActivitySyncError('');

    const scheduleBackoff = (reason: 'rate_limit' | 'network' | 'server', retryAfterSec?: number) => {
      const current = getActivitySyncBackoffState();
      const nextAttempt = current && current.reason === reason ? current.attempt + 1 : 1;

      let waitMs = 0;
      if (reason === 'rate_limit' && retryAfterSec && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
        waitMs = Math.min(retryAfterSec * 1000, 120_000);
      } else if (reason === 'network') {
        waitMs = Math.min(5_000 * Math.pow(2, nextAttempt - 1), 120_000);
      } else {
        waitMs = Math.min(3_000 * Math.pow(2, nextAttempt - 1), 60_000);
      }

      const nextRetryAt = Date.now() + waitMs;
      setActivitySyncBackoffState({ reason, attempt: nextAttempt, nextRetryAt });
      const remainSec = Math.max(1, Math.ceil(waitMs / 1000));
      setActivitySyncError(`Tạm hoãn đồng bộ ${remainSec}s`);
    };

    try {
      const lastSyncAt = getActivityLastSyncAt();
      const sinceQuery = lastSyncAt ? `&since=${lastSyncAt}` : '';
      const pullRes = await fetchWithAuth(`/api/recent-activity?limit=120${sinceQuery}`);
      if (pullRes.ok) {
        const payload = await pullRes.json();
        const rows = Array.isArray(payload?.data) ? payload.data as RecentActivityServerRow[] : [];
        const merged = mergeRecentActivityFromServer(rows);
        setRecentActivities(merged);

        const maxPullSyncTs = getMaxServerUpdatedAt(rows);
        if (maxPullSyncTs) {
          setActivityLastSyncAt(maxPullSyncTs);
          setActivityLastSyncAtState(maxPullSyncTs);
        }
      } else if (pullRes.status === 429) {
        const retryAfter = Number(pullRes.headers.get('Retry-After') || '');
        scheduleBackoff('rate_limit', Number.isFinite(retryAfter) ? retryAfter : undefined);
        return;
      } else {
        scheduleBackoff('server');
        return;
      }

      const pending = getPendingActivityPayload(40);
      if (pending.length > 0) {
        const pushRes = await fetchWithAuth('/api/recent-activity', {
          method: 'POST',
          body: JSON.stringify({ events: pending }),
        });

        if (pushRes.ok) {
          const pushPayload = await pushRes.json();
          const savedRows = Array.isArray(pushPayload?.data)
            ? pushPayload.data as RecentActivityServerRow[]
            : [];
          const syncedIds = savedRows.map((row) => row.client_event_id).filter(Boolean);
          const afterMark = markActivitiesSynced(syncedIds, Date.now());
          const merged = mergeRecentActivityFromServer(savedRows);
          setRecentActivities(merged.length > 0 ? merged : afterMark);

          const maxPushSyncTs = getMaxServerUpdatedAt(savedRows);
          if (maxPushSyncTs) {
            setActivityLastSyncAt(maxPushSyncTs);
            setActivityLastSyncAtState(maxPushSyncTs);
          }
        } else if (pushRes.status === 429) {
          const retryAfter = Number(pushRes.headers.get('Retry-After') || '');
          scheduleBackoff('rate_limit', Number.isFinite(retryAfter) ? retryAfter : undefined);
          return;
        } else {
          scheduleBackoff('server');
          return;
        }
      }

      clearActivitySyncBackoffState();
      setActivityLastSyncAtState(getActivityLastSyncAt());
    } catch {
      // ignore sync failures; local timeline still works offline.
      scheduleBackoff('network');
    } finally {
      syncingActivityRef.current = false;
      setSyncingActivity(false);
    }
  }, []);

  useEffect(() => {
    if (!showSearch) return;

    setActivityLastSyncAtState(getActivityLastSyncAt());
    const backoff = getActivitySyncBackoffState();
    if (backoff && backoff.nextRetryAt > Date.now()) {
      const remainSec = Math.max(1, Math.ceil((backoff.nextRetryAt - Date.now()) / 1000));
      setActivitySyncError(`Tạm hoãn đồng bộ ${remainSec}s`);
    }
    if (getPendingActivityCount() > 0) {
      if (!(backoff && backoff.nextRetryAt > Date.now())) {
        setActivitySyncError('');
      }
    }

    syncActivityWithServer();
    const interval = window.setInterval(syncActivityWithServer, 45000);
    return () => window.clearInterval(interval);
  }, [showSearch, syncActivityWithServer]);

  // Debounced search
  useEffect(() => {
    if (!showSearch) return;
    const term = searchTerm.trim();
    if (!term) {
      setOpenContactSwipeId(null);
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
        match: (p) => p.startsWith('/lich-hen') || p.startsWith('/cho-kham'),
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
      { href: '/quan-ly-kho', label: 'Kho kính', icon: Warehouse, feature: 'inventory_lens' },
      { href: '/quan-ly-kho-thuoc', label: 'Kho thuốc', icon: Pill, feature: 'inventory_drug' },
      { href: '/danh-muc', label: 'Danh mục', icon: List, feature: 'categories' },
      { href: '/bao-cao', label: 'Báo cáo', icon: BarChart, feature: 'basic_reports' },
      { href: '/bao-cao-super', label: 'Báo cáo Pro', icon: BarChart, feature: 'advanced_reports' },
      { href: '/bao-cao-chuoi', label: 'Báo cáo chuỗi', icon: BarChart3, feature: 'chain_reports' },
      { href: '/cham-soc-khach-hang', label: 'Chăm sóc KH', icon: Users, feature: 'crm' },
      { href: '/quan-ly-ghi-chu-khach-hang', label: 'Việc cần làm KH', icon: CalendarDays, feature: 'crm' },
      { href: '/nhac-viec', label: 'Nhắc việc nội bộ', icon: CheckSquare },
      { href: '/dieu-chuyen-kho', label: 'Điều chuyển kho', icon: ArrowRightLeft, feature: 'branch_transfer' },
      { href: '/tra-cuu-khach-hang', label: 'Tra cứu KH', icon: Search, feature: 'multi_branch' },
      { href: '/cau-hinh-in', label: 'Cấu hình in', icon: Printer },
      { href: '/tem-kinh', label: 'In tem kính', icon: Printer, feature: 'print_config' },
      { href: '/cai-dat-nhan-tin', label: 'Nhắn tin tự động', icon: Send, visible: isOwnerAdmin },
      { href: '/quan-ly-phong-kham', label: 'Phòng khám', icon: Settings, visible: isOwnerAdmin },
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
    (counts?.thongBao || 0) + (counts?.tinNhan || 0) + (counts?.tinNhanPlatform || 0);

  const triggerAction = (p: PatientResult, action: DefaultAction, origin: 'search' | 'activity' = 'activity') => {
    if (origin === 'search') {
      pushRecentActivity({ action: 'search_hit', patient: p, source: 'fab_search' });
    }
    pushRecentActivity({ action: actionFromDefault(action), patient: p, source: 'fab_action' });
    saveLastAction(action);
    setDefaultAction(action);
    setOpenContactSwipeId(null);
    setShowFabMenu(false);
    setShowSearch(false);
    if (action === 'kinh') router.push(`/ke-don-kinh?bn=${p.id}`);
    else if (action === 'thuoc') router.push(`/ke-don?bn=${p.id}`);
    else {
      const params = new URLSearchParams();
      const searchSeed = (p.dienthoai || p.ten || '').trim();
      if (searchSeed) params.set('search', searchSeed);
      params.set('focusId', String(p.id));
      router.push(`/benh-nhan?${params.toString()}`);
    }
  };

  const dismissContactSwipeHint = () => {
    markContactSwipeHintSeen();
    setShowContactSwipeHint(false);
  };

  const handlePatientZaloAction = async (p: PatientResult) => {
    const zaloNumber = toZaloNumber(digitsOnly(p.dienthoai));
    if (!zaloNumber) return;

    setOpenContactSwipeId(null);
    dismissContactSwipeHint();

    // Mở thẳng chat nhanh để thao tác 1 chạm từ FAB.
    openZaloDeepLink(zaloNumber);
  };

  const handleEnterDefault = () => {
    const list = searchTerm.trim() ? searchResults : filteredPatients;
    if (list.length === 0) return;
    triggerAction(list[0], defaultAction, searchTerm.trim() ? 'search' : 'activity');
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

  const shouldShowSwipeHint =
    showContactSwipeHint &&
    !searching &&
    (searchTerm.trim() ? searchResults.length > 0 : filteredPatients.length > 0);

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
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleEnterDefault();
                      }
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

              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-gray-400 font-medium">Mặc định:</span>
                <div className="flex gap-1 flex-1">
                  <DefaultActionPill
                    active={defaultAction === 'kinh'}
                    icon={Glasses}
                    label="Kê kính"
                    onClick={() => {
                      setDefaultAction('kinh');
                      saveLastAction('kinh');
                    }}
                  />
                  <DefaultActionPill
                    active={defaultAction === 'thuoc'}
                    icon={FileText}
                    label="Kê thuốc"
                    onClick={() => {
                      setDefaultAction('thuoc');
                      saveLastAction('thuoc');
                    }}
                  />
                  <DefaultActionPill
                    active={defaultAction === 'hoso'}
                    icon={Users}
                    label="Hồ sơ"
                    onClick={() => {
                      setDefaultAction('hoso');
                      saveLastAction('hoso');
                    }}
                  />
                </div>
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
                <>
                  <div className="px-5 pt-3 pb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-400">
                      <History className="w-3 h-3" />
                      Hoạt động gần đây
                    </div>
                    <span className={`text-[10px] ${activitySyncError ? 'text-amber-600' : 'text-blue-500'}`}>
                      {activitySyncMetaText}
                    </span>
                  </div>

                  <div className="px-5 pb-2 flex items-center gap-1.5 overflow-x-auto">
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

                  {filteredPatients.length > 0 ? (
                    <>
                      <ul className="divide-y divide-gray-100">
                        {filteredPatients.map((p) => {
                          const latestActivity = latestActivityByPatientId.get(p.id);
                          return (
                          <PatientRow
                            key={`rd-${p.id}`}
                            p={p}
                            defaultAction={defaultAction}
                            onAction={triggerAction}
                            isContactSwipeOpen={openContactSwipeId === p.id}
                            setOpenContactSwipeId={setOpenContactSwipeId}
                            onZaloAction={handlePatientZaloAction}
                            onSwipeHintSeen={dismissContactSwipeHint}
                            activityLabel={latestActivity ? actionLabel(latestActivity.action) : undefined}
                            activityRelativeTime={latestActivity ? formatRelativeActivityTime(latestActivity.timestamp) : undefined}
                          />
                        )})}
                      </ul>
                    </>
                  ) : (
                    <div className="px-5 py-10 text-center text-gray-400 text-sm">
                      <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <div className="font-medium text-gray-500 mb-1">Chưa có hoạt động phù hợp</div>
                      <div>Đổi bộ lọc hoặc thao tác thêm để làm đầy Activity Hub</div>
                    </div>
                  )}
                </>
              )}

              {!searching && searchResults.length > 0 && (
                <>
                  <ul className="divide-y divide-gray-100">
                    {visibleSearchResults.map((p) => (
                      <PatientRow
                        key={`sd-${p.id}`}
                        p={p}
                        defaultAction={defaultAction}
                        onAction={(patient, action) => triggerAction(patient, action, 'search')}
                        isContactSwipeOpen={openContactSwipeId === p.id}
                        setOpenContactSwipeId={setOpenContactSwipeId}
                        onZaloAction={handlePatientZaloAction}
                        onSwipeHintSeen={dismissContactSwipeHint}
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
                  {shouldShowSearchContactHint && (
                    <div className="px-5 pb-3">
                      <div className="rounded-xl border border-blue-100 bg-blue-50 text-blue-900 px-3 py-2.5 flex items-start gap-2">
                        <MessageCircle className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
                        <div className="flex-1 text-xs leading-relaxed">
                          Vuốt sang trái để gọi hoặc nhắn Zalo với khách hàng có số điện thoại.
                        </div>
                      </div>
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
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleEnterDefault();
                      }
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

              {/* Default action selector — quyết định hành động khi bấm Enter / chạm vào dòng */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-gray-400 font-medium">Mặc định:</span>
                <div className="flex gap-1 flex-1">
                  <DefaultActionPill
                    active={defaultAction === 'kinh'}
                    icon={Glasses}
                    label="Kê kính"
                    onClick={() => {
                      setDefaultAction('kinh');
                      saveLastAction('kinh');
                    }}
                  />
                  <DefaultActionPill
                    active={defaultAction === 'thuoc'}
                    icon={FileText}
                    label="Kê thuốc"
                    onClick={() => {
                      setDefaultAction('thuoc');
                      saveLastAction('thuoc');
                    }}
                  />
                  <DefaultActionPill
                    active={defaultAction === 'hoso'}
                    icon={Users}
                    label="Hồ sơ"
                    onClick={() => {
                      setDefaultAction('hoso');
                      saveLastAction('hoso');
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Results / Recent */}
            <div className="flex-1 overflow-y-auto">
              {shouldShowSwipeHint && (
                <div className="px-4 pt-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 text-blue-900 px-3 py-2.5 flex items-start gap-2">
                    <MessageCircle className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
                    <div className="flex-1 text-xs leading-relaxed">
                      Vuốt sang trái trên mỗi khách để hiện nút Gọi và Zalo.
                    </div>
                    <button
                      type="button"
                      onClick={dismissContactSwipeHint}
                      className="text-blue-500 hover:text-blue-700"
                      aria-label="Ẩn hướng dẫn vuốt"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

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

              {/* Empty state — show RECENT patients */}
              {!searching && !searchTerm.trim() && (
                <>
                  <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-400">
                      <History className="w-3 h-3" />
                      Hoạt động gần đây
                    </div>
                    <span className={`text-[10px] ${activitySyncError ? 'text-amber-600' : 'text-blue-500'}`}>
                      {activitySyncMetaText}
                    </span>
                  </div>

                  <div className="px-4 pb-2 flex items-center gap-1.5 overflow-x-auto">
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

                  {filteredPatients.length > 0 ? (
                    <>
                      <ul className="divide-y divide-gray-100">
                        {filteredPatients.map((p) => {
                          const latestActivity = latestActivityByPatientId.get(p.id);
                          return (
                          <PatientRow
                            key={`r-${p.id}`}
                            p={p}
                            defaultAction={defaultAction}
                            onAction={triggerAction}
                            isContactSwipeOpen={openContactSwipeId === p.id}
                            setOpenContactSwipeId={setOpenContactSwipeId}
                            onZaloAction={handlePatientZaloAction}
                            onSwipeHintSeen={dismissContactSwipeHint}
                            activityLabel={latestActivity ? actionLabel(latestActivity.action) : undefined}
                            activityRelativeTime={latestActivity ? formatRelativeActivityTime(latestActivity.timestamp) : undefined}
                          />
                        )})}
                      </ul>
                    </>
                  ) : (
                    <div className="px-4 py-10 text-center text-gray-400 text-sm">
                      <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <div className="font-medium text-gray-500 mb-1">Chưa có hoạt động phù hợp</div>
                      <div>Đổi bộ lọc hoặc thao tác thêm để làm đầy Activity Hub</div>
                    </div>
                  )}
                </>
              )}

              {!searching && searchResults.length > 0 && (
                <>
                  <ul className="divide-y divide-gray-100">
                    {visibleSearchResults.map((p) => (
                      <PatientRow
                        key={p.id}
                        p={p}
                        defaultAction={defaultAction}
                        onAction={(patient, action) => triggerAction(patient, action, 'search')}
                        isContactSwipeOpen={openContactSwipeId === p.id}
                        setOpenContactSwipeId={setOpenContactSwipeId}
                        onZaloAction={handlePatientZaloAction}
                        onSwipeHintSeen={dismissContactSwipeHint}
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
                  {shouldShowSearchContactHint && (
                    <div className="px-4 pb-3">
                      <div className="rounded-xl border border-blue-100 bg-blue-50 text-blue-900 px-3 py-2.5 flex items-start gap-2">
                        <MessageCircle className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
                        <div className="flex-1 text-xs leading-relaxed">
                          Vuốt sang trái để gọi hoặc nhắn Zalo với khách hàng có số điện thoại.
                        </div>
                      </div>
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

function DefaultActionPill({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-gray-100 text-gray-600 active:bg-gray-200'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
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

function PatientRow({
  p,
  defaultAction,
  onAction,
  isContactSwipeOpen,
  setOpenContactSwipeId,
  onZaloAction,
  onSwipeHintSeen,
  activityLabel,
  activityRelativeTime,
}: {
  p: PatientResult;
  defaultAction: DefaultAction;
  onAction: (p: PatientResult, action: DefaultAction) => void;
  isContactSwipeOpen: boolean;
  setOpenContactSwipeId: (id: number | null) => void;
  onZaloAction: (p: PatientResult) => void;
  onSwipeHintSeen?: () => void;
  activityLabel?: string;
  activityRelativeTime?: string;
}) {
  const SWIPE_ACTION_WIDTH_PX = 132;
  const [dragging, setDragging] = useState(false);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const touchStartXRef = useRef(0);
  const touchCurrentXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchCurrentYRef = useRef(0);
  const swipingRef = useRef(false);
  const swipeAxisLockRef = useRef<'h' | 'v' | null>(null);
  const swipeBaseOffsetRef = useRef(0);
  const phoneDigits = digitsOnly(p.dienthoai);
  const canContact = phoneDigits.length >= 8;

  const handleSwipeStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canContact) return;
    if (!isContactSwipeOpen) {
      setOpenContactSwipeId(null);
    }

    const touch = e.touches[0];
    if (!touch) return;

    swipingRef.current = true;
    swipeAxisLockRef.current = null;
    touchStartXRef.current = touch.clientX;
    touchCurrentXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchCurrentYRef.current = touch.clientY;
    swipeBaseOffsetRef.current = isContactSwipeOpen ? -SWIPE_ACTION_WIDTH_PX : 0;
    setDragging(true);
    setDragOffsetPx(swipeBaseOffsetRef.current);
  };

  const handleSwipeMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!swipingRef.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    touchCurrentXRef.current = touch.clientX;
    touchCurrentYRef.current = touch.clientY;

    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    const deltaY = touchCurrentYRef.current - touchStartYRef.current;

    if (swipeAxisLockRef.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      swipeAxisLockRef.current = Math.abs(deltaX) > Math.abs(deltaY) * 1.2 ? 'h' : 'v';
    }

    if (swipeAxisLockRef.current !== 'h') return;

    e.preventDefault();
    const rawOffset = swipeBaseOffsetRef.current + deltaX;
    const clampedOffset = Math.max(-SWIPE_ACTION_WIDTH_PX, Math.min(0, rawOffset));
    setDragOffsetPx(clampedOffset);
  };

  const handleSwipeEnd = () => {
    if (!swipingRef.current) return;

    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    const rawOffset = swipeBaseOffsetRef.current + deltaX;
    const clampedOffset = Math.max(-SWIPE_ACTION_WIDTH_PX, Math.min(0, rawOffset));
    const shouldStayOpen =
      swipeAxisLockRef.current === 'h'
        ? clampedOffset <= -SWIPE_ACTION_WIDTH_PX * 0.35
        : isContactSwipeOpen;

    if (shouldStayOpen) onSwipeHintSeen?.();
    setOpenContactSwipeId(shouldStayOpen ? p.id : null);
    setDragging(false);
    setDragOffsetPx(0);
    swipingRef.current = false;
    swipeAxisLockRef.current = null;
  };

  const handleCall = () => {
    if (!canContact) return;
    const dial = toDialNumber(phoneDigits);
    if (!dial) return;

    onSwipeHintSeen?.();
    setOpenContactSwipeId(null);
    window.location.href = `tel:${dial}`;
  };

  const handleOpenZalo = () => {
    if (!canContact) return;
    onSwipeHintSeen?.();
    setOpenContactSwipeId(null);
    onZaloAction(p);
  };

  const cardTranslateX = dragging ? dragOffsetPx : (isContactSwipeOpen ? -SWIPE_ACTION_WIDTH_PX : 0);
  return (
    <li>
      <div className="relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-[132px] grid grid-cols-2">
          <button
            type="button"
            onClick={handleCall}
            disabled={!canContact}
            className={`h-full flex flex-col items-center justify-center gap-1 text-[10px] font-semibold leading-tight transition-colors ${
              canContact
                ? 'bg-emerald-600 text-white active:bg-emerald-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            aria-label={canContact ? `Gọi ${p.ten || 'khách hàng'}` : 'Không có số điện thoại để gọi'}
          >
            <Phone className="w-3.5 h-3.5" />
            Gọi
          </button>
          <button
            type="button"
            onClick={handleOpenZalo}
            disabled={!canContact}
            className={`h-full flex flex-col items-center justify-center gap-1 text-[10px] font-semibold leading-tight transition-colors ${
              canContact
                ? 'bg-blue-600 text-white active:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            aria-label={canContact ? `Nhắn Zalo cho ${p.ten || 'khách hàng'}` : 'Không có số điện thoại để nhắn Zalo'}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Zalo
          </button>
        </div>

        <div
          className={`relative px-4 py-2.5 touch-pan-y ${dragging ? '' : 'transition-transform duration-200 ease-out'} bg-white`}
          style={{
            transform: `translateX(${cardTranslateX}px)`,
            willChange: 'transform',
          }}
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          onTouchCancel={handleSwipeEnd}
        >
        {/* Top: avatar + info + main action */}
        <button
          type="button"
          onClick={() => {
            setOpenContactSwipeId(null);
            onAction(p, defaultAction);
          }}
          className="w-full flex items-center gap-3 text-left active:opacity-70"
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
            {(activityLabel || activityRelativeTime) && (
              <div className="mt-1 flex items-center gap-1.5 min-w-0">
                {activityLabel && (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 text-[10px] font-semibold truncate">
                    {activityLabel}
                  </span>
                )}
                {activityRelativeTime && (
                  <span className="text-[10px] text-gray-400 shrink-0">{activityRelativeTime}</span>
                )}
              </div>
            )}
          </div>
          <ChevronRightIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
        </button>
      </div>
      </div>
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
