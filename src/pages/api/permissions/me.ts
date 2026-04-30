/**
 * GET /api/permissions/me
 * Trả về tập permission của user hiện tại tại tenant đang chọn.
 * Dùng cho client cache (React Context) để ẩn/hiện UI.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders } from '../../../lib/tenantApi';
import { getUserPermissions } from '../../../lib/permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const { permissions, source } = await getUserPermissions(ctx);
  return res.status(200).json({
    role: ctx.role,
    permissions: Array.from(permissions).sort(),
    source, // 'db' | 'fallback' — debug info
  });
}
