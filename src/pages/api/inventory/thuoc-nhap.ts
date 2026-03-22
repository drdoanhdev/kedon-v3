// API: Nhập kho thuốc - GET lịch sử, POST nhập mới
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId, userId } = ctx;

  try {
    if (req.method === 'GET') {
      const { thuoc_id, page = '1', pageSize = '50' } = req.query;
      const from = (parseInt(page as string) - 1) * parseInt(pageSize as string);
      const to = from + parseInt(pageSize as string) - 1;

      let query = supabase
        .from('thuoc_nhap_kho')
        .select('*, Thuoc(id, tenthuoc, mathuoc, donvitinh)', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('ngay_nhap', { ascending: false })
        .range(from, to);

      if (thuoc_id) {
        query = query.eq('thuoc_id', thuoc_id);
      }

      const { data, error, count } = await query;
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ data, total: count });
    }

    if (req.method === 'POST') {
      const { thuoc_id, so_luong, don_gia, nha_cung_cap, so_lo, han_su_dung, ghi_chu } = req.body;

      if (!thuoc_id || !so_luong || so_luong <= 0) {
        return res.status(400).json({ error: 'Thuốc và số lượng là bắt buộc' });
      }

      const thanh_tien = (so_luong || 0) * (don_gia || 0);

      const { data, error } = await supabase
        .from('thuoc_nhap_kho')
        .insert([{
          tenant_id: tenantId,
          thuoc_id,
          so_luong,
          don_gia: don_gia || 0,
          thanh_tien,
          nha_cung_cap: nha_cung_cap || null,
          so_lo: so_lo || null,
          han_su_dung: han_su_dung || null,
          ghi_chu: ghi_chu || null,
          nguoi_nhap: userId,
        }])
        .select();

      if (error) return res.status(400).json({ error: error.message });

      // Trigger tự động cập nhật tonkho trong Thuoc

      return res.status(200).json({ message: 'Nhập kho thành công', data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('thuoc-nhap error:', err);
    return res.status(500).json({ error: err.message });
  }
}
