import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { useAuth } from '../contexts/AuthContext';

interface UnreadCounts {
  thongBao: number;
  tinNhanPlatform: number;
  nhacViec: number;
  /** Bell badge = thongBao + tinNhanPlatform */
  total: number;
}

interface PollSnapshot {
  counts: UnreadCounts;
  loading: boolean;
}

const EMPTY_COUNTS: UnreadCounts = {
  thongBao: 0,
  tinNhanPlatform: 0,
  nhacViec: 0,
  total: 0,
};

const OPEN_TASK_STATUSES = new Set(['chua_lam', 'dang_lam']);

const POLL_INTERVAL_FOCUS = 60_000;
const POLL_INTERVAL_BLUR = 300_000;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const MIN_FETCH_GAP_MS = 8_000;

let snapshot: PollSnapshot = { counts: EMPTY_COUNTS, loading: false };
const listeners = new Set<(value: PollSnapshot) => void>();

let subscriberCount = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let isFocused = true;
let lastActivityAt = Date.now();
let activeUserId: string | null = null;
let activeTenantId: string | null = null;
let inFlightRequest: Promise<void> | null = null;
let lastFetchAt = 0;

let isVisibilityBound = false;
let isActivityBound = false;
let isOnlineBound = false;

function emitSnapshot() {
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function countsEqual(a: UnreadCounts, b: UnreadCounts) {
  return (
    a.thongBao === b.thongBao
    && a.tinNhanPlatform === b.tinNhanPlatform
    && a.nhacViec === b.nhacViec
    && a.total === b.total
  );
}

function updateLoading(loading: boolean) {
  if (snapshot.loading === loading) return;
  snapshot = { ...snapshot, loading };
  emitSnapshot();
}

function updateCounts(counts: UnreadCounts) {
  if (countsEqual(snapshot.counts, counts)) return;
  snapshot = { ...snapshot, counts };
  emitSnapshot();
}

function clearPollTimer() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function canPoll() {
  return subscriberCount > 0 && !!activeUserId && !!activeTenantId;
}

function getPollInterval() {
  return isFocused ? POLL_INTERVAL_FOCUS : POLL_INTERVAL_BLUR;
}

async function fetchCounts(force = false) {
  if (!activeUserId || !activeTenantId) {
    updateCounts(EMPTY_COUNTS);
    return;
  }

  const now = Date.now();
  if (!force && now - lastFetchAt < MIN_FETCH_GAP_MS) {
    return;
  }

  if (inFlightRequest) {
    return inFlightRequest;
  }

  inFlightRequest = (async () => {
    try {
      updateLoading(true);
      const [tbRes, tpRes, nvRes] = await Promise.all([
        fetchWithAuth('/api/thong-bao?unread_only=true&limit=1'),
        fetchWithAuth('/api/tin-nhan-platform?limit=1'),
        fetchWithAuth('/api/nhac-viec?assigned_to_me=true'),
      ]);

      let thongBao = 0;
      let tinNhanPlatform = 0;
      let nhacViec = 0;

      if (tbRes.ok) {
        const tbData = await tbRes.json();
        thongBao = tbData.unreadCount || 0;
      }
      if (tpRes.ok) {
        const tpData = await tpRes.json();
        tinNhanPlatform = tpData.unreadCount || 0;
      }
      if (nvRes.ok) {
        const nvData = await nvRes.json();
        const list = Array.isArray(nvData.data) ? nvData.data : [];
        nhacViec = list.filter((t: { trang_thai?: string }) => OPEN_TASK_STATUSES.has(String(t.trang_thai))).length;
      }

      updateCounts({
        thongBao,
        tinNhanPlatform,
        nhacViec,
        total: thongBao + tinNhanPlatform,
      });
    } catch {
      // Silent fail — sẽ retry lần sau
    } finally {
      lastFetchAt = Date.now();
      updateLoading(false);
      inFlightRequest = null;
    }
  })();

  return inFlightRequest;
}

function scheduleNextPoll() {
  clearPollTimer();
  if (!canPoll()) return;

  const idleTime = Date.now() - lastActivityAt;
  if (idleTime > IDLE_TIMEOUT_MS) return;

  pollTimer = setTimeout(async () => {
    await fetchCounts();
    scheduleNextPoll();
  }, getPollInterval());
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return;
  isFocused = document.visibilityState === 'visible';
  if (isFocused) {
    lastActivityAt = Date.now();
    void fetchCounts(true);
  }
  scheduleNextPoll();
}

function handleActivity() {
  const now = Date.now();
  const wasIdle = now - lastActivityAt > IDLE_TIMEOUT_MS;
  lastActivityAt = now;
  if (wasIdle) {
    void fetchCounts(true);
  }
  scheduleNextPoll();
}

function handleOnline() {
  lastActivityAt = Date.now();
  void fetchCounts(true);
  scheduleNextPoll();
}

function bindBrowserEvents() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (!isVisibilityBound) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    isVisibilityBound = true;
  }

  if (!isActivityBound) {
    window.addEventListener('mousedown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    isActivityBound = true;
  }

  if (!isOnlineBound) {
    window.addEventListener('online', handleOnline);
    isOnlineBound = true;
  }

  isFocused = document.visibilityState === 'visible';
}

function unbindBrowserEvents() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (isVisibilityBound) {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    isVisibilityBound = false;
  }

  if (isActivityBound) {
    window.removeEventListener('mousedown', handleActivity);
    window.removeEventListener('keydown', handleActivity);
    window.removeEventListener('touchstart', handleActivity);
    isActivityBound = false;
  }

  if (isOnlineBound) {
    window.removeEventListener('online', handleOnline);
    isOnlineBound = false;
  }
}

function setAuthScope(userId: string | null, tenantId: string | null) {
  const changed = activeUserId !== userId || activeTenantId !== tenantId;
  activeUserId = userId;
  activeTenantId = tenantId;

  if (!activeUserId || !activeTenantId) {
    clearPollTimer();
    unbindBrowserEvents();
    updateLoading(false);
    updateCounts(EMPTY_COUNTS);
    return;
  }

  if (changed && canPoll()) {
    bindBrowserEvents();
    lastActivityAt = Date.now();
    void fetchCounts(true);
    scheduleNextPoll();
  }
}

function startPolling() {
  if (!canPoll()) return;
  bindBrowserEvents();
  lastActivityAt = Date.now();
  void fetchCounts(true);
  scheduleNextPoll();
}

function stopPolling() {
  clearPollTimer();
  if (subscriberCount === 0) {
    unbindBrowserEvents();
  }
}

/**
 * Hook polling cho thông báo, hỗ trợ nền tảng, nhắc việc.
 * - Focus tab: poll 60s
 * - Blur tab: poll 5 phút
 * - Idle > 10 phút: dừng poll
 */
export function useNotificationPolling() {
  const { user, currentTenantId } = useAuth();
  const [localSnapshot, setLocalSnapshot] = useState<PollSnapshot>(snapshot);

  useEffect(() => {
    const listener = (next: PollSnapshot) => {
      setLocalSnapshot(next);
    };

    listeners.add(listener);
    subscriberCount += 1;
    listener(snapshot);

    if (subscriberCount === 1 && activeUserId && activeTenantId) {
      startPolling();
    }

    return () => {
      listeners.delete(listener);
      subscriberCount = Math.max(0, subscriberCount - 1);
      if (subscriberCount === 0) {
        stopPolling();
      }
    };
  }, []);

  useEffect(() => {
    setAuthScope(user?.id || null, currentTenantId || null);
  }, [user?.id, currentTenantId]);

  const refresh = useCallback(() => {
    lastActivityAt = Date.now();
    void fetchCounts(true);
    scheduleNextPoll();
  }, []);

  return { counts: localSnapshot.counts, loading: localSnapshot.loading, refresh };
}
