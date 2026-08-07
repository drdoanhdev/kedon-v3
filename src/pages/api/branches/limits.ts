// API: Giới hạn & mua thêm slot chi nhánh
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch', 'manage_clinic'))) return;
  const { tenantId } = ctx;

  try {
    const [{ data: tenant }, { data: plan }, { count: activeCount }] = await Promise.all([
      supabase.from('tenants').select('plan, extra_branches').eq('id', tenantId).single(),
      supabase
        .from('subscription_plans')
        .select('max_branches, branch_addon_price, name, price')
        .eq('plan_key', 'enterprise')
        .maybeSingle(),
      supabase
        .from('branches')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
    ]);

    const baseMax = Number(plan?.max_branches || 20);
    const extra = Number((tenant as any)?.extra_branches || 0);
    const maxAllowed = baseMax + extra;
    const addonPrice = Number(plan?.branch_addon_price || 79000);

    if (req.method === 'GET') {
      return res.status(200).json({
        plan: tenant?.plan,
        base_max_branches: baseMax,
        extra_branches: extra,
        max_branches: maxAllowed,
        current_branches: activeCount || 0,
        remaining: Math.max(0, maxAllowed - (activeCount || 0)),
        branch_addon_price: addonPrice,
      });
    }

    if (req.method === 'POST') {
      const { add_slots } = req.body || {};
      const slots = Math.max(1, Math.min(10, Number(add_slots) || 1));
      const newExtra = extra + slots;

      const { data, error } = await supabase
        .from('tenants')
        .update({ extra_branches: newExtra })
        .eq('id', tenantId)
        .select('extra_branches')
        .single();

      if (error) throw error;

      return res.status(200).json({
        message: `Đã thêm ${slots} slot chi nhánh`,
        extra_branches: data.extra_branches,
        max_branches: baseMax + data.extra_branches,
        estimated_addon_fee: slots * addonPrice,
        note: 'Thanh toán addon sẽ được đối soát trên billing (MVP ghi nhận slot).',
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('branch-limits API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
