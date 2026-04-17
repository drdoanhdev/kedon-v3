// API: Lịch sử xuất gọng kính (frame_export)
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
    const { gong_kinh_id, limit = '50' } = req.query;

    let query = supabase
      .from('frame_export')
      .select('*, GongKinh:gong_kinh_id(id, ten_gong, ma_gong), DonKinh:don_kinh_id(id, BenhNhan:benhnhanid(ten))')
      .eq('tenant_id', tenantId)
      .order('ngay_xuat', { ascending: false })
      .limit(parseInt(limit as string));

    if (gong_kinh_id) query = query.eq('gong_kinh_id', gong_kinh_id);

    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err: any) {
    console.error('frame-export error:', err);
    return res.status(500).json({ error: err.message });
  }
}
