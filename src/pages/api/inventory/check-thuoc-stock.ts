// API: Check tồn kho thuốc cho trang kê đơn (real-time badge)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_drug'))) return;
  const { tenantId } = ctx;

  try {
    const { thuoc_ids } = req.query;

    if (!thuoc_ids) {
      return res.status(400).json({ error: 'thuoc_ids is required' });
    }

    const ids = (thuoc_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (ids.length === 0) {
      return res.status(200).json({});
    }

    const { data, error } = await supabase
      .from('Thuoc')
      .select('id, tonkho, muc_ton_can_co')
      .eq('tenant_id', tenantId)
      .in('id', ids);

    if (error) throw error;

    // Map: thuoc_id → { tonkho, trang_thai }
    const result: Record<number, { tonkho: number; trang_thai: string }> = {};
    for (const item of (data || [])) {
      const tonkho = item.tonkho ?? 0;
      const mucMin = item.muc_ton_can_co ?? 10;
      let trang_thai = 'DU';
      if (tonkho <= 0) trang_thai = 'HET';
      else if (tonkho <= mucMin) trang_thai = 'SAP_HET';
      result[item.id] = { tonkho, trang_thai };
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('check-thuoc-stock error:', err);
    return res.status(500).json({ error: err.message });
  }
}
