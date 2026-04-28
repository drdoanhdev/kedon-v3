// API: Nhập kho gọng kính - GET lịch sử, POST nhập mới
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
  try {
    // GET: Lịch sử nhập kho gọng
    if (req.method === 'GET') {
      const { gong_kinh_id, limit = '50' } = req.query;

      let query = supabase
        .from('frame_import')
        .select('*, GongKinh:gong_kinh_id(id, ten_gong, ma_gong), NhaCungCap:nha_cung_cap_id(ten)')
        .eq('tenant_id', tenantId)
        .order('ngay_nhap', { ascending: false })
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
    }

    // POST: Nhập kho gọng (trigger tự động cập nhật tồn)
    if (req.method === 'POST') {
      const { gong_kinh_id, so_luong, don_gia, nha_cung_cap_id, ghi_chu } = req.body;

      if (!gong_kinh_id || !so_luong || so_luong <= 0) {
        return res.status(400).json({ error: 'gong_kinh_id và so_luong > 0 là bắt buộc' });
      }

      // Kiểm tra gọng thuộc tenant
      let gongCheckQuery = supabase
        .from('GongKinh')
        .select('id')
        .eq('id', gong_kinh_id)
        .eq('tenant_id', tenantId);
      if (branchId) {
        gongCheckQuery = gongCheckQuery.eq('branch_id', branchId);
      }
      const { data: gong } = await gongCheckQuery.single();

      if (!gong) {
        return res.status(404).json({ error: 'Không tìm thấy gọng kính này' });
      }

      const { data, error } = await supabase
        .from('frame_import')
        .insert({
          tenant_id: tenantId,
          gong_kinh_id: parseInt(gong_kinh_id),
          so_luong: parseInt(so_luong),
          don_gia: parseInt(don_gia) || 0,
          nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
          ghi_chu: ghi_chu || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Lấy lại tồn kho mới nhất (trigger đã cập nhật)
      let updatedGongQuery = supabase
        .from('GongKinh')
        .select('ton_kho')
        .eq('id', gong_kinh_id)
        .eq('tenant_id', tenantId);
      if (branchId) {
        updatedGongQuery = updatedGongQuery.eq('branch_id', branchId);
      }
      const { data: updatedGong } = await updatedGongQuery.single();

      return res.status(201).json({ ...data, stock: updatedGong });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('frame-import error:', err);
    return res.status(500).json({ error: err.message });
  }
}
