import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders } from '../../../lib/tenantApi';
// @ts-ignore - sepay-pg-node may not have types
import { SePayPgClient } from 'sepay-pg-node';

const FALLBACK_PRICES: Record<string, number> = {
  basic: 299000,
  pro: 599000,
};

async function getPlanPrice(supabase: any, planKey: string): Promise<number | null> {
  try {
    const { data } = await supabase
      .from('subscription_plans')
      .select('price')
      .eq('plan_key', planKey)
      .eq('is_active', true)
      .maybeSingle();
    if (data) return data.price;
  } catch {}
  return FALLBACK_PRICES[planKey] ?? null;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.optigo.vn';

function getSePayClient() {
  return new SePayPgClient({
    env: (process.env.SEPAY_ENV || 'sandbox') as 'sandbox' | 'production',
    merchant_id: process.env.SEPAY_MERCHANT_ID!,
    secret_key: process.env.SEPAY_SECRET_KEY!,
  });
}

function generateTransferCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `KD${code}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { supabase, tenantId, userId } = tenant;
  const { plan, months = 1 } = req.body;

  const planPrice = await getPlanPrice(supabase, plan);
  if (!plan || planPrice === null) {
    return res.status(400).json({ error: 'Gói không hợp lệ. Chọn: basic hoặc pro' });
  }

  const monthCount = Math.min(Math.max(parseInt(months) || 1, 1), 12);
  const amount = planPrice * monthCount;

  // Hủy các đơn pending cũ
  await supabase
    .from('payment_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending');

  // Tạo mã chuyển khoản duy nhất
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

  // Tạo đơn thanh toán trong DB
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

  // Tạo SePay checkout URL
  try {
    const client = getSePayClient();
    const checkoutURL = client.checkout.initCheckoutUrl();
    const planName = plan === 'pro' ? 'Chuyen nghiep' : 'Co ban';
    const description = `Thanh toan goi ${planName} ${monthCount} thang - ${transferCode}`;

    const checkoutFields = client.checkout.initOneTimePaymentFields({
      payment_method: 'BANK_TRANSFER',
      order_invoice_number: transferCode,
      order_amount: amount,
      currency: 'VND',
      order_description: description,
      success_url: `${APP_URL}/billing?payment=success&order=${transferCode}`,
      error_url: `${APP_URL}/billing?payment=error&order=${transferCode}`,
      cancel_url: `${APP_URL}/billing?payment=cancel&order=${transferCode}`,
    });

    return res.status(201).json({
      order,
      checkoutURL,
      checkoutFields,
      transferCode,
    });
  } catch (err: any) {
    console.error('SePay checkout error:', err);
    return res.status(500).json({ error: 'Không thể tạo link thanh toán SePay: ' + (err.message || 'Unknown error') });
  }
}
