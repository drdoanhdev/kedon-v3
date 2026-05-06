/**
 * API Admin: Quản lý users toàn hệ thống
 * GET  — Tìm kiếm user theo email
 * PUT  — Reset mật khẩu / cập nhật global role / khôi phục user
 * DELETE — Xóa mềm user (khóa đăng nhập + vô hiệu membership)
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
      const includeDeleted = req.query.includeDeleted === 'true';

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
        is_deactivated: ((u.user_metadata || {}) as any)?.deactivated === true,
        deactivated_at: ((u.user_metadata || {}) as any)?.deactivated_at || null,
      }));

      if (!includeDeleted) {
        users = users.filter(u => !u.is_deactivated);
      }

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
      const validRoles = ['superadmin', 'admin', 'doctor', 'staff'];

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

      if (action === 'restore-user') {
        const { data: authUsers, error: authUsersErr } = await supabaseAdmin.auth.admin.listUsers();
        if (authUsersErr) {
          return res.status(500).json({ message: 'Lỗi lấy thông tin user', error: authUsersErr.message });
        }

        const targetUser = authUsers?.users?.find(u => u.id === userId);
        if (!targetUser) {
          return res.status(404).json({ message: 'Không tìm thấy user' });
        }

        const metadata = (targetUser.user_metadata || {}) as any;
        const deletedMembershipIds: string[] = Array.isArray(metadata.deleted_membership_ids)
          ? metadata.deleted_membership_ids.filter((id: unknown) => typeof id === 'string')
          : [];

        if (deletedMembershipIds.length > 0) {
          const { error: reactivateErr } = await supabaseAdmin
            .from('tenantmembership')
            .update({ active: true, updated_at: new Date().toISOString() })
            .in('id', deletedMembershipIds);

          if (reactivateErr) {
            return res.status(400).json({ message: 'Lỗi khôi phục membership', error: reactivateErr.message });
          }
        }

        const previousGlobalRole =
          typeof metadata.previous_global_role === 'string' && validRoles.includes(metadata.previous_global_role)
            ? metadata.previous_global_role
            : null;

        if (previousGlobalRole) {
          const { data: existingRole } = await supabaseAdmin
            .from('user_roles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

          if (existingRole) {
            await supabaseAdmin
              .from('user_roles')
              .update({ role: previousGlobalRole })
              .eq('user_id', userId);
          } else {
            await supabaseAdmin
              .from('user_roles')
              .insert({ user_id: userId, role: previousGlobalRole });
          }
        }

        const { error: unbanErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          ban_duration: 'none',
          user_metadata: {
            ...metadata,
            deactivated: false,
            deactivated_at: null,
            deactivated_by: null,
            restored_at: new Date().toISOString(),
            restored_by: admin.userId,
            deleted_membership_ids: [],
          },
        } as any);

        if (unbanErr) {
          return res.status(400).json({ message: 'Lỗi mở khóa user', error: unbanErr.message });
        }

        return res.status(200).json({ message: 'Đã khôi phục user thành công' });
      }

      if (action === 'update-role') {
        if (!role || !validRoles.includes(role)) {
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

      return res.status(400).json({ message: 'action phải là "reset-password", "update-role" hoặc "restore-user"' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  // DELETE: Xóa mềm user
  if (req.method === 'DELETE') {
    try {
      const userId =
        (typeof req.query.userId === 'string' ? req.query.userId : '') ||
        (typeof req.body?.userId === 'string' ? req.body.userId : '');

      if (!userId) {
        return res.status(400).json({ message: 'Thiếu userId' });
      }

      if (userId === admin.userId) {
        return res.status(400).json({ message: 'Không thể xóa chính tài khoản superadmin hiện tại' });
      }

      const { data: targetRole, error: targetRoleErr } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (targetRoleErr) {
        return res.status(500).json({ message: 'Lỗi kiểm tra vai trò user', error: targetRoleErr.message });
      }

      if (targetRole?.role === 'superadmin') {
        const { count: superadminCount, error: countErr } = await supabaseAdmin
          .from('user_roles')
          .select('id', { head: true, count: 'exact' })
          .eq('role', 'superadmin');

        if (countErr) {
          return res.status(500).json({ message: 'Lỗi kiểm tra số lượng superadmin', error: countErr.message });
        }

        if ((superadminCount || 0) <= 1) {
          return res.status(403).json({ message: 'Không thể xóa superadmin cuối cùng' });
        }
      }

      const { count: activeOwnedTenants, error: ownedErr } = await supabaseAdmin
        .from('tenants')
        .select('id', { head: true, count: 'exact' })
        .eq('owner_id', userId)
        .neq('status', 'inactive');

      if (ownedErr) {
        return res.status(500).json({ message: 'Lỗi kiểm tra quyền sở hữu phòng khám', error: ownedErr.message });
      }

      if ((activeOwnedTenants || 0) > 0) {
        return res.status(403).json({ message: 'User đang là chủ của phòng khám còn hoạt động. Hãy chuyển chủ trước khi xóa.' });
      }

      const { data: authUsers, error: authUsersErr } = await supabaseAdmin.auth.admin.listUsers();
      if (authUsersErr) {
        return res.status(500).json({ message: 'Lỗi lấy thông tin user', error: authUsersErr.message });
      }

      const targetUser = authUsers?.users?.find(u => u.id === userId);
      if (!targetUser) {
        return res.status(404).json({ message: 'Không tìm thấy user' });
      }

      const existingMetadata = (targetUser.user_metadata || {}) as any;
      if (existingMetadata.deactivated === true) {
        return res.status(400).json({ message: 'User đã được xóa mềm trước đó' });
      }

      const { data: activeMemberships, error: activeMemErr } = await supabaseAdmin
        .from('tenantmembership')
        .select('id')
        .eq('user_id', userId)
        .eq('active', true);

      if (activeMemErr) {
        return res.status(400).json({ message: 'Lỗi lấy membership đang hoạt động', error: activeMemErr.message });
      }

      const activeMembershipIds = (activeMemberships || []).map((m: any) => m.id);

      if (activeMembershipIds.length > 0) {
        const { error: memErr } = await supabaseAdmin
          .from('tenantmembership')
          .update({ active: false, updated_at: new Date().toISOString() })
          .in('id', activeMembershipIds);

        if (memErr) {
          return res.status(400).json({ message: 'Lỗi vô hiệu thành viên phòng khám', error: memErr.message });
        }
      }

      const { error: roleDeleteErr } = await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (roleDeleteErr) {
        return res.status(400).json({ message: 'Lỗi gỡ vai trò toàn hệ thống', error: roleDeleteErr.message });
      }

      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
        user_metadata: {
          ...existingMetadata,
          deactivated: true,
          deactivated_at: new Date().toISOString(),
          deactivated_by: admin.userId,
          previous_global_role: targetRole?.role || existingMetadata.previous_global_role || null,
          deleted_membership_ids: activeMembershipIds,
        },
      } as any);

      if (banErr) {
        return res.status(400).json({ message: 'Lỗi khóa đăng nhập user', error: banErr.message });
      }

      return res.status(200).json({ message: 'Đã xóa mềm user thành công' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
