// API: Phiếu nhập kho tổng hợp (nhiều loại hàng cùng 1 phiếu)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

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
            GongKinh:gong_kinh_id(id, ten_gong, ma_gong),
            MedicalSupply:medical_supply_id(id, ten_vat_tu)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('ngay_nhap', { ascending: false })
        .limit(parseInt(limit as string));

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Tạo phiếu nhập mới + chi tiết
    if (req.method === 'POST') {
      const { ma_phieu, nha_cung_cap_id, ghi_chu, chi_tiet } = req.body;

      if (!chi_tiet || !Array.isArray(chi_tiet) || chi_tiet.length === 0) {
        return res.status(400).json({ error: 'Cần ít nhất 1 dòng chi tiết' });
      }

      // Validate chi tiết
      for (const ct of chi_tiet) {
        if (!ct.loai_hang || !ct.so_luong || ct.so_luong <= 0) {
          return res.status(400).json({ error: 'Mỗi dòng cần loại hàng và số lượng > 0' });
        }
        const validTypes = ['thuoc', 'trong_kinh', 'gong_kinh', 'vat_tu'];
        if (!validTypes.includes(ct.loai_hang)) {
          return res.status(400).json({ error: `Loại hàng không hợp lệ: ${ct.loai_hang}` });
        }
      }

      // Tính tổng tiền
      const tongTien = chi_tiet.reduce((sum: number, ct: any) =>
        sum + (parseInt(ct.so_luong) * (parseInt(ct.don_gia) || 0)), 0
      );

      // 1. Tạo phiếu nhập
      const { data: receipt, error: receiptErr } = await supabase
        .from('import_receipt')
        .insert({
          tenant_id: tenantId,
          ma_phieu: ma_phieu || null,
          nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
          tong_tien: tongTien,
          ghi_chu: ghi_chu || null,
        })
        .select()
        .single();

      if (receiptErr) throw receiptErr;

      // 2. Tạo chi tiết + nhập vào bảng nhập kho tương ứng (trigger tự cập nhật tồn)
      const details = chi_tiet.map((ct: any) => ({
        import_receipt_id: receipt.id,
        loai_hang: ct.loai_hang,
        thuoc_id: ct.loai_hang === 'thuoc' ? parseInt(ct.item_id) : null,
        lens_stock_id: ct.loai_hang === 'trong_kinh' ? parseInt(ct.item_id) : null,
        gong_kinh_id: ct.loai_hang === 'gong_kinh' ? parseInt(ct.item_id) : null,
        medical_supply_id: ct.loai_hang === 'vat_tu' ? parseInt(ct.item_id) : null,
        so_luong: parseInt(ct.so_luong),
        don_gia: parseInt(ct.don_gia) || 0,
      }));

      const { error: detailErr } = await supabase
        .from('import_receipt_detail')
        .insert(details);

      if (detailErr) throw detailErr;

      // 3. Insert vào bảng nhập kho cụ thể (để trigger cập nhật tồn kho)
      for (const ct of chi_tiet) {
        const soLuong = parseInt(ct.so_luong);
        const donGia = parseInt(ct.don_gia) || 0;

        if (ct.loai_hang === 'trong_kinh') {
          await supabase.from('lens_import').insert({
            tenant_id: tenantId,
            lens_stock_id: parseInt(ct.item_id),
            so_luong: soLuong,
            don_gia: donGia,
            nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
            ghi_chu: `Phiếu nhập ${receipt.ma_phieu || receipt.id}`,
          });
        } else if (ct.loai_hang === 'gong_kinh') {
          await supabase.from('frame_import').insert({
            tenant_id: tenantId,
            gong_kinh_id: parseInt(ct.item_id),
            so_luong: soLuong,
            don_gia: donGia,
            nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
            ghi_chu: `Phiếu nhập ${receipt.ma_phieu || receipt.id}`,
          });
        } else if (ct.loai_hang === 'thuoc') {
          await supabase.from('thuoc_nhap_kho').insert({
            tenant_id: tenantId,
            thuoc_id: parseInt(ct.item_id),
            so_luong: soLuong,
            don_gia: donGia,
            nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
            ghi_chu: `Phiếu nhập ${receipt.ma_phieu || receipt.id}`,
          });
        } else if (ct.loai_hang === 'vat_tu') {
          await supabase.from('supply_import').insert({
            tenant_id: tenantId,
            medical_supply_id: parseInt(ct.item_id),
            so_luong: soLuong,
            don_gia: donGia,
            nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
            ghi_chu: `Phiếu nhập ${receipt.ma_phieu || receipt.id}`,
          });
        }
      }

      return res.status(201).json(receipt);
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
