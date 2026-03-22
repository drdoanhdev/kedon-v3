// API: Danh sách tồn kho thuốc + cảnh báo
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { search, filter } = req.query;

    let query = supabase
      .from('Thuoc')
      .select('id, mathuoc, tenthuoc, donvitinh, giaban, gianhap, tonkho, muc_ton_toi_thieu')
      .eq('tenant_id', tenantId)
      .order('tenthuoc', { ascending: true });

    // Lọc chỉ thuốc, không lấy thủ thuật
    query = query.or('la_thu_thuat.is.null,la_thu_thuat.eq.false');

    if (search) {
      query = query.or(`tenthuoc.ilike.%${search}%,mathuoc.ilike.%${search}%,hoatchat.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Tính trạng thái tồn kho
    const items = (data || []).map((item: any) => {
      const tonkho = item.tonkho ?? 0;
      const mucMin = item.muc_ton_toi_thieu ?? 10;
      let trang_thai = 'DU';
      if (tonkho <= 0) trang_thai = 'HET';
      else if (tonkho <= mucMin) trang_thai = 'SAP_HET';
      return { ...item, trang_thai };
    });

    // Lọc theo trạng thái nếu có
    const filtered = filter && filter !== 'all'
      ? items.filter((i: any) => i.trang_thai === filter)
      : items;

    const summary = {
      total: items.length,
      het: items.filter((i: any) => i.trang_thai === 'HET').length,
      sap_het: items.filter((i: any) => i.trang_thai === 'SAP_HET').length,
      du: items.filter((i: any) => i.trang_thai === 'DU').length,
    };

    return res.status(200).json({ data: filtered, summary });
  } catch (err: any) {
    console.error('thuoc-stock error:', err);
    return res.status(500).json({ error: err.message });
  }
}
