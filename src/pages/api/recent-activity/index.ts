import type { NextApiRequest, NextApiResponse } from 'next';
import {
  RECENT_ACTIVITY_DEFAULT_DAYS,
  RECENT_ACTIVITY_DEFAULT_LIMIT,
  RECENT_ACTIVITY_MAX_DAYS,
  RECENT_ACTIVITY_MAX_LIMIT,
  RATE_LIMITS,
} from '../../../lib/apiLimits';
import { enforceRateLimit, tenantUserRateLimitKey } from '../../../lib/rateLimit';
import {
  requireTenant,
  resolveBranchAccess,
  supabaseAdmin as supabase,
  setNoCacheHeaders,
} from '../../../lib/tenantApi';

type ActivityAction =
  | 'search_hit'
  | 'quick_history_open'
  | 'open_rx_drug'
  | 'open_rx_glasses'
  | 'open_profile';

const VALID_ACTIONS: ActivityAction[] = [
  'search_hit',
  'quick_history_open',
  'open_rx_drug',
  'open_rx_glasses',
  'open_profile',
];

const MAX_EVENTS_PER_REQUEST = 100;

interface IncomingActivityEvent {
  client_event_id: string;
  action: ActivityAction;
  source?: string;
  event_at: string;
  patient_id: number;
}

function normalizeIncomingEvents(input: unknown): IncomingActivityEvent[] {
  if (!Array.isArray(input)) return [];

  const normalizedByEventId = new Map<string, IncomingActivityEvent>();

  for (const raw of input) {
    const clientEventId = typeof (raw as any)?.client_event_id === 'string'
      ? (raw as any).client_event_id.trim()
      : '';
    const action = (raw as any)?.action as ActivityAction;
    const patientId = Number((raw as any)?.patient_id);
    const eventAt = typeof (raw as any)?.event_at === 'string'
      ? (raw as any).event_at
      : '';

    if (!clientEventId || clientEventId.length > 100) continue;
    if (!VALID_ACTIONS.includes(action)) continue;
    if (!Number.isFinite(patientId) || patientId <= 0) continue;
    if (!eventAt || !Number.isFinite(Date.parse(eventAt))) continue;

    normalizedByEventId.set(clientEventId, {
      client_event_id: clientEventId,
      action,
      source: typeof (raw as any)?.source === 'string' ? (raw as any).source.slice(0, 80) : undefined,
      event_at: eventAt,
      patient_id: patientId,
    });
  }

  return Array.from(normalizedByEventId.values()).slice(0, MAX_EVENTS_PER_REQUEST);
}

function parseDays(raw: unknown): number {
  const value = Number(raw ?? RECENT_ACTIVITY_DEFAULT_DAYS);
  if (!Number.isFinite(value)) return RECENT_ACTIVITY_DEFAULT_DAYS;
  return Math.min(Math.max(Math.floor(value), 1), RECENT_ACTIVITY_MAX_DAYS);
}

function parseLimit(raw: unknown): number {
  const value = Number(raw ?? RECENT_ACTIVITY_DEFAULT_LIMIT);
  if (!Number.isFinite(value)) return RECENT_ACTIVITY_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(value), 1), RECENT_ACTIVITY_MAX_LIMIT);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const branchAccess = await resolveBranchAccess(ctx, res, {
    requireForStaff: true,
    allowAllForOwner: true,
  });
  if (!branchAccess) return;

  const { tenantId, userId } = ctx;
  // Prefer resolved branch; fall back to header/context so owner sync stays branch-scoped.
  const branchId = branchAccess.branchId || ctx.branchId;

  if (!branchId) {
    return res.status(400).json({
      message: 'Chọn chi nhánh để đồng bộ hoạt động',
    });
  }

  const rlKey = tenantUserRateLimitKey(tenantId, userId, 'recent-activity');
  if (!enforceRateLimit(
    res,
    rlKey,
    RATE_LIMITS.recentActivity.limit,
    RATE_LIMITS.recentActivity.windowMs,
    'Đồng bộ quá nhanh, vui lòng thử lại sau vài giây'
  )) {
    return;
  }

  try {
    if (req.method === 'GET') {
      const days = parseDays(req.query.days);
      const limit = parseLimit(req.query.limit);
      const sinceRaw = typeof req.query.since === 'string' ? req.query.since : '';
      const sinceMs = sinceRaw ? Number(sinceRaw) : NaN;
      const hasSince = Number.isFinite(sinceMs) && sinceMs > 0;
      const windowStartIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      let query = supabase
        .from('recent_activity_events')
        .select('client_event_id, action, source, event_at, patient_id, patient_name, patient_phone, patient_address, patient_birth_year, branch_id, updated_at')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .gte('event_at', windowStartIso)
        .limit(limit);

      if (hasSince) {
        query = query
          .gt('updated_at', new Date(sinceMs).toISOString())
          .order('updated_at', { ascending: false });
      } else {
        query = query.order('event_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) {
        return res.status(400).json({ message: 'Lỗi lấy activity', details: error.message });
      }

      return res.status(200).json({ data: data || [], days, branch_id: branchId });
    }

    if (req.method === 'POST') {
      const events = normalizeIncomingEvents((req.body || {}).events);
      if (events.length === 0) {
        return res.status(400).json({ message: 'events không hợp lệ hoặc rỗng' });
      }

      const patientIds = Array.from(new Set(events.map((event) => event.patient_id)));

      const { data: patientRows, error: patientErr } = await supabase
        .from('BenhNhan')
        .select('id, ten, dienthoai, diachi, namsinh, branch_id')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .in('id', patientIds);

      if (patientErr) {
        return res.status(400).json({ message: 'Lỗi kiểm tra bệnh nhân activity', details: patientErr.message });
      }

      const patientMap = new Map<number, any>((patientRows || []).map((p: any) => [Number(p.id), p]));

      const validEvents = events.filter((event) => patientMap.has(event.patient_id));
      if (validEvents.length === 0) {
        return res.status(200).json({ data: [], accepted: 0, skipped: events.length });
      }

      const rows = validEvents.map((event) => {
        const patient = patientMap.get(event.patient_id);
        return {
          tenant_id: tenantId,
          branch_id: patient?.branch_id || branchId,
          client_event_id: event.client_event_id,
          action: event.action,
          source: event.source || null,
          event_at: event.event_at,
          patient_id: event.patient_id,
          patient_name: patient?.ten || `BN #${event.patient_id}`,
          patient_phone: patient?.dienthoai || null,
          patient_address: patient?.diachi || null,
          patient_birth_year: patient?.namsinh || null,
          created_by: userId,
        };
      });

      const { data, error } = await supabase
        .from('recent_activity_events')
        .upsert(rows, { onConflict: 'tenant_id,client_event_id' })
        .select('client_event_id, action, source, event_at, patient_id, patient_name, patient_phone, patient_address, patient_birth_year, branch_id, updated_at');

      if (error) {
        return res.status(400).json({ message: 'Lỗi lưu activity', details: error.message });
      }

      return res.status(200).json({
        data: data || [],
        accepted: validEvents.length,
        skipped: Math.max(0, events.length - validEvents.length),
      });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  } catch (error: any) {
    return res.status(500).json({ message: 'Lỗi server', details: error?.message || String(error) });
  }
}
