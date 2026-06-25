/**
 * Xác thực thiết bị nhận diện khuôn mặt (edge agent).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash, randomBytes } from 'crypto';
import { supabaseAdmin } from './tenantApi';
import { planHasFeature } from './featureConfig';

export interface FaceDeviceContext {
  deviceId: string;
  tenantId: string;
  branchId: string | null;
  deviceLabel: string;
  tenantPlan: string;
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
  const token = getDeviceToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Thiếu device token' });
    return null;
  }

  const tokenHash = hashDeviceToken(token);
  const prefix = token.slice(0, 12);

  const { data: device, error } = await supabaseAdmin
    .from('face_devices')
    .select('id, tenant_id, branch_id, device_label, status')
    .eq('token_hash', tokenHash)
    .eq('token_prefix', prefix)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !device) {
    res.status(401).json({ success: false, error: 'Device token không hợp lệ' });
    return null;
  }

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
  };
}

export async function touchFaceDevice(
  deviceId: string,
  meta?: { ip?: string | null; agentVersion?: string | null }
): Promise<void> {
  await supabaseAdmin
    .from('face_devices')
    .update({
      last_seen_at: new Date().toISOString(),
      ...(meta?.ip ? { last_ip: meta.ip } : {}),
      ...(meta?.agentVersion ? { agent_version: meta.agentVersion } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', deviceId);
}
