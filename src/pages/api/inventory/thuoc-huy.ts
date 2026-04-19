// API: Hủy thuốc - GET lịch sử, POST hủy mới
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_drug', 'manage_inventory'))) return;
  const { tenantId, userId } = ctx;

  try {
    if (req.method === 'GET') {
      const { thuoc_id, page = '1', pageSize = '50' } = req.query;
      const from = (parseInt(page as string) - 1) * parseInt(pageSize as string);
      const to = from + parseInt(pageSize as string) - 1;

      let query = supabase
        .from('thuoc_huy')
        .select('*, Thuoc(id, tenthuoc, mathuoc, donvitinh)', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('ngay_huy', { ascending: false })
        .range(from, to);

      if (thuoc_id) {
        query = query.eq('thuoc_id', thuoc_id);
      }

      const { data, error, count } = await query;
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ data, total: count });
    }

    if (req.method === 'POST') {
      const { thuoc_id, so_luong, ly_do, ghi_chu } = req.body;

      if (!thuoc_id || !so_luong || so_luong <= 0) {
        return res.status(400).json({ error: 'Thuốc và số lượng là bắt buộc' });
      }

      if (!ly_do) {
        return res.status(400).json({ error: 'Lý do hủy là bắt buộc' });
      }

      // Kiểm tra tồn kho đủ
      const { data: thuoc } = await supabase
        .from('Thuoc')
        .select('tonkho')
        .eq('id', thuoc_id)
        .eq('tenant_id', tenantId)
        .single();

      if (!thuoc) {
        return res.status(404).json({ error: 'Không tìm thấy thuốc' });
      }

      if ((thuoc.tonkho ?? 0) < so_luong) {
        return res.status(400).json({ error: `Tồn kho không đủ (hiện có: ${thuoc.tonkho ?? 0})` });
      }

      const { data, error } = await supabase
        .from('thuoc_huy')
        .insert([{
          tenant_id: tenantId,
          thuoc_id,
          so_luong,
          ly_do,
          ghi_chu: ghi_chu || null,
          nguoi_huy: userId,
        }])
        .select();

      if (error) return res.status(400).json({ error: error.message });

      // Trigger tự động trừ tonkho trong Thuoc

      return res.status(200).json({ message: 'Hủy thuốc thành công', data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('thuoc-huy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
