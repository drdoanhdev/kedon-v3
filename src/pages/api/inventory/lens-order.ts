// API: Tròng cần đặt (lens_order)
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

  const inBranch = (order: any): boolean => {
    if (!branchId) return true;
    return order?.DonKinh?.branch_id === branchId;
  };

  const getAllowedIds = async (targetIds: number[]): Promise<number[]> => {
    if (!branchId) return targetIds;
    const { data } = await supabase
      .from('lens_order')
      .select('id, DonKinh!inner(branch_id)')
      .eq('tenant_id', tenantId)
      .in('id', targetIds);
    return (data || [])
      .filter((row: any) => row?.DonKinh?.branch_id === branchId)
      .map((row: any) => row.id as number);
  };

  try {
    // GET: Danh sách tròng cần đặt
    if (req.method === 'GET') {
      const { trang_thai, group } = req.query;

      // Nếu muốn group summary
      if (group === 'true') {
        const { data, error } = !branchId
          ? await supabase.rpc('get_lens_order_summary', { p_tenant_id: tenantId })
          : { data: null, error: { message: 'branch-scope: skip rpc summary' } as any };

        // Fallback: query trực tiếp nếu chưa có RPC
        if (error) {
          let query = supabase
            .from('lens_order')
            .select('*, HangTrong(ten_hang), DonKinh(id, branch_id, BenhNhan(ten))')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

          if (trang_thai) query = query.eq('trang_thai', trang_thai);
          else query = query.in('trang_thai', ['cho_dat', 'da_dat']);

          const { data: fallbackData, error: fbError } = await query;
          if (fbError) throw fbError;
          return res.status(200).json((fallbackData || []).filter(inBranch));
        }
        return res.status(200).json(data || []);
      }

      // Query chi tiết
      let query = supabase
        .from('lens_order')
        .select('*, HangTrong(ten_hang, loai_trong, hang, nha_cung_cap_id, NhaCungCap:nha_cung_cap_id(id, ten, dien_thoai, zalo_phone)), DonKinh(id, branch_id, BenhNhan(ten)), NhaCungCap(id, ten, dien_thoai, zalo_phone)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (trang_thai) query = query.eq('trang_thai', trang_thai);
      else query = query.in('trang_thai', ['cho_dat', 'da_dat']);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json((data || []).filter(inBranch));
    }

    // PUT: Cập nhật trạng thái (đánh dấu đã đặt / đã nhận)
    if (req.method === 'PUT') {
      const { id, ids, trang_thai, nha_cung_cap_id, ghi_chu } = req.body;

      if (!trang_thai || !['da_dat', 'da_nhan', 'huy'].includes(trang_thai)) {
        return res.status(400).json({ error: 'trang_thai không hợp lệ' });
      }

      const updateData: any = {
        trang_thai,
        updated_at: new Date().toISOString(),
      };
      if (trang_thai === 'da_dat') {
        updateData.ngay_dat = new Date().toISOString();
        if (nha_cung_cap_id) updateData.nha_cung_cap_id = parseInt(nha_cung_cap_id);
      }
      if (trang_thai === 'da_nhan') {
        updateData.ngay_nhan = new Date().toISOString();
      }
      if (ghi_chu) updateData.ghi_chu = ghi_chu;

      // Hỗ trợ cập nhật hàng loạt
      const targetIdsRaw = Array.isArray(ids) ? ids : [id];
      const targetIds = targetIdsRaw.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x));
      if (targetIds.length === 0) {
        return res.status(400).json({ error: 'Thiếu id hợp lệ' });
      }

      const allowedIds = await getAllowedIds(targetIds);
      if (allowedIds.length === 0) {
        return res.status(403).json({ error: 'Không có quyền thao tác đơn đặt tròng của chi nhánh khác' });
      }

      let updateQuery = supabase
        .from('lens_order')
        .update(updateData)
        .in('id', allowedIds)
        .eq('tenant_id', tenantId);
      const { data, error } = await updateQuery.select();

      if (error) throw error;
      return res.status(200).json(data);
    }

    // DELETE: Xóa lens order (chỉ khi cho_dat)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      const targetId = Number(id);
      if (!Number.isFinite(targetId)) {
        return res.status(400).json({ error: 'Thiếu id hợp lệ' });
      }

      const allowedIds = await getAllowedIds([targetId]);
      if (allowedIds.length === 0) {
        return res.status(403).json({ error: 'Không có quyền xóa đơn đặt tròng của chi nhánh khác' });
      }

      let deleteQuery = supabase
        .from('lens_order')
        .delete()
        .in('id', allowedIds)
        .eq('tenant_id', tenantId)
        .eq('trang_thai', 'cho_dat');
      const { error } = await deleteQuery;

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('lens-order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
