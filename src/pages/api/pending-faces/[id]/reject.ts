/**
 * API endpoint để từ chối pending face
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin } from '../../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const supabase = supabaseAdmin;

  const { id } = req.query;
  const { reason } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing id' });
  }

  try {
    const { error } = await supabase
      .from('PendingFaces')
      .update({
        status: 'rejected',
        reject_reason: reason || null,
        rejected_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending'); // Chỉ reject nếu đang pending

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Đã từ chối khuôn mặt',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
}