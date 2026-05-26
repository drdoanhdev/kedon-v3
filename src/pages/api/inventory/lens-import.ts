// API: Nhập kho tròng kính
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
    // GET: Lịch sử nhập kho
    if (req.method === 'GET') {
      const { lens_stock_id, limit = '50' } = req.query;

      let query = supabase
        .from('lens_import')
        .select('*, lens_stock(id, sph, cyl, add_power, HangTrong(ten_hang)), NhaCungCap(ten)')
        .eq('tenant_id', tenantId)
        .order('ngay_nhap', { ascending: false })
        .limit(parseInt(limit as string));

      if (branchId) {
        const { data: branchStocks, error: branchStocksErr } = await supabase
          .from('lens_stock')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('branch_id', branchId);
        if (branchStocksErr) throw branchStocksErr;

        const allowedStockIds = (branchStocks || []).map((s) => s.id);
        if (allowedStockIds.length === 0) {
          return res.status(200).json([]);
        }
        query = query.in('lens_stock_id', allowedStockIds);
      }

      if (lens_stock_id) query = query.eq('lens_stock_id', lens_stock_id);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Nhập kho (trigger tự động cập nhật tồn)
    if (req.method === 'POST') {
      const { lens_stock_id, so_luong, don_gia, nha_cung_cap_id, ghi_chu } = req.body;
      const lensStockId = parseInt(String(lens_stock_id), 10);
      const soLuong = parseInt(String(so_luong), 10);
      const donGia = parseInt(String(don_gia), 10) || 0;
      const nhaCungCapId = nha_cung_cap_id ? parseInt(String(nha_cung_cap_id), 10) : null;

      if (!Number.isFinite(lensStockId) || lensStockId <= 0 || !Number.isFinite(soLuong) || soLuong <= 0) {
        return res.status(400).json({ error: 'lens_stock_id và so_luong > 0 là bắt buộc' });
      }

      // Kiểm tra lens_stock thuộc tenant/chi nhánh
      let stockQuery = supabase
        .from('lens_stock')
        .select('id, branch_id')
        .eq('id', lensStockId)
        .eq('tenant_id', tenantId);
      if (branchId) {
        stockQuery = stockQuery.eq('branch_id', branchId);
      }
      const { data: stock } = await stockQuery.single();

      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy kho tròng này' });
      }

      // Luôn tạo phiếu nhập + chi tiết cho nhập nhanh để dễ kiểm soát đối soát kho.
      const receiptNote = [
        'Nhập nhanh tròng kính',
        typeof ghi_chu === 'string' ? ghi_chu.trim() : '',
      ].filter(Boolean).join(' | ');

      const { data: receipt, error: receiptError } = await supabase
        .from('import_receipt')
        .insert({
          tenant_id: tenantId,
          ma_phieu: null,
          nha_cung_cap_id: nhaCungCapId,
          tong_tien: soLuong * donGia,
          ghi_chu: receiptNote || null,
        })
        .select('id')
        .single();

      if (receiptError || !receipt) {
        throw new Error(`Không tạo được phiếu nhập nhanh: ${receiptError?.message || 'Unknown error'}`);
      }

      const { error: detailError } = await supabase
        .from('import_receipt_detail')
        .insert({
          import_receipt_id: receipt.id,
          loai_hang: 'trong_kinh',
          lens_stock_id: lensStockId,
          so_luong: soLuong,
          don_gia: donGia,
        });

      if (detailError) {
        await supabase.from('import_receipt').delete().eq('id', receipt.id).eq('tenant_id', tenantId);
        throw new Error(`Không lưu được chi tiết phiếu nhập nhanh: ${detailError.message}`);
      }

      const { data, error } = await supabase
        .from('lens_import')
        .insert({
          tenant_id: tenantId,
          branch_id: stock.branch_id || branchId || null,
          lens_stock_id: lensStockId,
          so_luong: soLuong,
          don_gia: donGia,
          nha_cung_cap_id: nhaCungCapId,
          ghi_chu: ghi_chu || null,
        })
        .select()
        .single();

      if (error) {
        await supabase.from('import_receipt').delete().eq('id', receipt.id).eq('tenant_id', tenantId);
        throw error;
      }

      // Lấy lại tồn kho mới nhất (trigger đã cập nhật)
      const { data: updatedStock } = await supabase
        .from('lens_stock')
        .select('ton_hien_tai, trang_thai_ton')
        .eq('id', lensStockId)
        .single();

      return res.status(201).json({ ...data, stock: updatedStock, receipt_id: receipt.id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('lens-import error:', err);
    return res.status(500).json({ error: err.message });
  }
}
