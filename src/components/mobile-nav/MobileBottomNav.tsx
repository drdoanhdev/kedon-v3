// Mobile bottom navigation — bar, FAB, sheet điều phối.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Menu, Search, UserPlus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBranch } from '../../contexts/BranchContext';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import { useNotificationPolling } from '../../hooks/useNotificationPolling';
import { usePageTabsContext } from '../../contexts/PageTabsContext';
import { usePatientSearch } from '../../hooks/usePatientSearch';
import { useRecentActivityHub } from '../../hooks/useRecentActivityHub';
import { useKeyboardOpen } from '../../hooks/useKeyboardOpen';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  buildActivityPatientRef,
  pushRecentActivity,
} from '../../lib/recentActivity';
import { scheduleRecentActivitySync } from '../../lib/recentActivitySync';
import { actionFromDefault } from '../../lib/mobileNavActivity';
import { parsePatientSeed } from '../../lib/patientSeed';
import { digitsOnly, openZaloDeepLink, toDialNumber, toZaloNumber } from '../../lib/phone';
import type { BenhNhan } from '../../lib/patient/types';
import type { PatientResult } from '../../lib/patientSearch';
import type { FeatureKey } from '../../lib/featureConfig';
import {
  FAB_LONG_PRESS_MS,
  FAB_SEARCH_INITIAL_VISIBLE,
  FAB_SEARCH_PAGE_SIZE,
  FAB_SEARCH_VISIBLE_STEP,
  HIDDEN_ON_PATHS,
} from './constants';
import { getMoreMenuItems } from './moreItems';
import { MOBILE_NAV_TABS } from './navTabs';
import type { MobileNavSheet, NavTab, PatientMenuAction } from './types';
import { FabQuickAction } from './FabQuickAction';
import { MoreSheet } from './MoreSheet';
import { NavTabItem } from './NavTabItem';
import { PageTabBtn } from './PageTabBtn';
import { PatientSearchSheet } from './PatientSearchSheet';
import { QuickPatientCreateDialog } from './QuickPatientCreateDialog';
import {
  PostCreatePatientActions,
  type PostCreateAction,
} from './PostCreatePatientActions';

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
  const { branches, currentBranchId, currentBranch, switchBranch, isMultiBranch } = useBranch();
  const { canAccessFeature } = useFeatureGate();
  const { pageTabs } = usePageTabsContext();
  const { counts } = useNotificationPolling();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const keyboardOpen = useKeyboardOpen();

  const [sheet, setSheet] = useState<MobileNavSheet>('none');
  const showSearch = sheet === 'search';
  const showMore = sheet === 'more';
  const showFabMenu = sheet === 'fab';

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateSeed, setQuickCreateSeed] = useState('');
  const [postCreateOpen, setPostCreateOpen] = useState(false);
  const [createdPatient, setCreatedPatient] = useState<BenhNhan | null>(null);

  const {
    term: searchTerm,
    setTerm: setSearchTerm,
    results: searchResults,
    status: searchStatus,
    reset: resetPatientSearch,
  } = usePatientSearch(showSearch, FAB_SEARCH_PAGE_SIZE);
  const [searchVisibleCount, setSearchVisibleCount] = useState(FAB_SEARCH_INITIAL_VISIBLE);
  const searchLoading = searchStatus === 'loading';
  const searchFailed = searchStatus === 'error';

  const {
    activityFilter,
    setActivityFilter,
    activitySyncMetaText,
    activitySyncError,
    syncingActivity,
    activityDayGroups,
    canLoadMoreActivities,
    visibleActivityCount,
    totalActivityCount,
    loadMoreActivities,
    recentPatients,
    expandedMenuPatientId,
    togglePatientMenu,
    clearExpandedMenu,
    setExpandedMenuPatientId,
  } = useRecentActivityHub(showSearch);
  const activityHasBranch = Boolean(currentBranchId);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const fabHoldTimerRef = useRef<number | null>(null);
  const fabLongPressTriggeredRef = useRef(false);

  const visibleSearchResults = useMemo(
    () => searchResults.slice(0, searchVisibleCount),
    [searchResults, searchVisibleCount]
  );
  const canLoadMoreSearchResults = searchResults.length > searchVisibleCount;

  const moreItems = useMemo(
    () => getMoreMenuItems(currentRole, userRole),
    [currentRole, userRole]
  );

  const clearFabHoldTimer = useCallback(() => {
    if (fabHoldTimerRef.current !== null) {
      clearTimeout(fabHoldTimerRef.current);
      fabHoldTimerRef.current = null;
    }
  }, []);

  const closeAllSheets = useCallback(() => {
    clearFabHoldTimer();
    fabLongPressTriggeredRef.current = false;
    clearExpandedMenu();
    setSheet('none');
  }, [clearExpandedMenu, clearFabHoldTimer]);

  const toggleSheet = useCallback((next: Exclude<MobileNavSheet, 'none'>) => {
    setSheet((prev) => (prev === next ? 'none' : next));
  }, []);

  const toggleSearchSheet = useCallback(() => toggleSheet('search'), [toggleSheet]);
  const toggleMoreSheet = useCallback(() => toggleSheet('more'), [toggleSheet]);

  const handleSearchTermChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      setSearchVisibleCount(FAB_SEARCH_INITIAL_VISIBLE);
    },
    [setSearchTerm]
  );

  useEffect(() => () => clearFabHoldTimer(), [clearFabHoldTimer]);

  useEffect(() => {
    const handle = () => closeAllSheets();
    router.events.on('routeChangeStart', handle);
    return () => router.events.off('routeChangeStart', handle);
  }, [closeAllSheets, router.events]);

  useEffect(() => {
    if (sheet === 'none') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllSheets();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeAllSheets, sheet]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping) return;
      e.preventDefault();
      toggleSearchSheet();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSearchSheet]);

  useEffect(() => {
    const onOpen = () => setSheet('search');
    window.addEventListener('open-global-patient-search', onOpen as EventListener);
    return () => window.removeEventListener('open-global-patient-search', onOpen as EventListener);
  }, []);

  useEffect(() => {
    const open = sheet !== 'none';
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  useEffect(() => {
    if (!showSearch) {
      resetPatientSearch();
      setSearchVisibleCount(FAB_SEARCH_INITIAL_VISIBLE);
      return;
    }
    const t = setTimeout(() => searchInputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [showSearch, resetPatientSearch]);

  if (!user) return null;
  if (HIDDEN_ON_PATHS.has(router.pathname)) return null;

  const tabs = MOBILE_NAV_TABS;
  const isActive = (tab: NavTab) =>
    tab.match ? tab.match(router.pathname) : router.pathname === tab.href;

  const resolveHref = (href: string, feature?: FeatureKey) => {
    if (feature && !canAccessFeature(feature)) return '/billing';
    return href;
  };

  const userInitial = (user?.email?.[0] || 'U').toUpperCase();
  const userName = user?.email?.split('@')[0] || 'Guest';
  const totalNotif = (counts?.thongBao || 0) + (counts?.tinNhanPlatform || 0);

  const openBranchPicker = () => setSheet('more');

  const triggerMenuAction = (
    p: PatientResult,
    action: PatientMenuAction,
    origin: 'search' | 'activity' = 'activity'
  ) => {
    if (action !== 'sua') {
      pushRecentActivity({
        action: actionFromDefault(action),
        patient: p,
        source: origin === 'search' ? 'fab_search_action' : 'fab_action',
      });
    } else if (origin === 'search') {
      pushRecentActivity({ action: 'search_hit', patient: p, source: 'fab_search' });
    }
    clearExpandedMenu();
    setSheet('none');
    if (action === 'kinh') router.push(`/ke-don-kinh?bn=${p.id}`);
    else if (action === 'thuoc') router.push(`/ke-don?bn=${p.id}`);
    else if (action === 'sua') router.push(`/benh-nhan?focusId=${p.id}&edit=1`);
    else {
      const params = new URLSearchParams();
      const searchSeed = (p.dienthoai || p.ten || '').trim();
      if (searchSeed) params.set('search', searchSeed);
      params.set('focusId', String(p.id));
      router.push(`/benh-nhan?${params.toString()}`);
    }
  };

  const handlePatientZaloAction = (p: PatientResult) => {
    const zaloNumber = toZaloNumber(digitsOnly(p.dienthoai));
    if (!zaloNumber) return;
    clearExpandedMenu();
    openZaloDeepLink(zaloNumber);
  };

  const handlePatientCallAction = (p: PatientResult) => {
    const phoneDigits = digitsOnly(p.dienthoai);
    if (phoneDigits.length < 8) return;
    const dial = toDialNumber(phoneDigits);
    if (!dial) return;
    clearExpandedMenu();
    window.location.href = `tel:${dial}`;
  };

  const handleEnterExpandFirst = () => {
    const list = searchTerm.trim() ? visibleSearchResults : recentPatients;
    if (list.length === 0) return;
    const firstId = list[0].id;
    setExpandedMenuPatientId((prev) => (prev === firstId ? null : firstId));
  };

  const buildBenhNhanNewUrl = (seedText?: string) => {
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
    return `/benh-nhan?${params.toString()}`;
  };

  const handleAddNewPatient = (seedText?: string) => {
    const rawText = (seedText ?? searchTerm).trim();
    setQuickCreateSeed(rawText);
    clearFabHoldTimer();
    fabLongPressTriggeredRef.current = false;
    clearExpandedMenu();
    setSheet('none');
    setQuickCreateOpen(true);
  };

  const handleOpenPatientPage = () => {
    const url = buildBenhNhanNewUrl();
    closeAllSheets();
    router.push(url);
  };

  const handlePatientCreated = (patient: BenhNhan) => {
    setQuickCreateOpen(false);
    setCreatedPatient(patient);
    const ref = buildActivityPatientRef(patient);
    if (ref) {
      pushRecentActivity({
        action: 'search_hit',
        patient: ref,
        source: 'fab_quick_create',
      });
    }
    setPostCreateOpen(true);
  };

  const handlePostCreateAction = (action: PostCreateAction) => {
    const patient = createdPatient;
    const id = Number(patient?.id);
    setPostCreateOpen(false);

    if (!patient || !Number.isFinite(id) || id <= 0) {
      setCreatedPatient(null);
      return;
    }

    const ref = buildActivityPatientRef(patient);

    if (action === 'kinh' || action === 'thuoc') {
      if (ref) {
        pushRecentActivity({
          action: action === 'kinh' ? 'open_rx_glasses' : 'open_rx_drug',
          patient: ref,
          source: 'fab_quick_create',
        });
      }
      setCreatedPatient(null);
      closeAllSheets();
      router.push(action === 'kinh' ? `/ke-don-kinh?bn=${id}` : `/ke-don?bn=${id}`);
      return;
    }

    // stay: keep PAB search open with name/phone seed
    const stayTerm = (patient.dienthoai || patient.ten || '').trim();
    if (stayTerm) {
      setSearchTerm(stayTerm);
      setSearchVisibleCount(FAB_SEARCH_INITIAL_VISIBLE);
    }
    setCreatedPatient(null);
    setSheet('search');
  };

  const defaultDiachi =
    (currentBranch?.dia_chi || currentBranch?.ten_chi_nhanh || '').trim();

  const handleFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    fabLongPressTriggeredRef.current = false;
    clearFabHoldTimer();
    fabHoldTimerRef.current = window.setTimeout(() => {
      fabLongPressTriggeredRef.current = true;
      setSheet('fab');
    }, FAB_LONG_PRESS_MS);
  };

  const handleFabPointerEnd = () => clearFabHoldTimer();

  const handleFabClick = () => {
    if (fabLongPressTriggeredRef.current) {
      fabLongPressTriggeredRef.current = false;
      return;
    }
    if (showFabMenu) {
      setSheet('none');
      return;
    }
    toggleSearchSheet();
  };

  const activityTimelineProps = {
    paddingClass: isDesktop ? 'px-5' : 'px-4',
    activityFilter,
    setActivityFilter,
    activitySyncMetaText,
    activitySyncError: !!activitySyncError,
    syncingActivity,
    onRefresh: () => scheduleRecentActivitySync('manual'),
    activityDayGroups,
    canLoadMoreActivities,
    visibleCount: visibleActivityCount,
    totalCount: totalActivityCount,
    onLoadMore: loadMoreActivities,
    expandedMenuPatientId,
    onToggleMenu: togglePatientMenu,
    onMenuAction: (patient: PatientResult, action: PatientMenuAction) =>
      triggerMenuAction(patient, action, 'activity'),
    onCallAction: handlePatientCallAction,
    onZaloAction: handlePatientZaloAction,
    needsBranch: !activityHasBranch,
    onPickBranch: openBranchPicker,
    currentUserId: user?.id || null,
  };

  const fabAriaControls =
    showFabMenu ? 'mbn-fab-menu' : showSearch && !isDesktop ? 'mbn-search-sheet' : undefined;

  return (
    <>
      <PatientSearchSheet
        open={showSearch}
        isDesktop={isDesktop}
        onClose={closeAllSheets}
        panelProps={{
          searchTerm,
          onSearchTermChange: handleSearchTermChange,
          searchInputRef,
          searchLoading,
          searchFailed,
          searchResults,
          visibleSearchResults,
          canLoadMoreSearchResults,
          onLoadMoreSearch: () => setSearchVisibleCount((prev) => prev + FAB_SEARCH_VISIBLE_STEP),
          onAddNewPatient: () => handleAddNewPatient(),
          onOpenPatientPage: handleOpenPatientPage,
          onEnterExpandFirst: handleEnterExpandFirst,
          expandedMenuPatientId,
          onTogglePatientMenu: togglePatientMenu,
          onMenuActionSearch: (patient, action) => triggerMenuAction(patient, action, 'search'),
          onCallAction: handlePatientCallAction,
          onZaloAction: handlePatientZaloAction,
          activityTimeline: activityTimelineProps,
        }}
      />

      <div aria-hidden className="md:hidden h-[calc(60px+env(safe-area-inset-bottom))]" />

      {showFabMenu && (
        <button
          type="button"
          aria-label="Đóng menu nhanh FAB"
          onClick={() => setSheet('none')}
          className="md:hidden fixed inset-0 z-[49] bg-black/10 backdrop-blur-[1px]"
        />
      )}

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
              <NavTabItem key={tab.href} tab={tab} active={isActive(tab)} resolveHref={resolveHref} />
            ))
          )}
          {pageTabs && (
            <PageTabBtn
              item={pageTabs.items[1]}
              active={pageTabs.activeIdx === 1}
              onClick={() => pageTabs.onChange(1)}
            />
          )}

          <div className="relative flex items-center justify-center">
            {showFabMenu && (
              <div
                id="mbn-fab-menu"
                className="absolute -top-[132px] z-20 w-44 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-xl p-1.5"
              >
                <FabQuickAction label="Tìm khách" icon={Search} onClick={() => setSheet('search')} />
                <FabQuickAction label="Thêm khách" icon={UserPlus} onClick={() => handleAddNewPatient()} />
                <FabQuickAction label="Mở menu" icon={Menu} onClick={() => setSheet('more')} />
              </div>
            )}

            <button
              type="button"
              onClick={handleFabClick}
              onPointerDown={handleFabPointerDown}
              onPointerUp={handleFabPointerEnd}
              onPointerCancel={handleFabPointerEnd}
              onPointerLeave={handleFabPointerEnd}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={
                showFabMenu ? 'Đóng menu nhanh FAB' : showSearch ? 'Đóng tìm khách hàng' : 'Tìm khách hàng'
              }
              aria-expanded={showSearch || showFabMenu}
              aria-controls={fabAriaControls}
              className={`w-14 h-14 rounded-full text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center ring-4 ring-white touch-none select-none [-webkit-touch-callout:none] ${
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
              <NavTabItem key={tab.href} tab={tab} active={isActive(tab)} resolveHref={resolveHref} />
            ))
          )}

          <button
            type="button"
            onClick={toggleMoreSheet}
            aria-expanded={showMore}
            aria-controls={showMore ? 'mbn-more-sheet' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
              showMore ? 'text-blue-600 bg-blue-50' : 'text-gray-500 active:text-blue-600 active:bg-gray-50'
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

      <MoreSheet
        open={showMore}
        onClose={closeAllSheets}
        userInitial={userInitial}
        userName={userName}
        userEmail={user?.email}
        counts={{
          thongBao: counts?.thongBao || 0,
          tinNhanPlatform: counts?.tinNhanPlatform || 0,
          nhacViec: counts?.nhacViec || 0,
        }}
        tenants={tenants}
        currentTenantId={currentTenantId}
        currentTenantName={currentTenant?.name}
        switchTenant={switchTenant}
        isMultiBranch={isMultiBranch}
        branches={branches}
        currentBranchId={currentBranchId}
        currentRole={currentRole}
        switchBranch={switchBranch}
        moreItems={moreItems}
        canAccessFeature={canAccessFeature}
        onSignOut={signOut}
      />

      <QuickPatientCreateDialog
        open={quickCreateOpen}
        seedText={quickCreateSeed}
        defaultDiachi={defaultDiachi}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={handlePatientCreated}
      />

      <PostCreatePatientActions
        open={postCreateOpen}
        patient={createdPatient}
        onAction={handlePostCreateAction}
        onClose={() => {
          setPostCreateOpen(false);
          setCreatedPatient(null);
        }}
      />
    </>
  );
}
