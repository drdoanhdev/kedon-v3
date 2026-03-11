/**
 * Webhook nhận thông báo giao dịch ngân hàng từ dịch vụ bên thứ 3
 * (Casso, SePay, PayOS, hoặc tương đương)
 * 
 * Flow: Ngân hàng → Casso/SePay → POST webhook này → tự động kích hoạt gói
 * 
 * Hỗ trợ 2 format phổ biến:
 * 1. Casso format: { data: [{ description, amount, when, ... }] }
 * 2. SePay format: { transferType, content, transferAmount, ... }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Webhook secret để xác thực request (đặt trong env)
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || '';

const PLAN_PRICES: Record<string, number> = {
  basic: 299000,
  pro: 599000,
};

interface BankTransaction {
  amount: number;
  description: string;
  when: string;
  bankRef?: string;
}

function extractTransferCode(description: string): string | null {
  // Tìm pattern KD + 6 ký tự trong nội dung chuyển khoản
  const match = description.toUpperCase().match(/KD[A-Z0-9]{6}/);
  return match ? match[0] : null;
}

function parseCassoPayload(body: any): BankTransaction[] {
  if (body.data && Array.isArray(body.data)) {
    return body.data
      .filter((t: any) => t.amount > 0) // Chỉ lấy giao dịch nhận tiền
      .map((t: any) => ({
        amount: t.amount,
        description: t.description || '',
        when: t.when || new Date().toISOString(),
        bankRef: t.tid?.toString() || t.id?.toString(),
      }));
  }
  return [];
}

function parseSePayPayload(body: any): BankTransaction[] {
  if (body.transferType === 'in' && body.transferAmount > 0) {
    return [{
      amount: body.transferAmount,
      description: body.content || '',
      when: body.transactionDate || new Date().toISOString(),
      bankRef: body.referenceCode || body.id?.toString(),
    }];
  }
  return [];
}

async function activatePlan(tenantId: string, plan: string, months: number) {
  const now = new Date();
  
  // Lấy ngày hết hạn hiện tại (nếu đang dùng gói trả phí, cộng dồn)
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan_expires_at')
    .eq('id', tenantId)
    .single();

  let expiresAt: Date;
  if (tenant?.plan_expires_at && new Date(tenant.plan_expires_at) > now) {
    // Cộng dồn thời gian
    expiresAt = new Date(tenant.plan_expires_at);
  } else {
    expiresAt = new Date(now);
  }
  expiresAt.setMonth(expiresAt.getMonth() + months);

  await supabaseAdmin
    .from('tenants')
    .update({
      plan,
      plan_expires_at: expiresAt.toISOString(),
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId);

  console.log(`✅ Activated plan ${plan} for tenant ${tenantId}, expires: ${expiresAt.toISOString()}`);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Xác thực webhook secret
  if (WEBHOOK_SECRET) {
    const authHeader = req.headers.authorization || req.headers['x-api-key'] || '';
    const secret = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (secret.replace('Bearer ', '').replace('Apikey ', '') !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Parse transactions từ nhiều format
    let transactions: BankTransaction[] = [];

    if (req.body.data && Array.isArray(req.body.data)) {
      transactions = parseCassoPayload(req.body);
    } else if (req.body.transferType) {
      transactions = parseSePayPayload(req.body);
    } else {
      // Generic format
      if (req.body.amount && req.body.description) {
        transactions = [{
          amount: req.body.amount,
          description: req.body.description,
          when: req.body.when || new Date().toISOString(),
          bankRef: req.body.bankRef || req.body.referenceCode,
        }];
      }
    }

    let processed = 0;

    for (const tx of transactions) {
      const transferCode = extractTransferCode(tx.description);
      if (!transferCode) continue;

      // Tìm đơn thanh toán pending với mã này
      const { data: order } = await supabaseAdmin
        .from('payment_orders')
        .select('*')
        .eq('transfer_code', transferCode)
        .eq('status', 'pending')
        .maybeSingle();

      if (!order) continue;

      // Kiểm tra số tiền (cho phép sai lệch 1%)
      const tolerance = order.amount * 0.01;
      if (tx.amount < order.amount - tolerance) {
        console.warn(`⚠️ Payment ${transferCode}: amount ${tx.amount} < expected ${order.amount}`);
        continue;
      }

      // Cập nhật đơn thành paid
      await supabaseAdmin
        .from('payment_orders')
        .update({
          status: 'paid',
          paid_at: tx.when || new Date().toISOString(),
          bank_ref: tx.bankRef || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      // Kích hoạt gói
      await activatePlan(order.tenant_id, order.plan, order.months);
      processed++;
    }

    return res.status(200).json({ success: true, processed });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
