/**
 * POST /api/messaging/zalo/connect-url
 * Tạo URL OAuth + lưu code_verifier (PKCE) vào DB tạm (credentials.pending).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import {
  requireTenant,
  requireFeature,
  supabaseAdmin,
  setNoCacheHeaders,
} from '../../../../lib/tenantApi';
import { buildAuthorizeUrl, getZaloEnv } from '../../../../lib/messaging/zalo';

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'messaging_automation', 'manage_messaging'))) return;

  try {
    getZaloEnv();
  } catch (err) {
    return res.status(500).json({ message: err instanceof Error ? err.message : 'Lỗi cấu hình Zalo' });
  }

  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
  const stateToken = base64UrlEncode(crypto.randomBytes(24));
  const state = `${ctx.tenantId}.${stateToken}`;

  // Giữ lại credentials cũ (nếu reconnect)
  const { data: existing } = await supabaseAdmin
    .from('clinic_messaging_channels')
    .select('credentials, status, auto_send')
    .eq('tenant_id', ctx.tenantId)
    .eq('provider', 'zalo_oa')
    .maybeSingle();

  const currentCreds = (existing?.credentials as Record<string, unknown>) || {};

  const { error } = await supabaseAdmin.from('clinic_messaging_channels').upsert(
    {
      tenant_id: ctx.tenantId,
      provider: 'zalo_oa',
      status: existing?.status || 'disconnected',
      auto_send: existing?.auto_send ?? false,
      credentials: {
        ...currentCreds,
        pending: { state, codeVerifier, expiresAt: Date.now() + 10 * 60_000 },
      },
      connected_by: ctx.userId,
    },
    { onConflict: 'tenant_id,provider' }
  );
  if (error) return res.status(500).json({ message: error.message });

  const url = buildAuthorizeUrl(state, codeChallenge);
  return res.status(200).json({ url });
}
