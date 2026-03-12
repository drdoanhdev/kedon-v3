// API: Nhập kho tròng kính
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

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

      if (lens_stock_id) query = query.eq('lens_stock_id', lens_stock_id);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Nhập kho (trigger tự động cập nhật tồn)
    if (req.method === 'POST') {
      const { lens_stock_id, so_luong, don_gia, nha_cung_cap_id, ghi_chu } = req.body;

      if (!lens_stock_id || !so_luong || so_luong <= 0) {
        return res.status(400).json({ error: 'lens_stock_id và so_luong > 0 là bắt buộc' });
      }

      // Kiểm tra lens_stock thuộc tenant
      const { data: stock } = await supabase
        .from('lens_stock')
        .select('id')
        .eq('id', lens_stock_id)
        .eq('tenant_id', tenantId)
        .single();

      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy kho tròng này' });
      }

      const { data, error } = await supabase
        .from('lens_import')
        .insert({
          tenant_id: tenantId,
          lens_stock_id: parseInt(lens_stock_id),
          so_luong: parseInt(so_luong),
          don_gia: parseInt(don_gia) || 0,
          nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
          ghi_chu: ghi_chu || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Lấy lại tồn kho mới nhất (trigger đã cập nhật)
      const { data: updatedStock } = await supabase
        .from('lens_stock')
        .select('ton_hien_tai, trang_thai_ton')
        .eq('id', lens_stock_id)
        .single();

      return res.status(201).json({ ...data, stock: updatedStock });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('lens-import error:', err);
    return res.status(500).json({ error: err.message });
  }
}
