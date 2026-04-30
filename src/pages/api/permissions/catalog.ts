/**
 * GET /api/permissions/catalog
 * Master data — danh mục permission toàn hệ thống. Public cho mọi
 * thành viên tenant (cần auth để tránh leak ra ngoài nhưng không cần
 * vai trò cụ thể).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const { data, error } = await supabaseAdmin
    .from('permission_catalog')
    .select('code, module, label, description, sort_order')
    .order('module', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    return res.status(500).json({ message: 'Lỗi tải danh mục quyền', error: error.message });
  }

  return res.status(200).json({ data: data || [] });
}
