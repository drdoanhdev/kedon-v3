// API: Nhập kho gọng theo nhóm giá
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

async function getBranchScopedNhomIds(tenantId: string, branchId: string | null): Promise<number[] | null> {
  if (!branchId) return null;

  const [{ data: gongs }, { data: donKinhs }] = await Promise.all([
    supabase
      .from('GongKinh')
      .select('nhom_gia_gong_id')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .not('nhom_gia_gong_id', 'is', null),
    supabase
      .from('DonKinh')
      .select('nhom_gia_gong_id')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .not('nhom_gia_gong_id', 'is', null),
  ]);

  const idSet = new Set<number>();
  (gongs || []).forEach((r: any) => {
    if (typeof r.nhom_gia_gong_id === 'number') idSet.add(r.nhom_gia_gong_id);
  });
  (donKinhs || []).forEach((r: any) => {
    if (typeof r.nhom_gia_gong_id === 'number') idSet.add(r.nhom_gia_gong_id);
  });

  return Array.from(idSet);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_lens', 'manage_inventory'))) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  const { branchId } = branchAccess;
  const allowedNhomIds = await getBranchScopedNhomIds(tenantId, branchId);
  try {
    // GET: Lịch sử nhập kho theo nhóm giá
    if (req.method === 'GET') {
      const { nhom_gia_gong_id, limit = '50' } = req.query;

      let query = supabase
        .from('nhom_gia_gong_nhap')
        .select('*, NhomGia:nhom_gia_gong_id(id, ten_nhom)')
        .eq('tenant_id', tenantId)
        .order('ngay_nhap', { ascending: false })
        .limit(parseInt(limit as string));

      if (allowedNhomIds) {
        if (allowedNhomIds.length === 0) {
          return res.status(200).json([]);
        }
        query = query.in('nhom_gia_gong_id', allowedNhomIds);
      }

      if (nhom_gia_gong_id) query = query.eq('nhom_gia_gong_id', nhom_gia_gong_id);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Nhập kho (trigger tự cập nhật tồn + giá nhập TB)
    if (req.method === 'POST') {
      const { nhom_gia_gong_id, so_luong, don_gia, ghi_chu } = req.body;

      if (!nhom_gia_gong_id || !so_luong || so_luong <= 0) {
        return res.status(400).json({ error: 'nhom_gia_gong_id và so_luong > 0 là bắt buộc' });
      }

      if (allowedNhomIds && !allowedNhomIds.includes(parseInt(nhom_gia_gong_id))) {
        return res.status(403).json({ error: 'Không có quyền nhập kho cho nhóm giá của chi nhánh khác' });
      }

      // Kiểm tra nhóm thuộc tenant
      const { data: nhom } = await supabase
        .from('nhom_gia_gong')
        .select('id')
        .eq('id', nhom_gia_gong_id)
        .eq('tenant_id', tenantId)
        .single();

      if (!nhom) {
        return res.status(404).json({ error: 'Không tìm thấy nhóm giá này' });
      }

      const { data, error } = await supabase
        .from('nhom_gia_gong_nhap')
        .insert({
          tenant_id: tenantId,
          nhom_gia_gong_id: parseInt(nhom_gia_gong_id),
          so_luong: parseInt(so_luong),
          don_gia: parseInt(don_gia) || 0,
          ghi_chu: ghi_chu || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Lấy lại tồn kho mới nhất (trigger đã cập nhật)
      const { data: updatedNhom } = await supabase
        .from('nhom_gia_gong')
        .select('so_luong_ton, gia_nhap_trung_binh')
        .eq('id', nhom_gia_gong_id)
        .single();

      return res.status(201).json({ ...data, stock: updatedNhom });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('nhom-gia-gong-nhap error:', err);
    return res.status(500).json({ error: err.message });
  }
}
