/**
 * API Admin: Quản lý thanh toán cross-tenant
 * GET  — Danh sách tất cả đơn thanh toán (pending/paid)
 * PUT  — Xác nhận thanh toán thủ công (khi webhook lỗi)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '../../../lib/adminGuard';
import { supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  // GET: Danh sách đơn thanh toán
  if (req.method === 'GET') {
    try {
      const status = (req.query.status as string) || 'all';
      let query = supabaseAdmin
        .from('payment_orders')
        .select('*, tenants!inner(name, code)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        return res.status(500).json({ message: 'Lỗi lấy danh sách thanh toán', error: error.message });
      }

      return res.status(200).json({ data: data || [] });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  // PUT: Xác nhận thanh toán thủ công
  if (req.method === 'PUT') {
    try {
      const { orderId, action } = req.body;

      if (!orderId) {
        return res.status(400).json({ message: 'Thiếu orderId' });
      }

      // Lấy thông tin đơn
      const { data: order, error: fetchErr } = await supabaseAdmin
        .from('payment_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchErr || !order) {
        return res.status(404).json({ message: 'Không tìm thấy đơn thanh toán' });
      }

      if (action === 'confirm') {
        // Xác nhận thanh toán
        await supabaseAdmin
          .from('payment_orders')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);

        // Kích hoạt gói cho tenant
        const now = new Date();
        const { data: tenant } = await supabaseAdmin
          .from('tenants')
          .select('plan_expires_at')
          .eq('id', order.tenant_id)
          .single();

        let expiresAt: Date;
        if (tenant?.plan_expires_at && new Date(tenant.plan_expires_at) > now) {
          expiresAt = new Date(tenant.plan_expires_at);
        } else {
          expiresAt = new Date(now);
        }
        expiresAt.setMonth(expiresAt.getMonth() + (order.months || 1));

        await supabaseAdmin
          .from('tenants')
          .update({
            plan: order.plan,
            plan_expires_at: expiresAt.toISOString(),
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.tenant_id);

        return res.status(200).json({ message: `Đã xác nhận thanh toán và kích hoạt gói ${order.plan}` });
      }

      if (action === 'cancel') {
        await supabaseAdmin
          .from('payment_orders')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);

        return res.status(200).json({ message: 'Đã hủy đơn thanh toán' });
      }

      return res.status(400).json({ message: 'action phải là "confirm" hoặc "cancel"' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
