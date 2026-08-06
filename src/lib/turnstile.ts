/**
 * Xác minh Cloudflare Turnstile server-side.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

export interface TurnstileVerifyResult {
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string | null
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, error: 'Turnstile chưa được cấu hình trên server' };
    }
    return { ok: true, skipped: true };
  }

  if (!token || typeof token !== 'string' || token.length < 10) {
    return { ok: false, error: 'Thiếu mã xác minh Turnstile' };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };

    if (data.success) {
      return { ok: true };
    }

    const codes = data['error-codes']?.join(', ') || 'unknown';
    return { ok: false, error: `Xác minh Turnstile thất bại (${codes})` };
  } catch {
    return { ok: false, error: 'Không thể kết nối dịch vụ Turnstile' };
  }
}
