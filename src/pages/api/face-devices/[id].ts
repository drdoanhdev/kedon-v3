import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!ctx) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing device id' });
  }

  if (req.method === 'PATCH') {
    const { device_label, branch_id } = req.body || {};
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (device_label?.trim()) patch.device_label = device_label.trim();
    if (branch_id !== undefined) patch.branch_id = branch_id || null;

    const { error } = await supabaseAdmin
      .from('face_devices')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: 'Đã cập nhật thiết bị' });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('face_devices')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: 'Đã thu hồi thiết bị' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
