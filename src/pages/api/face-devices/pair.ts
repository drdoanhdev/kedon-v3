import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/tenantApi';
import { generateDeviceToken, hashDeviceToken } from '../../../lib/faceDeviceAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { pairing_code, device_label, agent_version } = req.body || {};
  const code = String(pairing_code || '').trim().toUpperCase();

  if (!code) {
    return res.status(400).json({ success: false, error: 'Thiếu pairing_code' });
  }

  const { data: device, error } = await supabaseAdmin
    .from('face_devices')
    .select('id, tenant_id, branch_id, device_label, pairing_expires_at, status')
    .eq('pairing_code', code)
    .eq('status', 'pending_pair')
    .maybeSingle();

  if (error || !device) {
    return res.status(404).json({ success: false, error: 'Mã ghép nối không hợp lệ hoặc đã hết hạn' });
  }

  if (device.pairing_expires_at && new Date(device.pairing_expires_at) < new Date()) {
    await supabaseAdmin.from('face_devices').update({ status: 'revoked' }).eq('id', device.id);
    return res.status(410).json({ success: false, error: 'Mã ghép nối đã hết hạn' });
  }

  const { token, hash, prefix } = generateDeviceToken();

  const { error: updateError } = await supabaseAdmin
    .from('face_devices')
    .update({
      token_hash: hash,
      token_prefix: prefix,
      pairing_code: null,
      pairing_expires_at: null,
      status: 'active',
      device_label: device_label?.trim() || device.device_label,
      agent_version: agent_version || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', device.id);

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  // URL agent dùng sau pair: ưu tiên host của request (localhost khi dev), không ghi đè bằng NEXT_PUBLIC_APP_URL
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  let apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  if (host) {
    const protoHeader = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
    const isLocal = host.includes('localhost') || host.startsWith('127.0.0.1');
    const scheme = proto || (isLocal ? 'http' : 'https');
    apiBaseUrl = `${scheme}://${host}`;
  }

  return res.status(200).json({
    success: true,
    device_token: token,
    device_id: device.id,
    tenant_id: device.tenant_id,
    branch_id: device.branch_id,
    api_base_url: apiBaseUrl,
    message: 'Ghép nối thiết bị thành công',
  });
}
