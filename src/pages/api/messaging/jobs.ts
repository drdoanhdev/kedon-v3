/**
 * GET /api/messaging/jobs?status=&limit=
 * Trả danh sách job cho UI giám sát (50 dòng gần nhất).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireTenant,
  requireFeature,
  supabaseAdmin,
  setNoCacheHeaders,
} from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end();
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'messaging_automation', 'manage_messaging'))) return;

  const status = (req.query.status as string) || '';
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  let q = supabaseAdmin
    .from('message_jobs')
    .select('id, channel, recipient_phone, recipient_name, message_text, run_at, status, attempts, error_message, sent_at, created_at, appointment_id')
    .eq('tenant_id', ctx.tenantId)
    .order('id', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ message: error.message });

  // Đếm theo trạng thái
  const counts: Record<string, number> = { pending: 0, sent: 0, failed: 0, processing: 0, cancelled: 0, skipped: 0 };
  const { data: stats } = await supabaseAdmin
    .from('message_jobs')
    .select('status')
    .eq('tenant_id', ctx.tenantId)
    .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
  (stats || []).forEach((r) => {
    if (counts[r.status] !== undefined) counts[r.status]++;
  });

  return res.status(200).json({ data: data || [], counts });
}
