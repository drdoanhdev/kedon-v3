/**
 * Xác thực thiết bị nhận diện khuôn mặt (edge agent).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash, randomBytes } from 'crypto';
import { supabaseAdmin } from './tenantApi';
import { planHasFeature } from './featureConfig';
import { getRateLimitIp, rateLimit, resetRateLimit } from './rateLimit';

// Chống dò device token: giới hạn số lần xác thực thất bại theo IP.
const AUTH_FAIL_LIMIT = 20;
const AUTH_FAIL_WINDOW_MS = 5 * 60 * 1000;

export interface FaceDeviceContext {
  deviceId: string;
  tenantId: string;
  branchId: string | null;
  deviceLabel: string;
  tenantPlan: string;
  clientIp: string | null;
}

const TOKEN_PREFIX = 'fd_';

export function generateDeviceToken(): { token: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString('hex');
  const token = `${TOKEN_PREFIX}${raw}`;
  const hash = hashDeviceToken(token);
  const prefix = token.slice(0, 12);
  return { token, hash, prefix };
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[randomBytes(1)[0] % chars.length];
  }
  return code;
}

/** Placeholder prefix for pending_pair rows (must be unique per row). */
export function generatePendingTokenPrefix(): string {
  return `${TOKEN_PREFIX}${randomBytes(5).toString('hex').slice(0, 9)}`;
}

function getDeviceToken(req: NextApiRequest): string | null {
  const auth = req.headers.authorization;
  if (auth) {
    const val = Array.isArray(auth) ? auth[0] : auth;
    const parts = val.split(' ');
    if (parts.length >= 2 && parts[0].toLowerCase() === 'bearer') {
      const token = parts.slice(1).join(' ').trim();
      if (token.startsWith(TOKEN_PREFIX)) return token;
    }
  }
  const h = req.headers['x-face-device-token'];
  const direct = Array.isArray(h) ? h[0] : h;
  if (direct?.startsWith(TOKEN_PREFIX)) return direct.trim();
  return null;
}

export async function requireFaceDevice(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<FaceDeviceContext | null> {
  const ip = getRateLimitIp(req);
  const rlKey = `face-auth-fail:${ip}`;

  const token = getDeviceToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Thiếu device token' });
    return null;
  }

  const preCheck = rateLimit(rlKey, AUTH_FAIL_LIMIT, AUTH_FAIL_WINDOW_MS);
  if (!preCheck.allowed) {
    res.setHeader('Retry-After', String(preCheck.retryAfterSec));
    res.status(429).json({
      success: false,
      error: `Quá nhiều lần xác thực thất bại. Thử lại sau ${preCheck.retryAfterSec} giây.`,
    });
    return null;
  }

  const tokenHash = hashDeviceToken(token);
  const prefix = token.slice(0, 12);

  let { data: device, error } = await supabaseAdmin
    .from('face_devices')
    .select('id, tenant_id, branch_id, device_label, status, token_expires_at')
    .eq('token_hash', tokenHash)
    .eq('token_prefix', prefix)
    .eq('status', 'active')
    .maybeSingle();

  // Tương thích DB chưa chạy migration token_expires_at.
  if (error?.message?.includes('token_expires_at')) {
    ({ data: device, error } = await supabaseAdmin
      .from('face_devices')
      .select('id, tenant_id, branch_id, device_label, status')
      .eq('token_hash', tokenHash)
      .eq('token_prefix', prefix)
      .eq('status', 'active')
      .maybeSingle());
  }

  if (error || !device) {
    res.status(401).json({ success: false, error: 'Device token không hợp lệ' });
    return null;
  }

  if (device.token_expires_at && new Date(device.token_expires_at) < new Date()) {
    res.status(401).json({
      success: false,
      error: 'Device token đã hết hạn. Vui lòng ghép nối lại thiết bị.',
      code: 'TOKEN_EXPIRED',
    });
    return null;
  }

  // Token hợp lệ — reset bộ đếm thất bại cho IP này.
  resetRateLimit(rlKey);

  const { data: tenantRow } = await supabaseAdmin
    .from('tenants')
    .select('plan, status')
    .eq('id', device.tenant_id)
    .maybeSingle();

  if (!tenantRow || tenantRow.status === 'suspended') {
    res.status(403).json({ success: false, error: 'Phòng khám không hoạt động' });
    return null;
  }

  const plan = tenantRow.plan || 'trial';
  if (!planHasFeature(plan, 'face_recognition')) {
    res.status(403).json({
      success: false,
      error: 'Gói dịch vụ hiện tại chưa bao gồm nhận diện khuôn mặt (cần Pro trở lên)',
    });
    return null;
  }

  return {
    deviceId: device.id,
    tenantId: device.tenant_id,
    branchId: device.branch_id,
    deviceLabel: device.device_label,
    tenantPlan: plan,
    clientIp: ip === 'unknown' ? null : ip,
  };
}

export async function touchFaceDevice(
  deviceId: string,
  meta?: {
    ip?: string | null;
    agentVersion?: string | null;
    cameraStatus?: string | null;
    lastError?: string | null;
    /** RTSP URL the agent just applied — clears settings.pending_camera_url when it matches. */
    ackAppliedCameraUrl?: string | null;
  }
): Promise<{ settings: Record<string, unknown> }> {
  const update: Record<string, unknown> = {
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (meta?.ip) update.last_ip = meta.ip;
  if (meta?.agentVersion) update.agent_version = meta.agentVersion;

  let settings: Record<string, unknown> = {};
  if (meta?.cameraStatus || meta?.ackAppliedCameraUrl) {
    const { data: existing } = await supabaseAdmin
      .from('face_devices')
      .select('settings')
      .eq('id', deviceId)
      .maybeSingle();
    settings = (existing?.settings as Record<string, unknown>) || {};

    if (meta?.cameraStatus) {
      settings = {
        ...settings,
        diagnostics: {
          camera_status: meta.cameraStatus,
          last_error: meta.lastError || null,
          reported_at: new Date().toISOString(),
        },
      };
    }

    if (
      meta?.ackAppliedCameraUrl &&
      settings.pending_camera_url &&
      settings.pending_camera_url === meta.ackAppliedCameraUrl
    ) {
      const { pending_camera_url: _drop, pending_camera_requested_at: _drop2, ...rest } = settings;
      settings = {
        ...rest,
        last_applied_camera_url: meta.ackAppliedCameraUrl,
        last_applied_at: new Date().toISOString(),
      };
    }

    update.settings = settings;
  }

  const { data: saved } = await supabaseAdmin
    .from('face_devices')
    .update(update)
    .eq('id', deviceId)
    .select('settings')
    .maybeSingle();

  return { settings: (saved?.settings as Record<string, unknown>) || settings };
}
