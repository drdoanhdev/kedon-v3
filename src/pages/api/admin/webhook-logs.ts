/**
 * API Admin: Xem webhook logs để audit quy trình xác thực
 * GET /api/admin/webhook-logs — Danh sách webhook logs
 * 
 * Quy trình: Webhook → VALIDATE → Activate
 * Domain: OptiGo.vn
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '../../../lib/adminGuard';
import { supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const status = (req.query.status as string) || 'all';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('webhook_logs')
      .select('*, payment_orders(transfer_code, plan, amount, months, status, tenants(name))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') {
      query = query.eq('validation_status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({ message: 'Lỗi lấy webhook logs', error: error.message });
    }

    return res.status(200).json({
      data: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err: any) {
    return res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}
