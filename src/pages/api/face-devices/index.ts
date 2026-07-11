import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';
import { planHasFeature } from '../../../lib/featureConfig';
import {
  generatePairingCode,
  generatePendingTokenPrefix,
  hashDeviceToken,
} from '../../../lib/faceDeviceAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!ctx) return;

  const { tenantId } = ctx;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('face_devices')
      .select('id, device_label, branch_id, status, last_seen_at, last_ip, agent_version, created_at, pairing_code, pairing_expires_at, settings')
      .eq('tenant_id', tenantId)
      .neq('status', 'revoked')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data: data || [] });
  }

  if (req.method === 'POST') {
    const { data: tenantRow } = await supabaseAdmin
      .from('tenants')
      .select('plan')
      .eq('id', tenantId)
      .single();

    if (!planHasFeature(tenantRow?.plan, 'face_recognition')) {
      return res.status(403).json({
        success: false,
        error: 'Cần nâng cấp gói Pro để dùng nhận diện khuôn mặt',
      });
    }

    const { device_label, branch_id } = req.body || {};
    const pairingCode = generatePairingCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const placeholderHash = hashDeviceToken(`pending_${pairingCode}_${Date.now()}`);

    const { data, error } = await supabaseAdmin
      .from('face_devices')
      .insert({
        tenant_id: tenantId,
        branch_id: branch_id || null,
        device_label: device_label?.trim() || 'Camera cửa vào',
        token_hash: placeholderHash,
        token_prefix: generatePendingTokenPrefix(),
        pairing_code: pairingCode,
        pairing_expires_at: expiresAt,
        status: 'pending_pair',
      })
      .select('id, device_label, branch_id, pairing_code, pairing_expires_at, status, created_at')
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(201).json({
      success: true,
      data,
      message: 'Tạo mã ghép nối thành công. Chạy agent trên PC camera trong 15 phút.',
    });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
