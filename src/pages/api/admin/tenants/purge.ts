/**
 * POST /api/admin/tenants/purge
 * Xóa vĩnh viễn phòng khám: R2 + Supabase data + auth users.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '../../../../lib/adminGuard';
import { purgeTenant } from '../../../../lib/admin/purgeTenant';

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const tenantId =
      typeof req.body?.tenantId === 'string' ? req.body.tenantId.trim() : '';
    const confirmName =
      typeof req.body?.confirmName === 'string' ? req.body.confirmName : '';

    if (!tenantId) {
      return res.status(400).json({ message: 'Thiếu tenantId' });
    }
    if (!confirmName.trim()) {
      return res.status(400).json({
        message: 'Thiếu confirmName — hãy gõ đúng tên hoặc mã phòng khám để xác nhận',
      });
    }

    const result = await purgeTenant({
      tenantId,
      confirmName,
      actingAdminId: admin.userId,
    });

    return res.status(200).json({
      message: `Đã xóa vĩnh viễn phòng khám "${result.tenantName}"`,
      data: result,
    });
  } catch (err: any) {
    const message = err?.message || 'Lỗi xóa vĩnh viễn phòng khám';
    const isConfirm = /xác nhận không khớp/i.test(message);
    const isNotFound = /không tìm thấy/i.test(message);
    return res.status(isConfirm ? 400 : isNotFound ? 404 : 500).json({
      message,
      error: message,
    });
  }
}
