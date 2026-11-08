export type RecentActivityAction =
  | 'search_hit'
  | 'quick_history_open'
  | 'open_rx_drug'
  | 'open_rx_glasses'
  | 'open_profile';

export interface ActivityPatientRef {
  id: number;
  ten: string;
  dienthoai?: string;
  diachi?: string;
  namsinh?: string;
  mabenhnhan?: string;
}

export interface RecentActivityEvent {
  eventId: string;
  timestamp: number;
  action: RecentActivityAction;
  source?: string;
  patient: ActivityPatientRef;
  branchId?: string | null;
  pendingSync?: boolean;
  syncedAt?: number | null;
  createdBy?: string | null;
  createdByName?: string | null;
}

export interface RecentActivitySyncPayload {
  client_event_id: string;
  action: RecentActivityAction;
  source?: string;
  event_at: string;
  patient_id: number;
  patient_name: string;
  patient_phone?: string;
  patient_address?: string;
  patient_birth_year?: string;
}

export interface RecentActivityServerRow {
  client_event_id: string;
  action: RecentActivityAction;
  source?: string | null;
  event_at: string;
  updated_at?: string | null;
  patient_id: number;
  patient_name: string;
  patient_phone?: string | null;
  patient_address?: string | null;
  patient_birth_year?: string | null;
  branch_id?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
}

export type ActivitySyncBackoffReason = 'rate_limit' | 'network' | 'server';

export interface ActivitySyncBackoffState {
  reason: ActivitySyncBackoffReason;
  attempt: number;
  nextRetryAt: number;
}

export interface ActivityStorageScope {
  tenantId: string | null;
  branchId: string | null;
  userId: string | null;
}

const ACTIVITY_STORAGE_KEY_BASE = 'mbn:recent_activity_v1';
const LEGACY_RECENT_KEY = 'mbn:recent_patients';
const LAST_SYNC_AT_KEY_BASE = 'mbn:recent_activity_last_sync_at';
const SYNC_BACKOFF_KEY_BASE = 'mbn:recent_activity_sync_backoff_v1';
const LAST_FULL_PULL_AT_KEY_BASE = 'mbn:recent_activity_last_full_pull_at';
const ACTIVITY_USER_ID_KEY = 'mbn:activity_user_id';

/** Client display/sync window — keep last 3 days. */
export const ACTIVITY_RETENTION_DAYS = 3;
export const ACTIVITY_RETENTION_MS = ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const MAX_ACTIVITY_IN_WINDOW = 400;
export const MAX_RECENT_PATIENTS = 30;

/** Only collapse rapid search_hit spam for the same patient. */
const SEARCH_HIT_DEDUPE_MS = 5_000;

/** Prefer meaningful actions over search_hit when collapsing near-duplicate rows. */
const COLLAPSE_PRIORITY_WINDOW_MS = 2 * 60 * 1000;

const ACTION_PRIORITY: Record<RecentActivityAction, number> = {
  open_rx_drug: 5,
  open_rx_glasses: 5,
  quick_history_open: 4,
  open_profile: 3,
  search_hit: 1,
};

const UPDATE_EVENT_NAME = 'mbn:activity-updated';
export const ACTIVITY_SYNC_REQUEST_EVENT = 'mbn:activity-sync-request';
export const ACTIVITY_SCOPE_CHANGED_EVENT = 'mbn:activity-scope-changed';

function nowTs(): number {
  return Date.now();
}

function retentionCutoff(now: number = nowTs()): number {
  return now - ACTIVITY_RETENTION_MS;
}

function safeParseArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeEvent(candidate: any): RecentActivityEvent | null {
  const patientId = Number(candidate?.patient?.id);
  const patientName = typeof candidate?.patient?.ten === 'string' ? candidate.patient.ten.trim() : '';
  const timestamp = Number(candidate?.timestamp);
  const action = candidate?.action as RecentActivityAction;

  if (!Number.isFinite(patientId) || patientId <= 0) return null;
  if (!patientName) return null;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  if (typeof action !== 'string') return null;

  return {
    eventId: typeof candidate?.eventId === 'string' && candidate.eventId ? candidate.eventId : `${timestamp}-${patientId}`,
    timestamp,
    action,
    source: typeof candidate?.source === 'string' ? candidate.source : undefined,
    branchId: typeof candidate?.branchId === 'string' ? candidate.branchId : null,
    pendingSync: candidate?.pendingSync === true,
    syncedAt: Number.isFinite(Number(candidate?.syncedAt)) ? Number(candidate.syncedAt) : null,
    createdBy: typeof candidate?.createdBy === 'string' ? candidate.createdBy : null,
    createdByName: typeof candidate?.createdByName === 'string' ? candidate.createdByName : null,
    patient: {
      id: patientId,
      ten: patientName,
      dienthoai: typeof candidate?.patient?.dienthoai === 'string' ? candidate.patient.dienthoai : undefined,
      diachi: typeof candidate?.patient?.diachi === 'string' ? candidate.patient.diachi : undefined,
      namsinh: typeof candidate?.patient?.namsinh === 'string' ? candidate.patient.namsinh : undefined,
      mabenhnhan: typeof candidate?.patient?.mabenhnhan === 'string' ? candidate.patient.mabenhnhan : undefined,
    },
  };
}

/** Drop events older than the retention window and cap total count. */
export function pruneEvents(events: RecentActivityEvent[], now: number = nowTs()): RecentActivityEvent[] {
  const cutoff = retentionCutoff(now);
  return events
    .filter((event) => event.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ACTIVITY_IN_WINDOW);
}

/**
 * Soft-dedupe only for search_hit within a few seconds (typing spam).
 * All other actions are kept as distinct timeline rows.
 */
function softDedupeEvents(events: RecentActivityEvent[]): RecentActivityEvent[] {
  const next: RecentActivityEvent[] = [];
  const seenIds = new Set<string>();

  for (const event of events.sort((a, b) => b.timestamp - a.timestamp)) {
    if (seenIds.has(event.eventId)) continue;

    if (event.action === 'search_hit') {
      const duplicatedIndex = next.findIndex((existing) => {
        if (existing.action !== 'search_hit') return false;
        if (existing.patient.id !== event.patient.id) return false;
        return Math.abs(existing.timestamp - event.timestamp) < SEARCH_HIT_DEDUPE_MS;
      });

      if (duplicatedIndex >= 0) {
        if (event.timestamp > next[duplicatedIndex].timestamp) {
          seenIds.delete(next[duplicatedIndex].eventId);
          next[duplicatedIndex] = event;
          seenIds.add(event.eventId);
        }
        continue;
      }
    }

    seenIds.add(event.eventId);
    next.push(event);
    if (next.length >= MAX_ACTIVITY_IN_WINDOW) break;
  }

  return next;
}

function finalizeEvents(events: RecentActivityEvent[]): RecentActivityEvent[] {
  return pruneEvents(softDedupeEvents(events));
}

/**
 * Display helper: one row per patient — newest event, with a short window
 * preferring prescription/history actions over search_hit spam.
 */
export function collapseActivitiesToLatestPerPatient(
  events: RecentActivityEvent[]
): RecentActivityEvent[] {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
  const byPatient = new Map<number, RecentActivityEvent>();

  for (const event of sorted) {
    const existing = byPatient.get(event.patient.id);
    if (!existing) {
      byPatient.set(event.patient.id, event);
      continue;
    }

    const withinWindow = Math.abs(existing.timestamp - event.timestamp) <= COLLAPSE_PRIORITY_WINDOW_MS;
    if (
      withinWindow &&
      (ACTION_PRIORITY[event.action] || 0) > (ACTION_PRIORITY[existing.action] || 0)
    ) {
      byPatient.set(event.patient.id, event);
    }
  }

  return Array.from(byPatient.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export function getActivityStorageScope(): ActivityStorageScope {
  if (typeof window === 'undefined') {
    return { tenantId: null, branchId: null, userId: null };
  }

  const tenantId = localStorage.getItem('currentTenantId');
  const branchId = tenantId ? localStorage.getItem(`currentBranchId_${tenantId}`) : null;
  const userId = localStorage.getItem(ACTIVITY_USER_ID_KEY);
  return {
    tenantId: tenantId || null,
    branchId: branchId || null,
    userId: userId || null,
  };
}

export function hasCompleteActivityScope(scope: ActivityStorageScope = getActivityStorageScope()): boolean {
  return !!(scope.tenantId && scope.branchId && scope.userId);
}

export function getActivityScopeKey(scope: ActivityStorageScope = getActivityStorageScope()): string | null {
  if (!scope.tenantId || !scope.branchId || !scope.userId) return null;
  return `${scope.tenantId}:${scope.branchId}:${scope.userId}`;
}

function scopedStorageKey(base: string, scope: ActivityStorageScope = getActivityStorageScope()): string {
  const scopeKey = getActivityScopeKey(scope);
  return scopeKey ? `${base}:${scopeKey}` : `${base}:noscope`;
}

export function setActivityUserId(userId: string | null) {
  if (typeof window === 'undefined') return;
  const prev = localStorage.getItem(ACTIVITY_USER_ID_KEY);
  const next = userId || null;
  if (next) localStorage.setItem(ACTIVITY_USER_ID_KEY, next);
  else localStorage.removeItem(ACTIVITY_USER_ID_KEY);

  if (prev !== next) {
    notifyActivityScopeChanged('user');
  }
}

export function notifyActivityScopeChanged(reason: string = 'scope') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACTIVITY_SCOPE_CHANGED_EVENT, { detail: { reason } }));
  // Reload UI from the scoped bucket for the new tenant/branch/user (no rewrite).
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail: readStorageEvents() }));
}

function readStorageEvents(): RecentActivityEvent[] {
  if (typeof window === 'undefined') return [];

  const scopedKey = scopedStorageKey(ACTIVITY_STORAGE_KEY_BASE);
  const currentEvents = finalizeEvents(
    safeParseArray(localStorage.getItem(scopedKey))
      .map(normalizeEvent)
      .filter((event): event is RecentActivityEvent => !!event)
  );

  if (currentEvents.length > 0) return currentEvents;

  // One-time migration: legacy unscoped activity → current scope (when scope is complete).
  if (hasCompleteActivityScope()) {
    const legacyEvents = finalizeEvents(
      safeParseArray(localStorage.getItem(ACTIVITY_STORAGE_KEY_BASE))
        .map(normalizeEvent)
        .filter((event): event is RecentActivityEvent => !!event)
    );
    if (legacyEvents.length > 0) {
      writeStorageEvents(legacyEvents);
      try {
        localStorage.removeItem(ACTIVITY_STORAGE_KEY_BASE);
      } catch {
        /* ignore */
      }
      return legacyEvents;
    }
  }

  // Migrate legacy recent list to activity events lazily.
  const legacy = safeParseArray(localStorage.getItem(LEGACY_RECENT_KEY));
  if (legacy.length === 0) return [];

  const migrated: RecentActivityEvent[] = legacy
    .slice(0, MAX_RECENT_PATIENTS)
    .map((item: any, idx) => {
      const patientId = Number(item?.id);
      const ten = typeof item?.ten === 'string' ? item.ten.trim() : '';
      if (!Number.isFinite(patientId) || patientId <= 0 || !ten) return null;

      return {
        eventId: `legacy-${patientId}-${idx}`,
        timestamp: nowTs() - idx * 1000,
        action: 'open_profile' as const,
        source: 'legacy_recent',
        pendingSync: true,
        syncedAt: null,
        patient: {
          id: patientId,
          ten,
          dienthoai: typeof item?.dienthoai === 'string' ? item.dienthoai : undefined,
          diachi: typeof item?.diachi === 'string' ? item.diachi : undefined,
          namsinh: typeof item?.namsinh === 'string' ? item.namsinh : undefined,
          mabenhnhan: typeof item?.mabenhnhan === 'string' ? item.mabenhnhan : undefined,
        },
      };
    })
    .filter((item): item is RecentActivityEvent => !!item);

  if (migrated.length > 0 && hasCompleteActivityScope()) {
    writeStorageEvents(migrated);
  }

  return migrated;
}

function writeStorageEvents(events: RecentActivityEvent[]) {
  if (typeof window === 'undefined') return;
  const next = finalizeEvents(events);
  localStorage.setItem(scopedStorageKey(ACTIVITY_STORAGE_KEY_BASE), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail: next }));
}

function getCurrentBranchId(): string | null {
  return getActivityStorageScope().branchId;
}

function requestActivitySync(reason: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACTIVITY_SYNC_REQUEST_EVENT, { detail: { reason } }));
}

export function buildActivityPatientRef(patient: {
  id?: number | null;
  ten?: string | null;
  dienthoai?: string | null;
  diachi?: string | null;
  namsinh?: string | null;
  mabenhnhan?: string | null;
} | null | undefined): ActivityPatientRef | null {
  const id = Number(patient?.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const ten = (patient?.ten || '').trim();
  if (!ten) return null;

  return {
    id,
    ten,
    dienthoai: patient?.dienthoai || undefined,
    diachi: patient?.diachi || undefined,
    namsinh: patient?.namsinh || undefined,
    mabenhnhan: patient?.mabenhnhan || undefined,
  };
}

export function loadRecentActivities(): RecentActivityEvent[] {
  return readStorageEvents();
}

export function pushRecentActivity(input: {
  action: RecentActivityAction;
  patient: ActivityPatientRef;
  source?: string;
}): RecentActivityEvent[] {
  if (typeof window === 'undefined') return [];

  const timestamp = nowTs();
  const event: RecentActivityEvent = {
    eventId: `${timestamp}-${input.patient.id}-${input.action}`,
    timestamp,
    action: input.action,
    source: input.source,
    branchId: getCurrentBranchId(),
    pendingSync: true,
    syncedAt: null,
    patient: {
      ...input.patient,
      ten: (input.patient.ten || '').trim(),
    },
  };

  if (!event.patient.ten || !Number.isFinite(event.patient.id) || event.patient.id <= 0) {
    return readStorageEvents();
  }

  const current = readStorageEvents();
  const next = finalizeEvents([event, ...current]);
  writeStorageEvents(next);
  requestActivitySync('local_push');
  return next;
}

export function getRecentPatientsFromActivities(
  events: RecentActivityEvent[],
  limit: number = MAX_RECENT_PATIENTS
): ActivityPatientRef[] {
  const seen = new Set<number>();
  const patients: ActivityPatientRef[] = [];

  for (const event of collapseActivitiesToLatestPerPatient(events)) {
    if (seen.has(event.patient.id)) continue;
    seen.add(event.patient.id);
    patients.push(event.patient);
    if (patients.length >= limit) break;
  }

  return patients;
}

export function subscribeRecentActivityUpdates(callback: (events: RecentActivityEvent[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onUpdate = (event: Event) => {
    const customEvent = event as CustomEvent<RecentActivityEvent[]>;
    const detail = Array.isArray(customEvent.detail)
      ? finalizeEvents(
          customEvent.detail.map(normalizeEvent).filter((item): item is RecentActivityEvent => !!item)
        )
      : readStorageEvents();
    callback(detail);
  };

  window.addEventListener(UPDATE_EVENT_NAME, onUpdate as EventListener);
  return () => window.removeEventListener(UPDATE_EVENT_NAME, onUpdate as EventListener);
}

export function getActivityLastSyncAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(scopedStorageKey(LAST_SYNC_AT_KEY_BASE));
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

export function setActivityLastSyncAt(ts: number) {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(ts) || ts <= 0) return;
  localStorage.setItem(scopedStorageKey(LAST_SYNC_AT_KEY_BASE), String(Math.floor(ts)));
}

export function getActivityLastFullPullAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(scopedStorageKey(LAST_FULL_PULL_AT_KEY_BASE));
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

export function setActivityLastFullPullAt(ts: number) {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(ts) || ts <= 0) return;
  localStorage.setItem(scopedStorageKey(LAST_FULL_PULL_AT_KEY_BASE), String(Math.floor(ts)));
}

export function getActivitySyncBackoffState(): ActivitySyncBackoffState | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(scopedStorageKey(SYNC_BACKOFF_KEY_BASE));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ActivitySyncBackoffState>;
    const reason = parsed.reason;
    const attempt = Number(parsed.attempt);
    const nextRetryAt = Number(parsed.nextRetryAt);

    if (reason !== 'rate_limit' && reason !== 'network' && reason !== 'server') return null;
    if (!Number.isFinite(attempt) || attempt < 1) return null;
    if (!Number.isFinite(nextRetryAt) || nextRetryAt <= 0) return null;

    return {
      reason,
      attempt: Math.floor(attempt),
      nextRetryAt: Math.floor(nextRetryAt),
    };
  } catch {
    return null;
  }
}

export function setActivitySyncBackoffState(state: ActivitySyncBackoffState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(scopedStorageKey(SYNC_BACKOFF_KEY_BASE), JSON.stringify(state));
}

export function clearActivitySyncBackoffState() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(scopedStorageKey(SYNC_BACKOFF_KEY_BASE));
}

export function getMaxServerUpdatedAt(rows: RecentActivityServerRow[]): number | null {
  let maxTs = 0;
  for (const row of rows) {
    const ts = row.updated_at ? Date.parse(row.updated_at) : NaN;
    if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
  }
  return maxTs > 0 ? maxTs : null;
}

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

export function getPendingActivityPayload(limit: number = 40): RecentActivitySyncPayload[] {
  const events = readStorageEvents();
  return events
    .filter((event) => event.pendingSync)
    .slice(0, Math.max(1, limit))
    .map((event) => ({
      client_event_id: event.eventId,
      action: event.action,
      source: event.source,
      event_at: toIso(event.timestamp),
      patient_id: event.patient.id,
      patient_name: event.patient.ten,
      patient_phone: event.patient.dienthoai,
      patient_address: event.patient.diachi,
      patient_birth_year: event.patient.namsinh,
    }));
}

export function getPendingActivityCount(): number {
  return readStorageEvents().reduce((count, event) => count + (event.pendingSync ? 1 : 0), 0);
}

function mapServerRowToEvent(row: RecentActivityServerRow): RecentActivityEvent | null {
  const ts = Date.parse(row.event_at);
  if (!Number.isFinite(ts)) return null;
  const rowSyncedAt = row.updated_at ? Date.parse(row.updated_at) : Date.now();
  return normalizeEvent({
    eventId: row.client_event_id,
    timestamp: ts,
    action: row.action,
    source: row.source || undefined,
    branchId: row.branch_id || null,
    pendingSync: false,
    syncedAt: Number.isFinite(rowSyncedAt) ? rowSyncedAt : Date.now(),
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || null,
    patient: {
      id: row.patient_id,
      ten: row.patient_name,
      dienthoai: row.patient_phone || undefined,
      diachi: row.patient_address || undefined,
      namsinh: row.patient_birth_year || undefined,
    },
  });
}

export function markActivitiesSynced(eventIds: string[], syncedAt: number = Date.now()): RecentActivityEvent[] {
  if (eventIds.length === 0) return readStorageEvents();
  const idSet = new Set(eventIds);
  const events = readStorageEvents().map((event) => {
    if (!idSet.has(event.eventId)) return event;
    return { ...event, pendingSync: false, syncedAt };
  });
  writeStorageEvents(events);
  setActivityLastSyncAt(syncedAt);
  return events;
}

/** Drop pending flag for events the server rejected (wrong branch / invalid patient). */
export function discardPendingActivities(eventIds: string[]): RecentActivityEvent[] {
  if (eventIds.length === 0) return readStorageEvents();
  const idSet = new Set(eventIds);
  const events = readStorageEvents().map((event) => {
    if (!idSet.has(event.eventId)) return event;
    return { ...event, pendingSync: false };
  });
  writeStorageEvents(events);
  return events;
}

export function mergeRecentActivityFromServer(rows: RecentActivityServerRow[]): RecentActivityEvent[] {
  const local = readStorageEvents();
  const incoming = rows
    .map(mapServerRowToEvent)
    .filter((event): event is RecentActivityEvent => !!event);

  if (incoming.length === 0) return local;

  const byEventId = new Map<string, RecentActivityEvent>();
  for (const event of local) byEventId.set(event.eventId, event);

  for (const event of incoming) {
    const existing = byEventId.get(event.eventId);
    if (!existing) {
      byEventId.set(event.eventId, event);
      continue;
    }

    byEventId.set(event.eventId, {
      ...existing,
      ...event,
      pendingSync: false,
      syncedAt: event.syncedAt || existing.syncedAt || Date.now(),
      createdBy: event.createdBy || existing.createdBy || null,
      createdByName: event.createdByName || existing.createdByName || null,
      patient: {
        ...existing.patient,
        ...event.patient,
      },
    });
  }

  const merged = finalizeEvents(Array.from(byEventId.values()));
  writeStorageEvents(merged);
  const maxServerTs = getMaxServerUpdatedAt(rows);
  if (maxServerTs) {
    setActivityLastSyncAt(maxServerTs);
  }
  return merged;
}
