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

      // "Đã nhận" → tự nhập kho 1 chạm: tìm/tạo dòng lens_stock đúng tổ hợp độ
      // rồi ghi nhận giao dịch nhập, thay vì phải thao tác nhập kho riêng.
      const autoImportWarnings: string[] = [];
      if (trang_thai === 'da_nhan') {
        const { data: orders } = await supabase
          .from('lens_order')
          .select('id, tenant_id, hang_trong_id, sph, cyl, add_power, mat, so_luong_mieng, DonKinh(branch_id)')
          .in('id', allowedIds);

        for (const order of orders || []) {
          try {
            const orderBranchId = (order as any).DonKinh?.branch_id || branchId || null;
            let stockQuery = supabase
              .from('lens_stock')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('hang_trong_id', order.hang_trong_id)
              .eq('sph', order.sph)
              .eq('cyl', order.cyl);
            if (orderBranchId) stockQuery = stockQuery.eq('branch_id', orderBranchId);
            if (order.add_power !== null && order.add_power !== undefined) {
              stockQuery = stockQuery.eq('add_power', order.add_power).eq('mat', order.mat);
            } else {
              stockQuery = stockQuery.is('add_power', null);
            }
            let { data: stock } = await stockQuery.limit(1).maybeSingle();

            if (!stock) {
              const { data: created, error: createErr } = await supabase
                .from('lens_stock')
                .insert({
                  tenant_id: tenantId,
                  branch_id: orderBranchId,
                  hang_trong_id: order.hang_trong_id,
                  sph: order.sph,
                  cyl: order.cyl,
                  add_power: order.add_power,
                  mat: order.mat,
                  ton_dau_ky: 0,
                  ton_hien_tai: 0,
                  muc_ton_can_co: 2,
                })
                .select('id')
                .single();
              if (createErr) throw createErr;
              stock = created;
            }

            const { error: movementError } = await supabase.rpc('record_stock_movement', {
              p_tenant_id: tenantId,
              p_branch_id: orderBranchId,
              p_loai_hang: 'trong',
              p_stock_ref_id: stock.id,
              p_loai_giao_dich: 'nhap',
              p_so_luong: order.so_luong_mieng || 1,
              p_ref_type: 'lens_order',
              p_ref_id: order.id,
              p_ghi_chu: 'Tự động nhập kho khi đánh dấu Đã nhận đơn đặt tròng',
              p_allow_negative: true,
            });
            if (movementError) throw movementError;
          } catch (e: any) {
            autoImportWarnings.push(`Đơn đặt #${order.id}: lỗi tự nhập kho - ${e.message}`);
          }
        }
      }

      let updateQuery = supabase
        .from('lens_order')
        .update(updateData)
        .in('id', allowedIds)
        .eq('tenant_id', tenantId);
      const { data, error } = await updateQuery.select();

      if (error) throw error;
      return res.status(200).json({ data, warnings: autoImportWarnings });
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
