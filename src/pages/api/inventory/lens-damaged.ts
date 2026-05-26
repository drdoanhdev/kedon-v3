// API: Xuất hỏng tròng kính
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
    // GET: Lịch sử xuất hỏng
    if (req.method === 'GET') {
      const { lens_stock_id, limit = '50' } = req.query;

      let query = supabase
        .from('lens_export_damaged')
        .select('*, lens_stock(id, sph, cyl, add_power, HangTrong(ten_hang))')
        .eq('tenant_id', tenantId)
        .order('ngay_hong', { ascending: false })
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

    // POST: Ghi nhận xuất hỏng (trigger tự trừ tồn)
    if (req.method === 'POST') {
      const { lens_stock_id, so_luong, ly_do, ghi_chu } = req.body;
      const lensStockId = parseInt(String(lens_stock_id), 10);
      const soLuong = parseInt(String(so_luong), 10);

      if (!Number.isFinite(lensStockId) || lensStockId <= 0 || !Number.isFinite(soLuong) || soLuong <= 0 || !ly_do) {
        return res.status(400).json({ error: 'lens_stock_id, so_luong > 0, và ly_do là bắt buộc' });
      }

      // Kiểm tra tồn kho đủ theo tenant/chi nhánh
      let stockQuery = supabase
        .from('lens_stock')
        .select('id, ton_hien_tai, branch_id')
        .eq('id', lensStockId)
        .eq('tenant_id', tenantId);
      if (branchId) {
        stockQuery = stockQuery.eq('branch_id', branchId);
      }
      const { data: stock } = await stockQuery.single();

      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy kho tròng này' });
      }
      if (stock.ton_hien_tai < soLuong) {
        return res.status(400).json({ error: `Tồn kho chỉ còn ${stock.ton_hien_tai}, không đủ xuất ${soLuong}` });
      }

      const { data, error } = await supabase
        .from('lens_export_damaged')
        .insert({
          tenant_id: tenantId,
          branch_id: stock.branch_id || branchId || null,
          lens_stock_id: lensStockId,
          so_luong: soLuong,
          ly_do,
          ghi_chu: ghi_chu || null,
        })
        .select()
        .single();

      if (error) throw error;

      const { data: updatedStock } = await supabase
        .from('lens_stock')
        .select('ton_hien_tai, trang_thai_ton')
        .eq('id', lensStockId)
        .single();

      return res.status(201).json({ ...data, stock: updatedStock });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('lens-damaged error:', err);
    return res.status(500).json({ error: err.message });
  }
}
