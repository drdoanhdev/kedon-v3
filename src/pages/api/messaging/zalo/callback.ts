/**
 * GET /api/messaging/zalo/callback?code=...&state=...
 * Zalo redirect về đây sau khi user cấp quyền OA.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../../lib/tenantApi';
import {
  exchangeCodeForToken,
  fetchOAProfile,
  getZaloEnv,
} from '../../../../lib/messaging/zalo';
import { encryptObject } from '../../../../lib/messaging/crypto';

function html(message: string, ok = true): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"/>
<title>Kết nối Zalo OA</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
.box{background:#fff;border-radius:12px;padding:32px;max-width:480px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,.06);text-align:center}
.icon{font-size:48px;margin-bottom:12px}
h1{font-size:18px;margin:8px 0 12px;color:${ok ? '#059669' : '#dc2626'}}
p{color:#4b5563;margin:0 0 16px;font-size:14px;line-height:1.5}
button{background:#2563eb;color:#fff;border:0;padding:10px 18px;border-radius:8px;cursor:pointer;font-size:14px}
</style></head><body>
<div class="box">
<div class="icon">${ok ? '✅' : '⚠️'}</div>
<h1>${ok ? 'Kết nối Zalo OA thành công' : 'Kết nối thất bại'}</h1>
<p>${message}</p>
<button onclick="window.close();window.opener&&window.opener.postMessage({type:'zalo-oauth',ok:${ok}},'*')">Đóng cửa sổ</button>
</div>
<script>setTimeout(()=>{try{window.opener&&window.opener.postMessage({type:'zalo-oauth',ok:${ok}},'*')}catch(e){}},300)</script>
</body></html>`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end();
  }

  const code = (req.query.code as string) || '';
  const state = (req.query.state as string) || '';
  const errorParam = (req.query.error as string) || '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (errorParam) {
    return res.status(200).send(html(`Zalo trả lỗi: ${errorParam}`, false));
  }
  if (!code || !state) {
    return res.status(400).send(html('Thiếu mã code hoặc state.', false));
  }

  // state có dạng "<tenantId>.<token>"
  const [tenantId] = state.split('.');
  if (!tenantId) return res.status(400).send(html('State không hợp lệ.', false));

  try {
    getZaloEnv();
  } catch (err) {
    return res.status(500).send(html(err instanceof Error ? err.message : 'Lỗi cấu hình Zalo', false));
  }

  // Lấy pending state đã lưu khi tạo connect-url
  const { data: channel } = await supabaseAdmin
    .from('clinic_messaging_channels')
    .select('credentials')
    .eq('tenant_id', tenantId)
    .eq('provider', 'zalo_oa')
    .maybeSingle();

  const pending = (channel?.credentials as Record<string, unknown> | null)?.pending as
    | { state?: string; codeVerifier?: string; expiresAt?: number }
    | undefined;

  if (!pending || pending.state !== state || !pending.codeVerifier) {
    return res.status(400).send(html('Phiên kết nối đã hết hạn. Vui lòng thử lại.', false));
  }
  if (pending.expiresAt && pending.expiresAt < Date.now()) {
    return res.status(400).send(html('Phiên kết nối đã hết hạn. Vui lòng thử lại.', false));
  }

  // Đổi code lấy access_token
  let token;
  try {
    token = await exchangeCodeForToken(code, pending.codeVerifier);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi đổi token';
    await supabaseAdmin
      .from('clinic_messaging_channels')
      .update({ status: 'error', last_error: msg, credentials: {} })
      .eq('tenant_id', tenantId)
      .eq('provider', 'zalo_oa');
    return res.status(200).send(html(msg, false));
  }

  // Lấy thông tin OA
  const profile = await fetchOAProfile(token.access_token);

  const expiresAt = new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString();

  const encrypted = encryptObject({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
  });

  const { error: upErr } = await supabaseAdmin
    .from('clinic_messaging_channels')
    .update({
      status: 'connected',
      external_id: profile?.oa_id || token.oa_id || null,
      display_name: profile?.name || null,
      avatar_url: profile?.avatar || null,
      credentials: encrypted,
      expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('tenant_id', tenantId)
    .eq('provider', 'zalo_oa');

  if (upErr) {
    return res.status(500).send(html('Lỗi lưu cấu hình: ' + upErr.message, false));
  }

  return res.status(200).send(html('Đã kết nối Zalo OA. Bạn có thể đóng cửa sổ này.', true));
}
