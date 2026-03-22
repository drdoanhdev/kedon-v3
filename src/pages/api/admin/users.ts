/**
 * API Admin: Quản lý users toàn hệ thống
 * GET  — Tìm kiếm user theo email
 * PUT  — Reset mật khẩu / cập nhật global role
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '../../../lib/adminGuard';
import { supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  // GET: Tìm kiếm user
  if (req.method === 'GET') {
    try {
      const search = (req.query.search as string) || '';

      const { data: authUsers, error } = await supabaseAdmin.auth.admin.listUsers();
      if (error) {
        return res.status(500).json({ message: 'Lỗi lấy danh sách users', error: error.message });
      }

      // Lấy roles
      const { data: roles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role');
      const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));

      // Lấy memberships
      const { data: memberships } = await supabaseAdmin
        .from('tenantmembership')
        .select('user_id, tenant_id, role, active, tenants!inner(name)')
        .eq('active', true);

      const membershipMap = new Map<string, any[]>();
      for (const m of (memberships || [])) {
        const list = membershipMap.get(m.user_id) || [];
        list.push({ tenant_id: m.tenant_id, role: m.role, tenant_name: (m as any).tenants?.name || '' });
        membershipMap.set(m.user_id, list);
      }

      let users = (authUsers?.users || []).map(u => ({
        id: u.id,
        email: u.email || '',
        global_role: roleMap.get(u.id) || null,
        tenants: membershipMap.get(u.id) || [],
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));

      // Filter nếu có search
      if (search) {
        const q = search.toLowerCase();
        users = users.filter(u => u.email.toLowerCase().includes(q));
      }

      return res.status(200).json({ data: users, count: users.length });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  // PUT: Reset password hoặc cập nhật global role
  if (req.method === 'PUT') {
    try {
      const { userId, action, newPassword, role } = req.body;

      if (!userId) {
        return res.status(400).json({ message: 'Thiếu userId' });
      }

      if (action === 'reset-password') {
        if (!newPassword || newPassword.length < 6) {
          return res.status(400).json({ message: 'Mật khẩu phải ít nhất 6 ký tự' });
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

        if (error) {
          return res.status(400).json({ message: 'Lỗi reset mật khẩu', error: error.message });
        }

        return res.status(200).json({ message: 'Đã reset mật khẩu thành công' });
      }

      if (action === 'update-role') {
        if (!role || !['superadmin', 'admin', 'doctor', 'staff'].includes(role)) {
          return res.status(400).json({ message: 'Role không hợp lệ' });
        }

        const { data: existing } = await supabaseAdmin
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          await supabaseAdmin.from('user_roles').update({ role }).eq('user_id', userId);
        } else {
          await supabaseAdmin.from('user_roles').insert({ user_id: userId, role });
        }

        return res.status(200).json({ message: `Đã cập nhật role thành ${role}` });
      }

      return res.status(400).json({ message: 'action phải là "reset-password" hoặc "update-role"' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
