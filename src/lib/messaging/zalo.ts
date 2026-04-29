/**
 * Zalo Official Account OAuth2 + Send Message helper.
 *
 * Flow tham chiếu: https://developers.zalo.me/docs/api/official-account-api
 * - Authorization endpoint: https://oauth.zaloapp.com/v4/oa/permission
 * - Token endpoint:        https://oauth.zaloapp.com/v4/oa/access_token
 * - Send message endpoint: https://openapi.zalo.me/v3.0/oa/message/cs (consultation)
 *                          https://business.openapi.zalo.me/message/template (ZNS)
 *
 * Lưu ý: app cần đăng ký 1 Zalo App duy nhất, mỗi tenant nối OA riêng qua OAuth.
 */

const AUTH_URL = 'https://oauth.zaloapp.com/v4/oa/permission';
const TOKEN_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
const SEND_CS_URL = 'https://openapi.zalo.me/v3.0/oa/message/cs';
const ZNS_URL = 'https://business.openapi.zalo.me/message/template';

export interface ZaloAppEnv {
  appId: string;
  secretKey: string;
  redirectUri: string;
}

export function getZaloEnv(): ZaloAppEnv {
  const appId = process.env.ZALO_APP_ID || '';
  const secretKey = process.env.ZALO_APP_SECRET || '';
  const redirectUri = process.env.ZALO_REDIRECT_URI || '';
  if (!appId || !secretKey || !redirectUri) {
    throw new Error('Thiếu cấu hình Zalo App: ZALO_APP_ID / ZALO_APP_SECRET / ZALO_REDIRECT_URI');
  }
  return { appId, secretKey, redirectUri };
}

/**
 * Tạo URL chuyển hướng người dùng đến trang Zalo cấp quyền cho OA.
 * state: dùng chứa tenant_id + nonce để tránh CSRF.
 */
export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const env = getZaloEnv();
  const params = new URLSearchParams({
    app_id: env.appId,
    redirect_uri: env.redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface ZaloTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;        // giây
  oa_id?: string;
  error?: number;
  error_name?: string;
  error_description?: string;
}

async function postForm(url: string, params: Record<string, string>, secretKey: string): Promise<ZaloTokenResponse> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: secretKey,
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as ZaloTokenResponse;
  if (!res.ok || json.error) {
    throw new Error(`Zalo OAuth lỗi: ${json.error_description || json.error_name || res.statusText}`);
  }
  return json;
}

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<ZaloTokenResponse> {
  const env = getZaloEnv();
  return postForm(TOKEN_URL, {
    code,
    app_id: env.appId,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  }, env.secretKey);
}

export async function refreshAccessToken(refreshToken: string): Promise<ZaloTokenResponse> {
  const env = getZaloEnv();
  return postForm(TOKEN_URL, {
    refresh_token: refreshToken,
    app_id: env.appId,
    grant_type: 'refresh_token',
  }, env.secretKey);
}

export interface ZaloOAProfile {
  oa_id: string;
  name?: string;
  avatar?: string;
}

/** Gọi /oa/profile để lấy thông tin OA (sau khi vừa kết nối). */
export async function fetchOAProfile(accessToken: string): Promise<ZaloOAProfile | null> {
  try {
    const res = await fetch('https://openapi.zalo.me/v2.0/oa/getoa', {
      headers: { access_token: accessToken },
    });
    const json = await res.json();
    if (json && json.data) {
      return {
        oa_id: String(json.data.oa_id || ''),
        name: json.data.name,
        avatar: json.data.avatar,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export interface SendCsResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  raw?: unknown;
}

/**
 * Gửi tin nhắn dạng "consultation" (CS) — chỉ gửi được trong window 7 ngày sau khi
 * người dùng tương tác với OA. Phù hợp cho các tin nhắn nhắc hẹn ngắn hạn.
 *
 * Nếu cần gửi chủ động (proactive) ngoài cửa sổ 7 ngày, dùng ZNS template
 * (sendZnsTemplate) — yêu cầu template đã được Zalo duyệt.
 */
export async function sendConsultMessage(
  accessToken: string,
  recipientUserId: string,
  text: string
): Promise<SendCsResult> {
  try {
    const res = await fetch(SEND_CS_URL, {
      method: 'POST',
      headers: {
        access_token: accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { user_id: recipientUserId },
        message: { text },
      }),
    });
    const json = await res.json();
    if (json && json.error === 0) {
      return { ok: true, messageId: json?.data?.message_id, raw: json };
    }
    return { ok: false, error: json?.message || `HTTP ${res.status}`, raw: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Gửi ZNS template (Zalo Notification Service) — chủ động được, theo template đã duyệt.
 * @param phone số điện thoại E.164 hoặc local 0xx (Zalo nhận được "84xxxx").
 */
export async function sendZnsTemplate(
  accessToken: string,
  phone: string,
  templateId: string,
  templateData: Record<string, unknown>
): Promise<SendCsResult> {
  const normalized = normalizeVNPhone(phone);
  try {
    const res = await fetch(ZNS_URL, {
      method: 'POST',
      headers: {
        access_token: accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: normalized,
        template_id: templateId,
        template_data: templateData,
        tracking_id: `kedon-${Date.now()}`,
      }),
    });
    const json = await res.json();
    if (json && json.error === 0) {
      return { ok: true, messageId: json?.data?.msg_id, raw: json };
    }
    return { ok: false, error: json?.message || `HTTP ${res.status}`, raw: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function normalizeVNPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('84')) return digits;
  if (digits.startsWith('0')) return '84' + digits.slice(1);
  return digits;
}
