/**
 * API endpoint để xóa pending faces cũ
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin } from '../../../lib/tenantApi';
import { deletePendingFaceSnapshot } from '../../../lib/faceSnapshotUpload';

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

    // Lấy danh sách cần xóa (kèm snapshot_url) để dọn cả ảnh trên storage.
    const { data: toDelete, error: fetchError } = await supabase
      .from('PendingFaces')
      .select('id, snapshot_url')
      .eq('tenant_id', tenant.tenantId)
      .lt('detected_at', cutoffDate.toISOString())
      .in('status', ['rejected', 'assigned']);

    if (fetchError) {
      return res.status(500).json({ success: false, error: fetchError.message });
    }

    for (const row of toDelete || []) {
      await deletePendingFaceSnapshot(row.snapshot_url as string | null);
    }

    // Xóa các pending faces cũ (chỉ xóa rejected hoặc assigned)
    const { data, error } = await supabase
      .from('PendingFaces')
      .delete()
      .eq('tenant_id', tenant.tenantId)
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