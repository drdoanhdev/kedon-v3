/**
 * API endpoint để xóa pending faces cũ
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tenant = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!tenant) return;
  const supabase = supabaseAdmin;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { days = 7 } = req.body;

  try {
    // Tính ngày cần xóa
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Xóa các pending faces cũ (chỉ xóa rejected hoặc assigned)
    const { data, error } = await supabase
      .from('PendingFaces')
      .delete()
      .lt('detected_at', cutoffDate.toISOString())
      .in('status', ['rejected', 'assigned'])
      .select('id');

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      deleted: data?.length || 0,
      message: `Đã xóa ${data?.length || 0} pending faces cũ hơn ${days} ngày`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
}