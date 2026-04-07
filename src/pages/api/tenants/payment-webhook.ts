/**
 * Webhook nhận thông báo giao dịch ngân hàng từ dịch vụ bên thứ 3
 * (Casso, SePay, PayOS, hoặc tương đương)
 * 
 * Quy trình 3 bước: Webhook → VALIDATE → Activate
 * 
 * Bước 1 — WEBHOOK: Nhận & log payload gốc vào webhook_logs
 * Bước 2 — VALIDATE: Xác thực transfer_code, số tiền, hạn đơn, tenant hợp lệ
 * Bước 3 — ACTIVATE: Kích hoạt gói cho tenant (chỉ khi validation pass)
 * 
 * Domain: OptiGo.vn
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

// ===== BƯỚC 1: PARSE — Trích xuất giao dịch từ payload =====

function detectSource(body: any): 'casso' | 'sepay' | 'generic' {
  if (body.data && Array.isArray(body.data)) return 'casso';
  if (body.transferType) return 'sepay';
  return 'generic';
}

function extractTransferCode(description: string): string | null {
  const match = description.toUpperCase().match(/KD[A-Z0-9]{6}/);
  return match ? match[0] : null;
}

function parseCassoPayload(body: any): BankTransaction[] {
  if (body.data && Array.isArray(body.data)) {
    return body.data
      .filter((t: any) => t.amount > 0)
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

function parseTransactions(body: any): BankTransaction[] {
  const source = detectSource(body);
  if (source === 'casso') return parseCassoPayload(body);
  if (source === 'sepay') return parseSePayPayload(body);
  // Generic
  if (body.amount && body.description) {
    return [{
      amount: body.amount,
      description: body.description,
      when: body.when || new Date().toISOString(),
      bankRef: body.bankRef || body.referenceCode,
    }];
  }
  return [];
}

// ===== BƯỚC 1.5: LOG — Ghi webhook vào DB để audit =====

async function logWebhook(
  source: string,
  rawPayload: any,
  transferCode: string | null,
  amount: number | null,
  bankRef: string | null
): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        source,
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
    console.error('⚠️ Không thể ghi webhook_logs:', err);
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
    console.error('⚠️ Không thể cập nhật webhook_logs:', err);
  }
}

// ===== BƯỚC 2: VALIDATE — Xác thực toàn diện =====

/**
 * Tìm đơn thanh toán pending phù hợp với giao dịch.
 * 
 * Chiến lược matching (theo thứ tự ưu tiên):
 * 1. SePay PAY code: webhook có field `code` = "PAYxxx", match với `sepay_order_id`
 * 2. Exact KD code: tìm mã KD + 6 ký tự trong content/description
 * 3. Amount fallback: match theo số tiền chính xác + đơn pending chưa hết hạn
 */
async function findMatchingOrder(tx: BankTransaction, sepayCode?: string): Promise<{ order: any; matchMethod: string } | null> {
  const now = new Date().toISOString();

  // Thử 1: Match bằng mã PAY từ SePay
  if (sepayCode) {
    const { data: order } = await supabaseAdmin
      .from('payment_orders')
      .select('*')
      .eq('sepay_order_id', sepayCode)
      .eq('status', 'pending')
      .maybeSingle();
    if (order) {
      return { order, matchMethod: `SePay code: ${sepayCode}` };
    }
  }

  // Thử 2: Match bằng mã KD
  const transferCode = extractTransferCode(tx.description);
  if (transferCode) {
    const { data: order } = await supabaseAdmin
      .from('payment_orders')
      .select('*')
      .eq('transfer_code', transferCode)
      .eq('status', 'pending')
      .maybeSingle();
    if (order) {
      return { order, matchMethod: `KD code: ${transferCode}` };
    }
  }

  // Thử 3: Match bằng số tiền cho đơn pending
  const { data: orders } = await supabaseAdmin
    .from('payment_orders')
    .select('*')
    .eq('status', 'pending')
    .eq('amount', tx.amount)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1);

  if (orders && orders.length > 0) {
    return { order: orders[0], matchMethod: `Amount match: ${tx.amount.toLocaleString()}đ` };
  }

  return null;
}

async function validateTransaction(tx: BankTransaction, sepayCode?: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const transferCode = extractTransferCode(tx.description);

  // Tìm đơn matching (SePay code → KD code → amount)
  const match = await findMatchingOrder(tx, sepayCode);

  if (!match) {
    if (!transferCode) {
      errors.push('Không tìm thấy mã KD trong nội dung và không match được đơn pending nào theo số tiền');
    } else {
      errors.push(`Không tìm thấy đơn pending với mã ${transferCode}`);
    }
    return { valid: false, errors, transferCode: transferCode || undefined };
  }

  const order = match.order;
  console.log(`🔍 [OptiGo.vn] Matched order ${order.transfer_code} via ${match.matchMethod}`);

  // 2.3 Kiểm tra đơn chưa hết hạn (24h)
  if (order.expires_at && new Date(order.expires_at) < new Date()) {
    errors.push(`Đơn ${order.transfer_code} đã hết hạn thanh toán (quá 24h)`);
    return { valid: false, errors, transferCode: order.transfer_code, order };
  }

  // 2.4 Kiểm tra số tiền (cho phép sai lệch ±1%)
  const tolerance = order.amount * 0.01;
  if (tx.amount < order.amount - tolerance) {
    errors.push(
      `Số tiền không khớp: nhận ${tx.amount.toLocaleString()}đ, cần ${order.amount.toLocaleString()}đ (±1%)`
    );
    return { valid: false, errors, transferCode: order.transfer_code, order };
  }

  // 2.5 Kiểm tra tenant tồn tại và hợp lệ
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, name, status')
    .eq('id', order.tenant_id)
    .single();

  if (tenantErr || !tenant) {
    errors.push(`Tenant ${order.tenant_id} không tồn tại`);
    return { valid: false, errors, transferCode: order.transfer_code, order };
  }

  // 2.6 Kiểm tra plan hợp lệ
  const validPlans = ['basic', 'pro', 'enterprise'];
  if (!validPlans.includes(order.plan)) {
    errors.push(`Gói "${order.plan}" không hợp lệ`);
    return { valid: false, errors, transferCode: order.transfer_code, order };
  }

  // 2.7 Kiểm tra months hợp lệ
  if (!order.months || order.months < 1 || order.months > 12) {
    errors.push(`Số tháng ${order.months} không hợp lệ (1-12)`);
    return { valid: false, errors, transferCode: order.transfer_code, order };
  }

  // ✅ Tất cả validation passed
  return { valid: true, errors: [], order, transferCode: order.transfer_code };
}

// ===== BƯỚC 3: ACTIVATE — Kích hoạt gói sau khi validation pass =====

async function activatePlan(
  orderId: string,
  tenantId: string,
  plan: string,
  months: number,
  txWhen: string,
  bankRef?: string
) {
  const now = new Date();

  // Đánh dấu đơn đã validated
  await supabaseAdmin
    .from('payment_orders')
    .update({
      validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  // Lấy ngày hết hạn hiện tại (nếu đang dùng gói trả phí, cộng dồn)
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

  // Cập nhật đơn thành paid
  await supabaseAdmin
    .from('payment_orders')
    .update({
      status: 'paid',
      paid_at: txWhen || new Date().toISOString(),
      bank_ref: bankRef || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  // Kích hoạt gói cho tenant
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
    `✅ [OptiGo.vn] Webhook→Validate→Activate: plan=${plan}, tenant=${tenantId}, expires=${expiresAt.toISOString()}`
  );
}

// ===== HANDLER CHÍNH =====

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Xác thực webhook secret (API Key)
  // SePay gửi header: "Authorization": "Apikey <API_KEY_CUA_BAN>"
  // Casso gửi header: "Authorization": "Bearer xxx" hoặc x-api-key
  if (WEBHOOK_SECRET) {
    const authHeader = req.headers.authorization || '';
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const apiKeyHeader = req.headers['x-api-key'] || '';
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    
    const secret = headerValue
      .replace(/^Apikey\s+/i, '')
      .replace(/^Bearer\s+/i, '')
      .trim();
    
    if (secret !== WEBHOOK_SECRET && apiKey !== WEBHOOK_SECRET) {
      console.warn('⛔ [OptiGo.vn] Webhook bị từ chối: sai API Key');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const source = detectSource(req.body);
    const transactions = parseTransactions(req.body);
    // SePay/Casso webhook payload có thể chứa field `code` = "PAYxxx"
    const sepayCode: string | undefined = req.body.code || undefined;

    console.log(`📩 [OptiGo.vn] Webhook nhận ${transactions.length} giao dịch từ ${source}, code=${sepayCode || 'none'}`);

    // Nếu không parse được giao dịch nào, vẫn log webhook gốc
    if (transactions.length === 0) {
      await logWebhook(source, req.body, null, null, null);
      return res.status(200).json({ success: true, processed: 0, message: 'Không có giao dịch hợp lệ' });
    }

    let processed = 0;
    const results: Array<{ transferCode: string | null; status: string; errors?: string[] }> = [];

    for (const tx of transactions) {
      const transferCode = extractTransferCode(tx.description);

      // BƯỚC 1: LOG webhook
      const logId = await logWebhook(source, req.body, transferCode, tx.amount, tx.bankRef || null);

      // BƯỚC 2: VALIDATE (tìm đơn bằng SePay PAY code → KD code → amount)
      const validation = await validateTransaction(tx, sepayCode);

      // Cập nhật log với transfer_code từ matched order (nếu match bằng amount)
      if (!transferCode && validation.transferCode && logId) {
        try {
          await supabaseAdmin
            .from('webhook_logs')
            .update({ transfer_code: validation.transferCode })
            .eq('id', logId);
        } catch {}
      }

      if (!validation.valid) {
        console.warn(
          `❌ [OptiGo.vn] Validation FAILED cho ${transferCode || 'unknown'}:`,
          validation.errors
        );

        // Cập nhật log với kết quả validation thất bại
        if (logId) {
          await updateWebhookLog(logId, 'invalid', validation.errors, validation.order?.id);
        }

        results.push({
          transferCode: validation.transferCode || null,
          status: 'invalid',
          errors: validation.errors,
        });
        continue;
      }

      // BƯỚC 3: ACTIVATE (chỉ khi validation pass)
      const order = validation.order!;

      try {
        await activatePlan(
          order.id,
          order.tenant_id,
          order.plan,
          order.months,
          tx.when,
          tx.bankRef
        );

        // Cập nhật log thành công
        if (logId) {
          await updateWebhookLog(logId, 'valid', [], order.id);
        }

        results.push({ transferCode: validation.transferCode!, status: 'activated' });
        processed++;
      } catch (activateErr: any) {
        console.error(`⚠️ [OptiGo.vn] Lỗi kích hoạt gói cho ${transferCode}:`, activateErr);

        if (logId) {
          await updateWebhookLog(logId, 'invalid', [`Lỗi kích hoạt: ${activateErr.message}`], order.id);
        }

        results.push({
          transferCode: validation.transferCode!,
          status: 'error',
          errors: [`Activation failed: ${activateErr.message}`],
        });
      }
    }

    console.log(`📊 [OptiGo.vn] Webhook xử lý xong: ${processed}/${transactions.length} thành công`);

    return res.status(200).json({ success: true, processed, total: transactions.length, results });
  } catch (error: any) {
    console.error('💥 [OptiGo.vn] Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
