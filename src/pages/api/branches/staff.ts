// API: Phân công nhân viên vào chi nhánh (staff_assignments)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'staff_transfer', 'manage_members'))) return;
  const { tenantId, userId } = ctx;

  try {
    // GET: Lấy danh sách phân công
    if (req.method === 'GET') {
      const { branch_id, user_id, active_only } = req.query;

      let query = supabase
        .from('staff_assignments')
        .select(`
          *,
          branch:branches(id, ten_chi_nhanh, status)
        `)
        .eq('tenant_id', tenantId)
        .order('is_primary', { ascending: false })
        .order('from_date', { ascending: false });

      if (branch_id) query = query.eq('branch_id', branch_id);
      if (user_id) query = query.eq('user_id', user_id);
      if (active_only === '1') query = query.is('to_date', null);

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with user profile + membership info
      const userIds = [...new Set((data || []).map((d: any) => d.user_id))];
      let profileMap = new Map<string, any>();
      let roleMap = new Map<string, string>();

      if (userIds.length > 0) {
        // Get profiles
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name, phone')
          .in('id', userIds);
        if (profiles) {
          for (const p of profiles) profileMap.set(p.id, p);
        }

        // Get memberships (role)
        const { data: memberships } = await supabase
          .from('tenantmembership')
          .select('user_id, role')
          .eq('tenant_id', tenantId)
          .in('user_id', userIds);
        if (memberships) {
          for (const m of memberships) roleMap.set(m.user_id, m.role);
        }

        // Get emails from auth
        const { data: authData } = await supabase.auth.admin.listUsers();
        if (authData?.users) {
          for (const u of authData.users) {
            if (userIds.includes(u.id)) {
              const existing = profileMap.get(u.id) || { id: u.id };
              if (!existing.full_name) existing.full_name = u.email?.split('@')[0];
              existing.email = u.email;
              profileMap.set(u.id, existing);
            }
          }
        }
      }

      const enriched = (data || []).map((sa: any) => ({
        ...sa,
        profile: profileMap.get(sa.user_id) || { id: sa.user_id, full_name: null },
        membership: { role: roleMap.get(sa.user_id) || 'staff' },
      }));

      return res.status(200).json(enriched);
    }

    // POST: Phân công nhân viên vào chi nhánh (1 nhân viên = 1 chi nhánh duy nhất)
    if (req.method === 'POST') {
      const { user_id: targetUserId, branch_id } = req.body;

      if (!targetUserId || !branch_id) {
        return res.status(400).json({ error: 'Thiếu user_id và branch_id' });
      }

      // Kiểm tra user thuộc tenant
      const { data: membership } = await supabase
        .from('tenantmembership')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('user_id', targetUserId)
        .eq('active', true)
        .single();

      if (!membership) {
        return res.status(400).json({ error: 'Nhân viên không thuộc phòng khám này' });
      }

      // Kiểm tra branch thuộc tenant
      const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('id', branch_id)
        .eq('tenant_id', tenantId)
        .single();

      if (!branch) {
        return res.status(400).json({ error: 'Chi nhánh không hợp lệ' });
      }

      // Xóa phân công cũ của nhân viên này (1 user = 1 branch)
      await supabase
        .from('staff_assignments')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('user_id', targetUserId)
        .is('to_date', null);

      const { data, error } = await supabase
        .from('staff_assignments')
        .insert({
          tenant_id: tenantId,
          user_id: targetUserId,
          branch_id,
          is_primary: true,
          created_by: userId,
        })
        .select(`
          *,
          branch:branches(id, ten_chi_nhanh)
        `)
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    // PUT: Chuyển nhân viên sang chi nhánh khác
    if (req.method === 'PUT') {
      const { id, branch_id } = req.body;
      if (!id) return res.status(400).json({ error: 'Thiếu id' });
      if (!branch_id) return res.status(400).json({ error: 'Thiếu branch_id' });

      const { data, error } = await supabase
        .from('staff_assignments')
        .update({ branch_id })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select(`*, branch:branches(id, ten_chi_nhanh)`)
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    // DELETE: Xóa phân công
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Thiếu id' });

      const { error } = await supabase
        .from('staff_assignments')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('staff-assignments API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
