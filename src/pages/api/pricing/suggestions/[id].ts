// API: Apply or dismiss a pricing suggestion
// POST /api/pricing/suggestions/[id]?action=apply|dismiss
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../../lib/tenantApi';
import { requirePermission } from '../../../../lib/permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requirePermission(ctx, res, 'manage_categories'))) return;
  const { tenantId, userId } = ctx;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const idRaw = req.query.id;
  const id = parseInt(Array.isArray(idRaw) ? idRaw[0] : (idRaw as string));
  const action = (req.query.action as string) || (req.body?.action as string);
  if (!id || !['apply', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: 'Tham số không hợp lệ' });
  }

  try {
    const { data: sug, error: e0 } = await supabase
      .from('pricing_suggestions')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (e0) return res.status(500).json({ error: e0.message });
    if (!sug) return res.status(404).json({ error: 'Không tìm thấy đề xuất' });
    if (sug.status !== 'pending') return res.status(400).json({ error: 'Đề xuất đã được xử lý' });

    if (action === 'dismiss') {
      const { error } = await supabase
        .from('pricing_suggestions')
        .update({ status: 'dismissed', reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ message: 'Đã bỏ qua đề xuất' });
    }

    // action === 'apply'
    const overridePrice = req.body?.applied_price ? Number(req.body.applied_price) : null;
    const newSell = overridePrice && overridePrice > 0 ? Math.floor(overridePrice) : sug.suggested_sell_price;

    if (sug.item_type === 'thuoc') {
      const { data: thuoc } = await supabase
        .from('Thuoc').select('giaban').eq('id', sug.item_id).eq('tenant_id', tenantId).maybeSingle();
      const oldBan = Number(thuoc?.giaban ?? sug.current_sell_price);

      const { error: e1 } = await supabase
        .from('Thuoc')
        .update({ giaban: newSell })
        .eq('id', sug.item_id)
        .eq('tenant_id', tenantId);
      if (e1) return res.status(400).json({ error: e1.message });

      await supabase.from('price_history').insert({
        tenant_id: tenantId, item_type: 'thuoc', item_id: sug.item_id,
        kind: 'ban', old_price: oldBan, new_price: newSell,
        source: 'suggestion_applied',
        reason: `Áp dụng đề xuất #${id} (giá vốn tăng ${sug.cost_increase_pct}%)`,
        changed_by: userId,
      });
    }

    const { error: e2 } = await supabase
      .from('pricing_suggestions')
      .update({
        status: 'applied',
        suggested_sell_price: newSell,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (e2) return res.status(400).json({ error: e2.message });

    return res.status(200).json({ message: 'Đã áp dụng đề xuất', applied_price: newSell });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
