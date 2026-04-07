/**
 * API kiểm tra trạng thái xác thực gói đăng ký
 * Frontend polling sau khi thanh toán để biết webhook đã validate & activate chưa
 * 
 * GET /api/tenants/validate-subscription?order=KDXXXXXX
 * 
 * Quy trình: Webhook → VALIDATE → Activate
 * Domain: OptiGo.vn
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { supabase, tenantId } = tenant;
  const transferCode = req.query.order as string;

  if (!transferCode) {
    return res.status(400).json({ error: 'Thiếu tham số order (mã chuyển khoản)' });
  }

  // Lấy đơn thanh toán
  const { data: order, error } = await supabase
    .from('payment_orders')
    .select('id, plan, amount, months, transfer_code, status, validated_at, paid_at, created_at, expires_at')
    .eq('tenant_id', tenantId)
    .eq('transfer_code', transferCode)
    .maybeSingle();

  if (error || !order) {
    return res.status(404).json({ error: 'Không tìm thấy đơn thanh toán' });
  }

  // Kiểm tra trạng thái
  let validationStatus: 'pending' | 'validated' | 'activated' | 'expired' | 'cancelled';

  if (order.status === 'paid' && order.validated_at) {
    validationStatus = 'activated'; // Webhook đã validate & activate (đầy đủ quy trình)
  } else if (order.status === 'paid') {
    validationStatus = 'activated'; // Đã paid (admin xác nhận thủ công)
  } else if (order.status === 'cancelled') {
    validationStatus = 'cancelled';
  } else if (order.expires_at && new Date(order.expires_at) < new Date()) {
    validationStatus = 'expired';
  } else {
    validationStatus = 'pending'; // Đang chờ webhook
  }

  // Lấy thông tin tenant plan hiện tại
  const { data: tenantData } = await supabase
    .from('tenants')
    .select('plan, plan_source, plan_expires_at, status')
    .eq('id', tenantId)
    .single();

  return res.status(200).json({
    order: {
      transferCode: order.transfer_code,
      plan: order.plan,
      amount: order.amount,
      months: order.months,
      status: order.status,
      validatedAt: order.validated_at,
      paidAt: order.paid_at,
    },
    validationStatus,
    tenant: tenantData ? {
      currentPlan: tenantData.plan,
      planSource: tenantData.plan_source,
      planExpiresAt: tenantData.plan_expires_at,
      status: tenantData.status,
    } : null,
  });
}
