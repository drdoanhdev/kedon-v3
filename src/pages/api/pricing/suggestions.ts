// API: List pending pricing suggestions
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { status = 'pending', limit = '100' } = req.query;
    const lim = Math.min(500, Math.max(1, parseInt(limit as string) || 100));

    const { data, error } = await supabase
      .from('pricing_suggestions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', status as string)
      .order('created_at', { ascending: false })
      .limit(lim);

    if (error) return res.status(500).json({ error: error.message });

    // Enrich with item names (thuoc only for now)
    const thuocIds = (data || []).filter(d => d.item_type === 'thuoc').map(d => d.item_id);
    let nameMap: Record<number, string> = {};
    if (thuocIds.length > 0) {
      const { data: thuocs } = await supabase
        .from('Thuoc')
        .select('id, tenthuoc, donvitinh')
        .in('id', thuocIds);
      (thuocs || []).forEach((t: any) => { nameMap[t.id] = t.tenthuoc; });
    }

    const enriched = (data || []).map(d => ({
      ...d,
      item_name: nameMap[d.item_id] || `#${d.item_id}`,
    }));

    // Count badge
    const { count } = await supabase
      .from('pricing_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending');

    return res.status(200).json({ data: enriched, pending_count: count || 0 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
