/**
 * API Admin: Quản lý tất cả phòng khám (tenants)
 * GET  — Danh sách phòng khám + thông tin plan/trial
 * PUT  — Cập nhật trạng thái (active/suspended) hoặc plan
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '../../../lib/adminGuard';
import { supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  // GET: Danh sách tất cả phòng khám
  if (req.method === 'GET') {
    try {
      const { data: tenants, error } = await supabaseAdmin
        .from('tenants')
        .select('id, name, code, phone, status, plan, plan_source, trial_start, trial_days, trial_max_prescriptions, plan_expires_at, owner_id, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ message: 'Lỗi lấy danh sách phòng khám', error: error.message });
      }

      // Lấy số thành viên mỗi tenant
      const tenantIds = (tenants || []).map(t => t.id);
      let memberCounts = new Map<string, number>();

      if (tenantIds.length > 0) {
        const { data: memberships } = await supabaseAdmin
          .from('tenantmembership')
          .select('tenant_id')
          .in('tenant_id', tenantIds)
          .eq('active', true);

        if (memberships) {
          for (const m of memberships) {
            memberCounts.set(m.tenant_id, (memberCounts.get(m.tenant_id) || 0) + 1);
          }
        }
      }

      // Lấy email owner + last sign in
      const ownerIds = [...new Set((tenants || []).map(t => t.owner_id).filter(Boolean))];
      let ownerEmails = new Map<string, string>();
      let ownerLastSignIn = new Map<string, string | null>();
      if (ownerIds.length > 0) {
        const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
        if (authUsers?.users) {
          for (const u of authUsers.users) {
            if (ownerIds.includes(u.id)) {
              ownerEmails.set(u.id, u.email || '');
              ownerLastSignIn.set(u.id, u.last_sign_in_at || null);
            }
          }
        }
      }

      const result = (tenants || []).map(t => ({
        ...t,
        member_count: memberCounts.get(t.id) || 0,
        owner_email: t.owner_id ? ownerEmails.get(t.owner_id) || '' : '',
        owner_last_sign_in: t.owner_id ? ownerLastSignIn.get(t.owner_id) || null : null,
      }));

      return res.status(200).json({ data: result });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  // PUT: Cập nhật trạng thái hoặc plan của tenant
  if (req.method === 'PUT') {
    try {
      const { tenantId, status, plan, plan_expires_at } = req.body;

      if (!tenantId) {
        return res.status(400).json({ message: 'Thiếu tenantId' });
      }

      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      if (status && ['active', 'suspended', 'inactive'].includes(status)) {
        updateData.status = status;
      }
      if (plan && ['trial', 'basic', 'pro', 'enterprise'].includes(plan)) {
        updateData.plan = plan;
        updateData.plan_source = 'admin';
      }
      if (plan_expires_at !== undefined) {
        updateData.plan_expires_at = plan_expires_at;
      }

      const { data, error } = await supabaseAdmin
        .from('tenants')
        .update(updateData)
        .eq('id', tenantId)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ message: 'Lỗi cập nhật', error: error.message });
      }

      return res.status(200).json({ message: 'Đã cập nhật phòng khám', data });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
