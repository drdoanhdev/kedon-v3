import { fetchWithAuth } from './fetchWithAuth';
import {
  ACTIVITY_RETENTION_DAYS,
  ACTIVITY_SYNC_REQUEST_EVENT,
  clearActivitySyncBackoffState,
  getActivityLastFullPullAt,
  getActivityLastSyncAt,
  getActivitySyncBackoffState,
  getMaxServerUpdatedAt,
  getPendingActivityCount,
  getPendingActivityPayload,
  markActivitiesSynced,
  mergeRecentActivityFromServer,
  setActivityLastFullPullAt,
  setActivityLastSyncAt,
  setActivitySyncBackoffState,
  type RecentActivityServerRow,
} from './recentActivity';

export type ActivitySyncReason =
  | 'boot'
  | 'interval'
  | 'visible'
  | 'online'
  | 'local_push'
  | 'manual'
  | 'open_search'
  | 'full_window';

export type ActivitySyncStatus = {
  syncing: boolean;
  error: string;
  lastSyncAt: number | null;
  pendingCount: number;
};

type SyncListener = (status: ActivitySyncStatus) => void;

const SYNC_INTERVAL_MS = 25_000;
const FULL_PULL_INTERVAL_MS = 15 * 60_000;
const PUSH_DEBOUNCE_MS = 2_500;
const PENDING_PUSH_LIMIT = 80;

let syncing = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let listenersAttached = false;
let loopStarted = false;
let lastError = '';
const statusListeners = new Set<SyncListener>();

function getCurrentBranchId(): string | null {
  if (typeof window === 'undefined') return null;
  const tenantId = localStorage.getItem('currentTenantId');
  if (!tenantId) return null;
  return localStorage.getItem(`currentBranchId_${tenantId}`);
}

function buildStatus(): ActivitySyncStatus {
  return {
    syncing,
    error: lastError,
    lastSyncAt: getActivityLastSyncAt(),
    pendingCount: getPendingActivityCount(),
  };
}

function emitStatus() {
  const status = buildStatus();
  for (const listener of statusListeners) {
    try {
      listener(status);
    } catch {
      /* ignore listener errors */
    }
  }
}

function scheduleBackoff(reason: 'rate_limit' | 'network' | 'server', retryAfterSec?: number) {
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
  lastError = `Tạm hoãn đồng bộ ${remainSec}s`;
  emitStatus();
}

function shouldFullPull(forceFull: boolean): boolean {
  if (forceFull) return true;
  const lastFull = getActivityLastFullPullAt();
  if (!lastFull) return true;
  return Date.now() - lastFull >= FULL_PULL_INTERVAL_MS;
}

async function pullFromServer(opts: { forceFull: boolean }): Promise<boolean> {
  const lastSyncAt = getActivityLastSyncAt();
  const doFull = shouldFullPull(opts.forceFull) || !lastSyncAt;

  const params = new URLSearchParams();
  params.set('days', String(ACTIVITY_RETENTION_DAYS));
  params.set('limit', '300');
  if (!doFull && lastSyncAt) {
    params.set('since', String(lastSyncAt));
  }

  const pullRes = await fetchWithAuth(`/api/recent-activity?${params.toString()}`);
  if (pullRes.status === 429) {
    const retryAfter = Number(pullRes.headers.get('Retry-After') || '');
    scheduleBackoff('rate_limit', Number.isFinite(retryAfter) ? retryAfter : undefined);
    return false;
  }

  if (pullRes.status === 400) {
    const payload = await pullRes.json().catch(() => null);
    const message =
      typeof payload?.message === 'string' && payload.message
        ? payload.message
        : 'Chọn chi nhánh để đồng bộ hoạt động';
    lastError = message;
    emitStatus();
    return false;
  }

  if (!pullRes.ok) {
    scheduleBackoff('server');
    return false;
  }

  const payload = await pullRes.json();
  const rows = Array.isArray(payload?.data) ? (payload.data as RecentActivityServerRow[]) : [];
  mergeRecentActivityFromServer(rows);

  const maxPullSyncTs = getMaxServerUpdatedAt(rows);
  if (maxPullSyncTs) {
    setActivityLastSyncAt(maxPullSyncTs);
  } else if (doFull) {
    // Full window with no rows still marks a successful baseline.
    setActivityLastSyncAt(Date.now());
  }

  if (doFull) {
    setActivityLastFullPullAt(Date.now());
  }

  return true;
}

async function pushPending(): Promise<boolean> {
  const pending = getPendingActivityPayload(PENDING_PUSH_LIMIT);
  if (pending.length === 0) return true;

  const pushRes = await fetchWithAuth('/api/recent-activity', {
    method: 'POST',
    body: JSON.stringify({ events: pending }),
  });

  if (pushRes.status === 429) {
    const retryAfter = Number(pushRes.headers.get('Retry-After') || '');
    scheduleBackoff('rate_limit', Number.isFinite(retryAfter) ? retryAfter : undefined);
    return false;
  }

  if (pushRes.status === 400) {
    const payload = await pushRes.json().catch(() => null);
    const message =
      typeof payload?.message === 'string' && payload.message
        ? payload.message
        : 'Không đẩy được hoạt động';
    lastError = message;
    emitStatus();
    return false;
  }

  if (!pushRes.ok) {
    scheduleBackoff('server');
    return false;
  }

  const pushPayload = await pushRes.json();
  const savedRows = Array.isArray(pushPayload?.data)
    ? (pushPayload.data as RecentActivityServerRow[])
    : [];
  const syncedIds = savedRows.map((row) => row.client_event_id).filter(Boolean);
  markActivitiesSynced(syncedIds, Date.now());
  mergeRecentActivityFromServer(savedRows);

  const maxPushSyncTs = getMaxServerUpdatedAt(savedRows);
  if (maxPushSyncTs) {
    setActivityLastSyncAt(maxPushSyncTs);
  }

  return true;
}

export async function syncRecentActivity(opts?: {
  reason?: ActivitySyncReason;
  forceFull?: boolean;
}): Promise<void> {
  if (typeof window === 'undefined') return;
  if (syncing) return;

  const reason = opts?.reason || 'interval';
  const forceFull = opts?.forceFull === true || reason === 'full_window' || reason === 'boot';

  if (!getCurrentBranchId()) {
    lastError = 'Chọn chi nhánh để đồng bộ hoạt động';
    emitStatus();
    return;
  }

  const backoffState = getActivitySyncBackoffState();
  if (backoffState && backoffState.nextRetryAt > Date.now() && reason !== 'manual') {
    const remainSec = Math.max(1, Math.ceil((backoffState.nextRetryAt - Date.now()) / 1000));
    lastError = `Tạm hoãn đồng bộ ${remainSec}s`;
    emitStatus();
    return;
  }

  syncing = true;
  lastError = '';
  emitStatus();

  try {
    const pulled = await pullFromServer({ forceFull });
    if (!pulled) return;

    const pushed = await pushPending();
    if (!pushed) return;

    clearActivitySyncBackoffState();
    lastError = '';
  } catch {
    scheduleBackoff('network');
  } finally {
    syncing = false;
    emitStatus();
  }
}

export function scheduleRecentActivitySync(reason: ActivitySyncReason = 'local_push') {
  if (typeof window === 'undefined') return;

  if (reason === 'manual' || reason === 'open_search' || reason === 'boot' || reason === 'full_window') {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    void syncRecentActivity({
      reason,
      forceFull: reason === 'boot' || reason === 'full_window' || reason === 'open_search',
    });
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncRecentActivity({ reason });
  }, reason === 'local_push' ? PUSH_DEBOUNCE_MS : 0);
}

export function getRecentActivitySyncStatus(): ActivitySyncStatus {
  return buildStatus();
}

export function subscribeRecentActivitySyncStatus(listener: SyncListener): () => void {
  statusListeners.add(listener);
  listener(buildStatus());
  return () => {
    statusListeners.delete(listener);
  };
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    scheduleRecentActivitySync('visible');
  }
}

function onOnline() {
  scheduleRecentActivitySync('online');
}

function onSyncRequest(event: Event) {
  const custom = event as CustomEvent<{ reason?: string }>;
  const reason = (custom.detail?.reason as ActivitySyncReason) || 'local_push';
  scheduleRecentActivitySync(reason);
}

function attachGlobalListeners() {
  if (typeof window === 'undefined' || listenersAttached) return;
  listenersAttached = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);
  window.addEventListener(ACTIVITY_SYNC_REQUEST_EVENT, onSyncRequest as EventListener);
}

function detachGlobalListeners() {
  if (typeof window === 'undefined' || !listenersAttached) return;
  listenersAttached = false;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('online', onOnline);
  window.removeEventListener(ACTIVITY_SYNC_REQUEST_EVENT, onSyncRequest as EventListener);
}

export function startRecentActivitySyncLoop() {
  if (typeof window === 'undefined' || loopStarted) return;
  loopStarted = true;
  attachGlobalListeners();
  scheduleRecentActivitySync('boot');

  intervalTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    scheduleRecentActivitySync('interval');
  }, SYNC_INTERVAL_MS);
}

export function stopRecentActivitySyncLoop() {
  if (!loopStarted) return;
  loopStarted = false;
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  detachGlobalListeners();
}
