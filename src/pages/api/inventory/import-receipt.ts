// API: Phiếu nhập kho tổng hợp (nhiều loại hàng cùng 1 phiếu)
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
    // GET: Danh sách phiếu nhập
    if (req.method === 'GET') {
      const { limit = '50' } = req.query;

      const { data, error } = await supabase
        .from('import_receipt')
        .select(`
          *,
          NhaCungCap:nha_cung_cap_id(id, ten),
          import_receipt_detail(
            id, loai_hang, so_luong, don_gia, thanh_tien,
            Thuoc:thuoc_id(id, ten),
            LensStock:lens_stock_id(id, sph, cyl, add_power, HangTrong:hang_trong_id(ten_hang)),
            GongKinh:gong_kinh_id(id, ten_gong, ma_gong, branch_id),
            MedicalSupply:medical_supply_id(id, ten_vat_tu)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('ngay_nhap', { ascending: false })
        .limit(parseInt(limit as string));

      if (error) throw error;
      const safeData = (data || []).map((receipt: any) => {
        if (!branchId) return receipt;
        const details = Array.isArray(receipt.import_receipt_detail) ? receipt.import_receipt_detail : [];
        const filteredDetails = details.filter((detail: any) => {
          if (detail.loai_hang !== 'gong_kinh') return true;
          return detail.GongKinh?.branch_id === branchId;
        });
        return {
          ...receipt,
          import_receipt_detail: filteredDetails,
        };
      }).filter((receipt: any) => {
        if (!branchId) return true;
        return Array.isArray(receipt.import_receipt_detail) && receipt.import_receipt_detail.length > 0;
      });

      return res.status(200).json(safeData);
    }

    // POST: Tạo phiếu nhập mới + chi tiết
    if (req.method === 'POST') {
      const { ma_phieu, nha_cung_cap_id, ghi_chu, chi_tiet } = req.body;
      const rollbackActions: Array<{ label: string; run: () => Promise<void> }> = [];
      let receiptId: number | null = null;

      if (!chi_tiet || !Array.isArray(chi_tiet) || chi_tiet.length === 0) {
        return res.status(400).json({ error: 'Cần ít nhất 1 dòng chi tiết' });
      }

      try {
        // Validate chi tiết
        for (const ct of chi_tiet) {
          const itemId = parseInt(ct.item_id, 10);
          if (!ct.loai_hang || !ct.so_luong || ct.so_luong <= 0 || Number.isNaN(itemId) || itemId <= 0) {
            return res.status(400).json({ error: 'Mỗi dòng cần loại hàng, item_id hợp lệ và số lượng > 0' });
          }

          const validTypes = ['thuoc', 'trong_kinh', 'gong_kinh', 'vat_tu'];
          if (!validTypes.includes(ct.loai_hang)) {
            return res.status(400).json({ error: `Loại hàng không hợp lệ: ${ct.loai_hang}` });
          }

          if (branchId && ct.loai_hang === 'gong_kinh') {
            const { data: gongInBranch } = await supabase
              .from('GongKinh')
              .select('id')
              .eq('id', itemId)
              .eq('tenant_id', tenantId)
              .eq('branch_id', branchId)
              .maybeSingle();

            if (!gongInBranch) {
              return res.status(403).json({ error: 'Không được nhập gọng của chi nhánh khác' });
            }
          }
        }

        // Tính tổng tiền
        const tongTien = chi_tiet.reduce((sum: number, ct: any) =>
          sum + (parseInt(ct.so_luong, 10) * (parseInt(ct.don_gia, 10) || 0)), 0
        );

        // 1. Tạo phiếu nhập
        const { data: receipt, error: receiptErr } = await supabase
          .from('import_receipt')
          .insert({
            tenant_id: tenantId,
            ma_phieu: ma_phieu || null,
            nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id, 10) : null,
            tong_tien: tongTien,
            ghi_chu: ghi_chu || null,
          })
          .select()
          .single();

        if (receiptErr) throw receiptErr;
        receiptId = receipt.id;

        // 2. Tạo chi tiết + nhập vào bảng nhập kho tương ứng (trigger tự cập nhật tồn)
        const details = chi_tiet.map((ct: any) => ({
          import_receipt_id: receipt.id,
          loai_hang: ct.loai_hang,
          thuoc_id: ct.loai_hang === 'thuoc' ? parseInt(ct.item_id, 10) : null,
          lens_stock_id: ct.loai_hang === 'trong_kinh' ? parseInt(ct.item_id, 10) : null,
          gong_kinh_id: ct.loai_hang === 'gong_kinh' ? parseInt(ct.item_id, 10) : null,
          medical_supply_id: ct.loai_hang === 'vat_tu' ? parseInt(ct.item_id, 10) : null,
          so_luong: parseInt(ct.so_luong, 10),
          don_gia: parseInt(ct.don_gia, 10) || 0,
        }));

        const { error: detailErr } = await supabase
          .from('import_receipt_detail')
          .insert(details);

        if (detailErr) throw detailErr;

        // 3. Insert vào bảng nhập kho cụ thể (để trigger cập nhật tồn kho)
        for (const ct of chi_tiet) {
          const itemId = parseInt(ct.item_id, 10);
          const soLuong = parseInt(ct.so_luong, 10);
          const donGia = parseInt(ct.don_gia, 10) || 0;
          const note = `Phiếu nhập ${receipt.ma_phieu || receipt.id}`;
          const nhaCungCapId = nha_cung_cap_id ? parseInt(nha_cung_cap_id, 10) : null;

          if (ct.loai_hang === 'trong_kinh') {
            const { error: importErr } = await supabase.from('lens_import').insert({
              tenant_id: tenantId,
              lens_stock_id: itemId,
              so_luong: soLuong,
              don_gia: donGia,
              nha_cung_cap_id: nhaCungCapId,
              ghi_chu: note,
            });
            if (importErr) throw importErr;
            rollbackActions.push({
              label: 'lens_import',
              run: async () => {
                const { error } = await supabase.from('lens_export_damaged').insert({
                  tenant_id: tenantId,
                  lens_stock_id: itemId,
                  so_luong: soLuong,
                  ly_do: 'rollback_import_receipt',
                  ghi_chu: `Rollback ${note}`,
                });
                if (error) throw error;
              },
            });
          } else if (ct.loai_hang === 'gong_kinh') {
            const { error: importErr } = await supabase.from('frame_import').insert({
              tenant_id: tenantId,
              gong_kinh_id: itemId,
              so_luong: soLuong,
              don_gia: donGia,
              nha_cung_cap_id: nhaCungCapId,
              ghi_chu: note,
            });
            if (importErr) throw importErr;
            rollbackActions.push({
              label: 'frame_import',
              run: async () => {
                const { error } = await supabase.from('frame_export').insert({
                  tenant_id: tenantId,
                  gong_kinh_id: itemId,
                  so_luong: soLuong,
                });
                if (error) throw error;
              },
            });
          } else if (ct.loai_hang === 'thuoc') {
            const { error: importErr } = await supabase.from('thuoc_nhap_kho').insert({
              tenant_id: tenantId,
              thuoc_id: itemId,
              so_luong: soLuong,
              don_gia: donGia,
              nha_cung_cap_id: nhaCungCapId,
              ghi_chu: note,
            });
            if (importErr) throw importErr;
            rollbackActions.push({
              label: 'thuoc_nhap_kho',
              run: async () => {
                const { error } = await supabase.from('thuoc_huy').insert({
                  tenant_id: tenantId,
                  thuoc_id: itemId,
                  so_luong: soLuong,
                  ly_do: 'rollback_import_receipt',
                  ghi_chu: `Rollback ${note}`,
                });
                if (error) throw error;
              },
            });
          } else if (ct.loai_hang === 'vat_tu') {
            const { error: importErr } = await supabase.from('supply_import').insert({
              tenant_id: tenantId,
              medical_supply_id: itemId,
              so_luong: soLuong,
              don_gia: donGia,
              nha_cung_cap_id: nhaCungCapId,
              ghi_chu: note,
            });
            if (importErr) throw importErr;
            rollbackActions.push({
              label: 'supply_import',
              run: async () => {
                const { error } = await supabase.from('supply_export').insert({
                  tenant_id: tenantId,
                  medical_supply_id: itemId,
                  so_luong: soLuong,
                  ly_do: 'rollback_import_receipt',
                  ghi_chu: `Rollback ${note}`,
                });
                if (error) throw error;
              },
            });
          }
        }

        return res.status(201).json(receipt);
      } catch (postErr: any) {
        const rollbackErrors: string[] = [];

        for (const action of [...rollbackActions].reverse()) {
          try {
            await action.run();
          } catch (rollbackErr: any) {
            rollbackErrors.push(`${action.label}: ${rollbackErr?.message || String(rollbackErr)}`);
          }
        }

        if (receiptId) {
          const { error: deleteReceiptErr } = await supabase
            .from('import_receipt')
            .delete()
            .eq('id', receiptId)
            .eq('tenant_id', tenantId);

          if (deleteReceiptErr) {
            rollbackErrors.push(`import_receipt_cleanup: ${deleteReceiptErr.message}`);
          }
        }

        if (rollbackErrors.length > 0) {
          return res.status(500).json({
            error: `Tạo phiếu nhập thất bại và rollback không hoàn toàn: ${postErr?.message || 'Lỗi không xác định'}`,
            rollback_errors: rollbackErrors,
          });
        }

        return res.status(500).json({ error: postErr?.message || 'Không thể tạo phiếu nhập' });
      }
    }

    // DELETE: Xóa phiếu nhập (chỉ xóa record, không hoàn kho - cần xử lý riêng)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Thiếu id phiếu nhập' });

      // Kiểm tra phiếu thuộc tenant
      const { data: existing } = await supabase
        .from('import_receipt')
        .select('id')
        .eq('id', parseInt(id as string))
        .eq('tenant_id', tenantId)
        .single();

      if (!existing) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });

      if (branchId) {
        const { data: details, error: detailsErr } = await supabase
          .from('import_receipt_detail')
          .select('loai_hang, gong_kinh_id, GongKinh:gong_kinh_id(branch_id)')
          .eq('import_receipt_id', parseInt(id as string));
        if (detailsErr) throw detailsErr;

        const hasForeignBranchFrame = (details || []).some((d: any) =>
          d.loai_hang === 'gong_kinh' && d.GongKinh?.branch_id !== branchId
        );
        if (hasForeignBranchFrame) {
          return res.status(403).json({ error: 'Không được xóa phiếu nhập chứa gọng của chi nhánh khác' });
        }
      }

      // Cascade delete sẽ xóa import_receipt_detail
      const { error } = await supabase
        .from('import_receipt')
        .delete()
        .eq('id', parseInt(id as string));

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('import-receipt error:', err);
    return res.status(500).json({ error: err.message });
  }
}
