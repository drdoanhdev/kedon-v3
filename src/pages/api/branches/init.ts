// API: Khởi tạo chi nhánh mặc định cho tenant
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch', 'manage_clinic'))) return;
  const { tenantId } = ctx;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase.rpc('create_default_branch_for_tenant', {
      p_tenant_id: tenantId,
    });

    if (error) throw error;

    // Lấy danh sách branches sau khi tạo
    const { data: branches } = await supabase
      .from('branches')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('is_main', { ascending: false });

    return res.status(200).json({ branch_id: data, branches: branches || [] });
  } catch (err: any) {
    console.error('init-branches error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
