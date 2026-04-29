/**
 * GET    /api/messaging/channels       — danh sách kênh đã cấu hình của tenant
 * PATCH  /api/messaging/channels       — cập nhật auto_send / daily_limit / monthly_limit
 * DELETE /api/messaging/channels?provider=zalo_oa — ngắt kết nối
 *
 * Trường `credentials` KHÔNG bao giờ trả về client.
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

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'messaging_automation', 'manage_messaging'))) return;

  const { tenantId } = ctx;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('clinic_messaging_channels')
      .select('id, provider, external_id, display_name, avatar_url, status, last_error, expires_at, last_refreshed_at, auto_send, daily_limit, monthly_limit, rate_per_minute, connected_at, updated_at')
      .eq('tenant_id', tenantId);

    if (error) return res.status(500).json({ message: error.message });
    return res.status(200).json({ data: data || [] });
  }

  if (req.method === 'PATCH') {
    const { provider, auto_send, daily_limit, monthly_limit, rate_per_minute } = req.body || {};
    if (!provider) return res.status(400).json({ message: 'Thiếu provider' });

    const update: Record<string, unknown> = {};
    if (typeof auto_send === 'boolean') update.auto_send = auto_send;
    if (typeof daily_limit === 'number' && daily_limit >= 0) update.daily_limit = daily_limit;
    if (typeof monthly_limit === 'number' && monthly_limit >= 0) update.monthly_limit = monthly_limit;
    if (typeof rate_per_minute === 'number' && rate_per_minute >= 1) update.rate_per_minute = rate_per_minute;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Không có trường nào để cập nhật' });
    }

    const { data, error } = await supabaseAdmin
      .from('clinic_messaging_channels')
      .update(update)
      .eq('tenant_id', tenantId)
      .eq('provider', provider)
      .select('id, provider, auto_send, daily_limit, monthly_limit, rate_per_minute, status')
      .single();

    if (error) return res.status(400).json({ message: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'DELETE') {
    const provider = (req.query.provider as string) || '';
    if (!provider) return res.status(400).json({ message: 'Thiếu provider' });

    const { error } = await supabaseAdmin
      .from('clinic_messaging_channels')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('provider', provider);

    if (error) return res.status(400).json({ message: error.message });
    return res.status(200).json({ message: 'Đã ngắt kết nối' });
  }

  res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
  return res.status(405).end();
}
