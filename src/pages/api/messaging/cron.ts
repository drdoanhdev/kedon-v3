/**
 * Cron worker — xử lý hàng đợi message_jobs.
 *
 * Cách kích hoạt (chọn 1):
 *  - Vercel Cron (`vercel.json` schedule)
 *  - GitHub Actions / cron-job.org gọi GET https://yourapp/api/messaging/cron với header
 *      x-cron-secret: <MESSAGING_CRON_SECRET>
 *  - Trên server tự host, dùng node-cron hoặc systemd timer.
 *
 * Mỗi lần chạy:
 *  - Lấy tối đa BATCH_SIZE job pending tới hạn.
 *  - Đối với mỗi job: refresh token nếu cần → gọi Zalo API → cập nhật trạng thái + log.
 *  - Có rate limit cơ bản qua sleep nhỏ giữa các job (tránh đập API quá nhanh).
 *
 * KHÔNG chạy chung process với UI: process Next.js phục vụ user, worker chỉ là endpoint thuần API.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/tenantApi';
import { decryptObject, encryptObject } from '../../../lib/messaging/crypto';
import {
  refreshAccessToken,
  sendConsultMessage,
  sendZnsTemplate,
  normalizeVNPhone,
  getZaloEnv,
} from '../../../lib/messaging/zalo';

const BATCH_SIZE = 50;
const REFRESH_BEFORE_SEC = 300;       // refresh nếu còn dưới 5 phút
const RETRY_BACKOFF_SEC = [60, 600, 3600]; // 1ph / 10ph / 1h

interface JobRow {
  id: number;
  tenant_id: string;
  channel: 'zalo_oa' | 'sms_http';
  recipient_phone: string;
  recipient_name: string | null;
  message_text: string;
  zns_template_id: string | null;
  zns_params: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  appointment_id: number | null;
}

interface ChannelRow {
  tenant_id: string;
  provider: string;
  status: string;
  credentials: Record<string, unknown> | null;
  expires_at: string | null;
  daily_limit: number;
  monthly_limit: number;
}

async function getOrRefreshZaloToken(channel: ChannelRow): Promise<{ token: string; error?: string }> {
  const creds = (channel.credentials || {}) as Record<string, unknown>;
  // pending là PKCE state, KHÔNG phải credential thật
  const cipher = { ...creds };
  delete cipher.pending;
  if (!cipher.iv || !cipher.tag || !cipher.data) {
    return { token: '', error: 'Chưa kết nối hoặc credential trống' };
  }
  let plain: { access_token: string; refresh_token: string };
  try {
    plain = decryptObject<{ access_token: string; refresh_token: string }>(cipher as never);
  } catch (err) {
    return { token: '', error: 'Lỗi giải mã token: ' + (err instanceof Error ? err.message : String(err)) };
  }

  // Còn hạn?
  const expiresAt = channel.expires_at ? new Date(channel.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + REFRESH_BEFORE_SEC * 1000) {
    return { token: plain.access_token };
  }

  // Cần refresh
  try {
    getZaloEnv();
    const refreshed = await refreshAccessToken(plain.refresh_token);
    const newCipher = encryptObject({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || plain.refresh_token,
    });
    const newExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();

    await supabaseAdmin
      .from('clinic_messaging_channels')
      .update({
        credentials: newCipher,
        expires_at: newExpiresAt,
        last_refreshed_at: new Date().toISOString(),
        status: 'connected',
        last_error: null,
      })
      .eq('tenant_id', channel.tenant_id)
      .eq('provider', channel.provider);

    return { token: refreshed.access_token };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from('clinic_messaging_channels')
      .update({ status: 'expired', last_error: msg })
      .eq('tenant_id', channel.tenant_id)
      .eq('provider', channel.provider);
    return { token: '', error: msg };
  }
}

async function logResult(
  job: JobRow,
  status: 'sent' | 'failed',
  request_meta: unknown,
  response_meta: unknown,
  errorMsg?: string
) {
  await supabaseAdmin.from('message_logs').insert({
    tenant_id: job.tenant_id,
    job_id: job.id,
    channel: job.channel,
    recipient_phone: job.recipient_phone,
    status,
    request_meta,
    response_meta,
    error_message: errorMsg || null,
  });
}

async function processOneJob(job: JobRow): Promise<void> {
  // Lấy channel của tenant cho đúng provider
  const { data: channel } = await supabaseAdmin
    .from('clinic_messaging_channels')
    .select('tenant_id, provider, status, credentials, expires_at, daily_limit, monthly_limit, auto_send')
    .eq('tenant_id', job.tenant_id)
    .eq('provider', job.channel)
    .maybeSingle();

  if (!channel || !channel.auto_send) {
    await supabaseAdmin
      .from('message_jobs')
      .update({ status: 'skipped', error_message: 'Channel chưa bật auto_send' })
      .eq('id', job.id);
    return;
  }

  // Daily quota
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const { count: sentToday } = await supabaseAdmin
    .from('message_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', job.tenant_id)
    .eq('channel', job.channel)
    .eq('status', 'sent')
    .gte('sent_at', dayStart.toISOString());
  if ((sentToday || 0) >= channel.daily_limit) {
    // Hoãn sang ngày mai 00:05
    const tomorrow = new Date(dayStart.getTime() + 86400000 + 5 * 60000);
    await supabaseAdmin
      .from('message_jobs')
      .update({ status: 'pending', run_at: tomorrow.toISOString(), error_message: 'Đạt daily_limit, hoãn' })
      .eq('id', job.id);
    return;
  }

  if (job.channel === 'zalo_oa') {
    const { token, error } = await getOrRefreshZaloToken(channel as ChannelRow);
    if (!token) {
      await markFailed(job, error || 'Không lấy được access_token');
      return;
    }

    let result;
    if (job.zns_template_id) {
      result = await sendZnsTemplate(
        token,
        job.recipient_phone,
        job.zns_template_id,
        (job.zns_params as Record<string, unknown>) || { content: job.message_text }
      );
    } else {
      // Consult message dùng user_id; nếu chưa có user_id Zalo, đành ghi error rõ ràng
      // (Phase 1: hướng dẫn user dùng ZNS template cho proactive messaging)
      result = {
        ok: false,
        error: 'Tin chủ động cần ZNS template_id; vui lòng cấu hình zns_template_id trong workflow.',
      } as const;
    }

    if (result.ok) {
      await supabaseAdmin
        .from('message_jobs')
        .update({
          status: 'sent',
          provider_message_id: result.messageId || null,
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', job.id);
      await logResult(job, 'sent', { phone: normalizeVNPhone(job.recipient_phone) }, result.raw);
    } else {
      await markFailed(job, result.error || 'Gửi Zalo thất bại');
      await logResult(job, 'failed', { phone: normalizeVNPhone(job.recipient_phone) }, result.raw, result.error);
    }
    return;
  }

  if (job.channel === 'sms_http') {
    // Phase 1: chưa tích hợp provider cụ thể — đánh dấu lỗi rõ ràng để user biết
    await markFailed(job, 'SMS provider chưa được cấu hình trong Phase 1');
    return;
  }
}

async function markFailed(job: JobRow, errorMsg: string) {
  const nextAttempt = job.attempts + 1;
  if (nextAttempt >= job.max_attempts) {
    await supabaseAdmin
      .from('message_jobs')
      .update({
        status: 'failed',
        attempts: nextAttempt,
        error_message: errorMsg.slice(0, 500),
      })
      .eq('id', job.id);
  } else {
    const backoff = RETRY_BACKOFF_SEC[Math.min(nextAttempt, RETRY_BACKOFF_SEC.length - 1)];
    const nextRun = new Date(Date.now() + backoff * 1000).toISOString();
    await supabaseAdmin
      .from('message_jobs')
      .update({
        status: 'pending',
        attempts: nextAttempt,
        next_retry_at: nextRun,
        run_at: nextRun,
        error_message: errorMsg.slice(0, 500),
      })
      .eq('id', job.id);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  // Bảo vệ endpoint bằng secret để chỉ cron mới gọi được
  const secret = process.env.MESSAGING_CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ message: 'MESSAGING_CRON_SECRET chưa được cấu hình' });
  }
  const provided =
    (req.headers['x-cron-secret'] as string) ||
    (req.query.secret as string) ||
    '';
  if (provided !== secret) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const workerId = `cron-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();

  // Lock 1 batch job pending tới hạn (đặt processing để tránh worker khác lấy trùng)
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('message_jobs')
    .select('id, tenant_id, channel, recipient_phone, recipient_name, message_text, zns_template_id, zns_params, attempts, max_attempts, appointment_id')
    .eq('status', 'pending')
    .lte('run_at', now)
    .order('run_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (claimErr) return res.status(500).json({ message: claimErr.message });
  if (!claimed || claimed.length === 0) {
    return res.status(200).json({ processed: 0, message: 'Không có job tới hạn' });
  }

  const ids = claimed.map((c) => c.id);
  const { error: lockErr } = await supabaseAdmin
    .from('message_jobs')
    .update({ status: 'processing', locked_at: now, locked_by: workerId })
    .in('id', ids)
    .eq('status', 'pending');
  if (lockErr) return res.status(500).json({ message: lockErr.message });

  let okCount = 0;
  let failCount = 0;
  for (const j of claimed as JobRow[]) {
    try {
      await processOneJob(j);
      okCount++;
    } catch (err) {
      failCount++;
      await markFailed(j, err instanceof Error ? err.message : String(err));
    }
    // Rate limit nhẹ: 100ms/job
    await new Promise((r) => setTimeout(r, 100));
  }

  return res.status(200).json({
    processed: claimed.length,
    okCount,
    failCount,
    workerId,
  });
}
