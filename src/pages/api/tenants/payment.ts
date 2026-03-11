import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders } from '../../../lib/tenantApi';

const PLAN_PRICES: Record<string, number> = {
  basic: 299000,
  pro: 599000,
};

function generateTransferCode(): string {
  // Tạo mã 6 ký tự chữ+số duy nhất: KD XXXXXX
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `KD${code}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { supabase, tenantId, userId } = tenant;

  // GET: Lấy đơn thanh toán pending hiện tại
  if (req.method === 'GET') {
    const { data: orders } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    // Lấy lịch sử thanh toán
    const { data: history } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(10);

    return res.status(200).json({
      pendingOrder: orders?.[0] || null,
      history: history || [],
    });
  }

  // POST: Tạo đơn thanh toán mới
  if (req.method === 'POST') {
    const { plan, months = 1 } = req.body;

    if (!plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Gói không hợp lệ. Chọn: basic hoặc pro' });
    }

    const monthCount = Math.min(Math.max(parseInt(months) || 1, 1), 12);
    const amount = PLAN_PRICES[plan] * monthCount;

    // Hủy các đơn pending cũ
    await supabase
      .from('payment_orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending');

    // Tạo mã chuyển khoản duy nhất (retry nếu trùng)
    let transferCode = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      transferCode = generateTransferCode();
      const { data: existing } = await supabase
        .from('payment_orders')
        .select('id')
        .eq('transfer_code', transferCode)
        .maybeSingle();
      if (!existing) break;
    }

    const { data: order, error } = await supabase
      .from('payment_orders')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        plan,
        amount,
        months: monthCount,
        transfer_code: transferCode,
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Không thể tạo đơn thanh toán: ' + error.message });
    }

    // Thông tin chuyển khoản
    const bankInfo = {
      bankId: '970415', // VietinBank
      bankName: 'VietinBank',
      accountNo: '101868077303',
      accountName: 'HOANG VAN DOANH',
    };

    const qrUrl = `https://img.vietqr.io/image/${bankInfo.bankId}-${bankInfo.accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferCode)}&accountName=${encodeURIComponent(bankInfo.accountName)}`;

    return res.status(201).json({
      order,
      bankInfo,
      qrUrl,
      transferContent: transferCode,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
