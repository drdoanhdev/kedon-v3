/**
 * SePay Webhook Endpoint
 * URL: POST /api/webhook/sepay
 * 
 * Đây là endpoint mà SePay gọi đến khi có giao dịch ngân hàng.
 * Route này forward sang handler chính ở /api/tenants/payment-webhook
 * 
 * Cấu hình trên SePay (my.sepay.vn/webhooks):
 *   - URL: https://app.optigo.vn/api/webhook/sepay
 *   - Là Webhooks xác thực thanh toán: Đúng
 *   - Kiểu chứng thực: API Key
 *   - API Key: (giá trị PAYMENT_WEBHOOK_SECRET trong .env)
 *   - Request Content type: application/json
 *   - Trạng thái: Kích hoạt
 * 
 * SePay gửi header: "Authorization": "Apikey <API_KEY>"
 * 
 * Quy trình: Webhook → VALIDATE → Activate
 * Domain: app.optigo.vn
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || '';

interface BankTransaction {
  amount: number;
  description: string;
  when: string;
  bankRef?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  order?: any;
  transferCode?: string;
}

// ===== PARSE =====

function extractTransferCode(description: string): string | null {
  const match = description.toUpperCase().match(/KD[A-Z0-9]{6}/);
  return match ? match[0] : null;
}

function parseSePayPayload(body: any): BankTransaction[] {
  // SePay format: { transferType: 'in', transferAmount, content, transactionDate, referenceCode, ... }
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

// ===== LOG =====

async function logWebhook(
  rawPayload: any,
  transferCode: string | null,
  amount: number | null,
  bankRef: string | null
): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        source: 'sepay',
        raw_payload: rawPayload,
        transfer_code: transferCode,
        amount,
        bank_ref: bankRef,
        validation_status: 'pending',
      })
      .select('id')
      .single();
    return data?.id || null;
  } catch (err) {
    console.error('⚠️ [OptiGo] Không thể ghi webhook_logs:', err);
    return null;
  }
}

async function updateWebhookLog(
  logId: string,
  status: 'valid' | 'invalid',
  errors: string[],
  orderId?: string
) {
  try {
    await supabaseAdmin
      .from('webhook_logs')
      .update({
        validation_status: status,
        validation_errors: errors.length > 0 ? errors : null,
        payment_order_id: orderId || null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId);
  } catch (err) {
    console.error('⚠️ [OptiGo] Không thể cập nhật webhook_logs:', err);
  }
}

// ===== VALIDATE =====

async function validateTransaction(tx: BankTransaction): Promise<ValidationResult> {
  const errors: string[] = [];

  const transferCode = extractTransferCode(tx.description);
  if (!transferCode) {
    errors.push('Không tìm thấy mã chuyển khoản (KD + 6 ký tự) trong nội dung');
    return { valid: false, errors };
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('payment_orders')
    .select('*')
    .eq('transfer_code', transferCode)
    .eq('status', 'pending')
    .maybeSingle();

  if (orderErr) {
    errors.push(`Lỗi truy vấn đơn: ${orderErr.message}`);
    return { valid: false, errors, transferCode };
  }

  if (!order) {
    errors.push(`Không tìm thấy đơn pending với mã ${transferCode}`);
    return { valid: false, errors, transferCode };
  }

  if (order.expires_at && new Date(order.expires_at) < new Date()) {
    errors.push(`Đơn ${transferCode} đã hết hạn thanh toán (quá 24h)`);
    return { valid: false, errors, transferCode, order };
  }

  const tolerance = order.amount * 0.01;
  if (tx.amount < order.amount - tolerance) {
    errors.push(
      `Số tiền không khớp: nhận ${tx.amount.toLocaleString()}đ, cần ${order.amount.toLocaleString()}đ (±1%)`
    );
    return { valid: false, errors, transferCode, order };
  }

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, name, status')
    .eq('id', order.tenant_id)
    .single();

  if (tenantErr || !tenant) {
    errors.push(`Tenant ${order.tenant_id} không tồn tại`);
    return { valid: false, errors, transferCode, order };
  }

  const validPlans = ['basic', 'pro', 'enterprise'];
  if (!validPlans.includes(order.plan)) {
    errors.push(`Gói "${order.plan}" không hợp lệ`);
    return { valid: false, errors, transferCode, order };
  }

  if (!order.months || order.months < 1 || order.months > 12) {
    errors.push(`Số tháng ${order.months} không hợp lệ (1-12)`);
    return { valid: false, errors, transferCode, order };
  }

  return { valid: true, errors: [], order, transferCode };
}

// ===== ACTIVATE =====

async function activatePlan(
  orderId: string,
  tenantId: string,
  plan: string,
  months: number,
  txWhen: string,
  bankRef?: string
) {
  const now = new Date();

  await supabaseAdmin
    .from('payment_orders')
    .update({
      validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan_expires_at')
    .eq('id', tenantId)
    .single();

  let expiresAt: Date;
  if (tenant?.plan_expires_at && new Date(tenant.plan_expires_at) > now) {
    expiresAt = new Date(tenant.plan_expires_at);
  } else {
    expiresAt = new Date(now);
  }
  expiresAt.setMonth(expiresAt.getMonth() + months);

  await supabaseAdmin
    .from('payment_orders')
    .update({
      status: 'paid',
      paid_at: txWhen || new Date().toISOString(),
      bank_ref: bankRef || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  await supabaseAdmin
    .from('tenants')
    .update({
      plan,
      plan_source: 'payment',
      plan_expires_at: expiresAt.toISOString(),
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId);

  console.log(
    `✅ [OptiGo] SePay Webhook→Validate→Activate: plan=${plan}, tenant=${tenantId}, expires=${expiresAt.toISOString()}`
  );
}

// ===== HANDLER =====

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Xác thực API Key từ SePay
  // SePay gửi header: "Authorization": "Apikey <API_KEY_CUA_BAN>"
  if (WEBHOOK_SECRET) {
    const authHeader = req.headers.authorization || '';
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    // Hỗ trợ cả: "Apikey xxx", "Bearer xxx", hoặc header x-api-key
    const apiKeyHeader = req.headers['x-api-key'] || '';
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    
    const secret = headerValue
      .replace(/^Apikey\s+/i, '')
      .replace(/^Bearer\s+/i, '')
      .trim();
    
    if (secret !== WEBHOOK_SECRET && apiKey !== WEBHOOK_SECRET) {
      console.warn('⛔ [OptiGo] SePay webhook bị từ chối: sai API Key');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const transactions = parseSePayPayload(req.body);

    console.log(`📩 [OptiGo] SePay webhook nhận ${transactions.length} giao dịch`);

    if (transactions.length === 0) {
      // Vẫn log payload gốc để debug
      await logWebhook(req.body, null, null, null);
      return res.status(200).json({ success: true, processed: 0, message: 'Không có giao dịch tiền vào' });
    }

    let processed = 0;
    const results: Array<{ transferCode: string | null; status: string; errors?: string[] }> = [];

    for (const tx of transactions) {
      const transferCode = extractTransferCode(tx.description);

      // BƯỚC 1: LOG
      const logId = await logWebhook(req.body, transferCode, tx.amount, tx.bankRef || null);

      // BƯỚC 2: VALIDATE
      const validation = await validateTransaction(tx);

      if (!validation.valid) {
        console.warn(`❌ [OptiGo] Validation FAILED cho ${transferCode || 'unknown'}:`, validation.errors);
        if (logId) {
          await updateWebhookLog(logId, 'invalid', validation.errors, validation.order?.id);
        }
        results.push({ transferCode: validation.transferCode || null, status: 'invalid', errors: validation.errors });
        continue;
      }

      // BƯỚC 3: ACTIVATE
      const order = validation.order!;
      try {
        await activatePlan(order.id, order.tenant_id, order.plan, order.months, tx.when, tx.bankRef);
        if (logId) {
          await updateWebhookLog(logId, 'valid', [], order.id);
        }
        results.push({ transferCode: validation.transferCode!, status: 'activated' });
        processed++;
      } catch (activateErr: any) {
        console.error(`⚠️ [OptiGo] Lỗi kích hoạt gói cho ${transferCode}:`, activateErr);
        if (logId) {
          await updateWebhookLog(logId, 'invalid', [`Lỗi kích hoạt: ${activateErr.message}`], order.id);
        }
        results.push({ transferCode: validation.transferCode!, status: 'error', errors: [`Activation failed: ${activateErr.message}`] });
      }
    }

    console.log(`📊 [OptiGo] SePay webhook xử lý xong: ${processed}/${transactions.length} thành công`);
    return res.status(200).json({ success: true, processed, total: transactions.length, results });
  } catch (error: any) {
    console.error('💥 [OptiGo] SePay webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
