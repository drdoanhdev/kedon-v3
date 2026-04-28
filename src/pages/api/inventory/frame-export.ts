// API: Lịch sử xuất gọng kính (frame_export)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_lens', 'manage_inventory'))) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  const { branchId } = branchAccess;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { gong_kinh_id, limit = '50' } = req.query;

    let query = supabase
      .from('frame_export')
      .select('*, GongKinh:gong_kinh_id(id, ten_gong, ma_gong), DonKinh:don_kinh_id(id, BenhNhan:benhnhanid(ten))')
      .eq('tenant_id', tenantId)
      .order('ngay_xuat', { ascending: false })
      .limit(parseInt(limit as string));

    if (branchId) {
      const { data: branchGongs, error: branchGongsErr } = await supabase
        .from('GongKinh')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId);
      if (branchGongsErr) throw branchGongsErr;

      const allowedGongIds = (branchGongs || []).map((g) => g.id);
      if (allowedGongIds.length === 0) {
        return res.status(200).json([]);
      }
      query = query.in('gong_kinh_id', allowedGongIds);
    }

    if (gong_kinh_id) query = query.eq('gong_kinh_id', gong_kinh_id);

    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err: any) {
    console.error('frame-export error:', err);
    return res.status(500).json({ error: err.message });
  }
}
