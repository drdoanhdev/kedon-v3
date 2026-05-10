import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, setNoCacheHeaders, supabaseAdmin as supabase } from '../../../lib/tenantApi';

type CleanupMode = 'manual' | 'auto';

function canManageCleanup(role: string): boolean {
  return role === 'admin' || role === 'doctor';
}

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 10;
  return Math.min(Math.max(Math.floor(n), 1), 50);
}

function parseThresholdMinutes(raw: unknown, mode: CleanupMode): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return mode === 'manual' ? 0 : 30;
  }
  return Math.min(Math.floor(n), 24 * 60);
}

async function runCleanupRpc(params: {
  tenantId: string | null;
  branchId: string | null;
  thresholdMinutes: number;
  triggerMode: CleanupMode;
  actorRole: 'owner' | 'admin' | 'doctor' | 'staff' | 'system';
  actorUserId: string | null;
  actorEmail: string | null;
}) {
  const { data, error } = await supabase.rpc('cleanup_waiting_room_done_cases', {
    p_threshold_minutes: params.thresholdMinutes,
    p_tenant_id: params.tenantId,
    p_branch_id: params.branchId,
    p_trigger_mode: params.triggerMode,
    p_actor_role: params.actorRole,
    p_actor_user_id: params.actorUserId,
    p_actor_email: params.actorEmail,
    p_details: { request_source: 'manual-cleanup-api' },
  });

  if (error) {
    throw error;
  }

  return Number(data || 0);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;

  const { tenantId, userId, email, role } = ctx;
  const { branchId } = branchAccess;

  if (req.method === 'GET') {
    if (!canManageCleanup(role)) {
      return res.status(403).json({ message: 'Chỉ admin/doctor mới được xem nhật ký dọn ca' });
    }

    const limit = parseLimit(req.query.limit);

    let query = supabase
      .from('waiting_cleanup_logs')
      .select('id, created_at, actor_email, actor_role, trigger_mode, threshold_minutes, deleted_count')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ message: 'Không lấy được nhật ký dọn ca', details: error.message });
    }

    return res.status(200).json({ logs: data || [] });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  if (!canManageCleanup(role)) {
    return res.status(403).json({ message: 'Chỉ admin/doctor mới được dọn ca đã xong' });
  }

  const mode: CleanupMode = req.body?.mode === 'auto' ? 'auto' : 'manual';
  const thresholdMinutes = parseThresholdMinutes(req.body?.thresholdMinutes, mode);
  const deletedCount = await runCleanupRpc({
    tenantId,
    branchId,
    thresholdMinutes,
    triggerMode: mode,
    actorRole: role,
    actorUserId: userId,
    actorEmail: email,
  });

  return res.status(200).json({
    deletedCount,
    thresholdMinutes,
    mode,
    deletedAt: new Date().toISOString(),
  });
}
