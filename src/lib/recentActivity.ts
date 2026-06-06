export type RecentActivityAction =
  | 'search_hit'
  | 'quick_history_open'
  | 'open_rx_drug'
  | 'open_rx_glasses'
  | 'open_profile'
  | 'add_waiting';

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
}

export type ActivitySyncBackoffReason = 'rate_limit' | 'network' | 'server';

export interface ActivitySyncBackoffState {
  reason: ActivitySyncBackoffReason;
  attempt: number;
  nextRetryAt: number;
}

const ACTIVITY_STORAGE_KEY = 'mbn:recent_activity_v1';
const LEGACY_RECENT_KEY = 'mbn:recent_patients';
const LAST_SYNC_AT_KEY = 'mbn:recent_activity_last_sync_at';
const SYNC_BACKOFF_KEY = 'mbn:recent_activity_sync_backoff_v1';
const MAX_ACTIVITY = 60;
export const MAX_RECENT_PATIENTS = 30;
const UPDATE_EVENT_NAME = 'mbn:activity-updated';

function nowTs(): number {
  return Date.now();
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

function readStorageEvents(): RecentActivityEvent[] {
  if (typeof window === 'undefined') return [];

  const currentEvents = safeParseArray(localStorage.getItem(ACTIVITY_STORAGE_KEY))
    .map(normalizeEvent)
    .filter((event): event is RecentActivityEvent => !!event)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ACTIVITY);

  if (currentEvents.length > 0) return currentEvents;

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

  if (migrated.length > 0) {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(migrated));
  }

  return migrated;
}

function writeStorageEvents(events: RecentActivityEvent[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(events.slice(0, MAX_ACTIVITY)));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail: events.slice(0, MAX_ACTIVITY) }));
}

function getCurrentBranchId(): string | null {
  if (typeof window === 'undefined') return null;
  const tenantId = localStorage.getItem('currentTenantId');
  if (!tenantId) return null;
  return localStorage.getItem(`currentBranchId_${tenantId}`);
}

function compactEvents(events: RecentActivityEvent[]): RecentActivityEvent[] {
  const next: RecentActivityEvent[] = [];

  for (const event of events.sort((a, b) => b.timestamp - a.timestamp)) {
    const duplicatedIndex = next.findIndex((existing) => {
      const sameAction = existing.action === event.action;
      const samePatient = existing.patient.id === event.patient.id;
      const nearTime = Math.abs(existing.timestamp - event.timestamp) < 45 * 1000;
      return sameAction && samePatient && nearTime;
    });

    if (duplicatedIndex >= 0) {
      if (event.timestamp > next[duplicatedIndex].timestamp) {
        next[duplicatedIndex] = event;
      }
      continue;
    }

    next.push(event);
    if (next.length >= MAX_ACTIVITY) break;
  }

  return next;
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
  const compacted = compactEvents([event, ...current]);
  writeStorageEvents(compacted);
  return compacted;
}

export function getRecentPatientsFromActivities(
  events: RecentActivityEvent[],
  limit: number = MAX_RECENT_PATIENTS
): ActivityPatientRef[] {
  const seen = new Set<number>();
  const patients: ActivityPatientRef[] = [];

  for (const event of events) {
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
      ? customEvent.detail.map(normalizeEvent).filter((item): item is RecentActivityEvent => !!item)
      : readStorageEvents();
    callback(detail);
  };

  window.addEventListener(UPDATE_EVENT_NAME, onUpdate as EventListener);
  return () => window.removeEventListener(UPDATE_EVENT_NAME, onUpdate as EventListener);
}

export function getActivityLastSyncAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(LAST_SYNC_AT_KEY);
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

export function setActivityLastSyncAt(ts: number) {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(ts) || ts <= 0) return;
  localStorage.setItem(LAST_SYNC_AT_KEY, String(Math.floor(ts)));
}

export function getActivitySyncBackoffState(): ActivitySyncBackoffState | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SYNC_BACKOFF_KEY);
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
  localStorage.setItem(SYNC_BACKOFF_KEY, JSON.stringify(state));
}

export function clearActivitySyncBackoffState() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SYNC_BACKOFF_KEY);
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

export function getPendingActivityPayload(limit: number = 30): RecentActivitySyncPayload[] {
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
      patient: {
        ...existing.patient,
        ...event.patient,
      },
    });
  }

  const merged = compactEvents(Array.from(byEventId.values()));
  writeStorageEvents(merged);
  const maxServerTs = getMaxServerUpdatedAt(rows);
  if (maxServerTs) {
    setActivityLastSyncAt(maxServerTs);
  }
  return merged;
}
