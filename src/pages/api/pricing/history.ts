// API: Price history for an item
// GET /api/pricing/history?item_type=thuoc&item_id=123&kind=ban|von|all
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { item_type = 'thuoc', item_id, kind, limit = '200' } = req.query;
    if (!item_id) return res.status(400).json({ error: 'item_id là bắt buộc' });
    const lim = Math.min(1000, Math.max(1, parseInt(limit as string) || 200));

    let q = supabase
      .from('price_history')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('item_type', item_type as string)
      .eq('item_id', parseInt(item_id as string))
      .order('created_at', { ascending: false })
      .limit(lim);

    if (kind && kind !== 'all') q = q.eq('kind', kind as string);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ data: data || [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
