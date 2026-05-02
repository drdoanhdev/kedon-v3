// API: Pricing alert config (per-tenant)
// GET: read current config (auto-create defaults if missing)
// PUT: update threshold + flags (requires manage_clinic)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';
import { requirePermission } from '../../../lib/permissions';

const DEFAULT_CFG = {
  threshold_cost_increase_pct: 20,
  enabled_for_thuoc: true,
  enabled_for_hang_trong: false,
  margin_keep_mode: 'percent' as const,
  round_to: 1000,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('pricing_alert_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data: data || { tenant_id: tenantId, ...DEFAULT_CFG } });
    }

    if (req.method === 'PUT') {
      if (!(await requirePermission(ctx, res, 'manage_clinic'))) return;
      const body = req.body || {};
      const payload: any = { tenant_id: tenantId, updated_at: new Date().toISOString() };
      if (body.threshold_cost_increase_pct !== undefined) {
        const n = Number(body.threshold_cost_increase_pct);
        if (!Number.isFinite(n) || n < 0 || n > 1000) {
          return res.status(400).json({ error: 'Ngưỡng % không hợp lệ (0-1000)' });
        }
        payload.threshold_cost_increase_pct = n;
      }
      if (body.enabled_for_thuoc !== undefined) payload.enabled_for_thuoc = !!body.enabled_for_thuoc;
      if (body.enabled_for_hang_trong !== undefined) payload.enabled_for_hang_trong = !!body.enabled_for_hang_trong;
      if (body.margin_keep_mode !== undefined) {
        if (!['percent', 'absolute'].includes(body.margin_keep_mode)) {
          return res.status(400).json({ error: 'margin_keep_mode không hợp lệ' });
        }
        payload.margin_keep_mode = body.margin_keep_mode;
      }
      if (body.round_to !== undefined) {
        const r = Number(body.round_to);
        if (!Number.isFinite(r) || r <= 0) return res.status(400).json({ error: 'round_to phải > 0' });
        payload.round_to = Math.floor(r);
      }
      const { data, error } = await supabase
        .from('pricing_alert_config')
        .upsert(payload, { onConflict: 'tenant_id' })
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('alert-config error:', err);
    return res.status(500).json({ error: err.message });
  }
}
