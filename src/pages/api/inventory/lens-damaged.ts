// API: Xuất hỏng tròng kính
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

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

      if (lens_stock_id) query = query.eq('lens_stock_id', lens_stock_id);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Ghi nhận xuất hỏng (trigger tự trừ tồn)
    if (req.method === 'POST') {
      const { lens_stock_id, so_luong, ly_do, ghi_chu } = req.body;

      if (!lens_stock_id || !so_luong || so_luong <= 0 || !ly_do) {
        return res.status(400).json({ error: 'lens_stock_id, so_luong > 0, và ly_do là bắt buộc' });
      }

      // Kiểm tra tồn kho đủ
      const { data: stock } = await supabase
        .from('lens_stock')
        .select('id, ton_hien_tai')
        .eq('id', lens_stock_id)
        .eq('tenant_id', tenantId)
        .single();

      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy kho tròng này' });
      }
      if (stock.ton_hien_tai < so_luong) {
        return res.status(400).json({ error: `Tồn kho chỉ còn ${stock.ton_hien_tai}, không đủ xuất ${so_luong}` });
      }

      const { data, error } = await supabase
        .from('lens_export_damaged')
        .insert({
          tenant_id: tenantId,
          lens_stock_id: parseInt(lens_stock_id),
          so_luong: parseInt(so_luong),
          ly_do,
          ghi_chu: ghi_chu || null,
        })
        .select()
        .single();

      if (error) throw error;

      const { data: updatedStock } = await supabase
        .from('lens_stock')
        .select('ton_hien_tai, trang_thai_ton')
        .eq('id', lens_stock_id)
        .single();

      return res.status(201).json({ ...data, stock: updatedStock });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('lens-damaged error:', err);
    return res.status(500).json({ error: err.message });
  }
}
