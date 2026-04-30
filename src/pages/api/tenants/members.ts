/**
 * API: Quản lý thành viên phòng khám
 * - GET: Danh sách thành viên
 * - POST: Thêm thành viên mới (mời bằng email)
 * - PUT: Cập nhật role thành viên
 * - DELETE: Xóa thành viên khỏi phòng khám
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';
import { invalidateUserPermissionCache } from '../../../lib/permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant - owner/admin mới quản lý thành viên
  const ctx = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!ctx) return;
  const { tenantId, userId } = ctx;

  // GET: Danh sách thành viên của phòng khám
  if (req.method === 'GET') {
    try {
      let memberships: any[] | null = null;
      let error: any = null;

      const fullRes = await supabaseAdmin
        .from('tenantmembership')
        .select('id, user_id, role, active, last_login_at, created_at, login_security, locked_device_id, locked_device_label, locked_device_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });

      memberships = fullRes.data as any[] | null;
      error = fullRes.error;

      if (error && /login_security|locked_device_id|locked_device_label|locked_device_at/i.test(error.message || '')) {
        const fallbackRes = await supabaseAdmin
          .from('tenantmembership')
          .select('id, user_id, role, active, last_login_at, created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true });

        memberships = (fallbackRes.data || []).map((m: any) => ({
          ...m,
          login_security: {},
          locked_device_id: null,
          locked_device_label: null,
          locked_device_at: null,
        }));
        error = fallbackRes.error;
      }

      if (error) {
        return res.status(500).json({ message: 'Lỗi lấy danh sách thành viên', error: error.message });
      }

      // Lấy thông tin user
      const userIds = (memberships || []).map(m => m.user_id);
      let usersMap = new Map<string, { email: string; full_name?: string }>();

      if (userIds.length > 0) {
        // Lấy email từ auth.users
        const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
        if (authUsers?.users) {
          for (const u of authUsers.users) {
            if (userIds.includes(u.id)) {
              usersMap.set(u.id, { email: u.email || '' });
            }
          }
        }

        // Lấy full_name từ user_profiles
        const { data: profiles } = await supabaseAdmin
          .from('user_profiles')
          .select('id, full_name')
          .in('id', userIds);

        if (profiles) {
          for (const p of profiles) {
            const existing = usersMap.get(p.id) || { email: '' };
            usersMap.set(p.id, { ...existing, full_name: p.full_name });
          }
        }
      }

      const result = (memberships || []).map(m => ({
        ...m,
        email: usersMap.get(m.user_id)?.email || '',
        full_name: usersMap.get(m.user_id)?.full_name || null,
      }));

      return res.status(200).json({ data: result });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  // POST: Thêm thành viên mới bằng email
  if (req.method === 'POST') {
    try {
      const { email, role, password } = req.body;

      if (!email || !role) {
        return res.status(400).json({ message: 'Thiếu email hoặc role' });
      }

      if (!['admin', 'doctor', 'staff'].includes(role)) {
        return res.status(400).json({ message: 'Role không hợp lệ. Phải là admin, doctor hoặc staff' });
      }

      // Kiểm tra giới hạn số thành viên theo gói
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('plan')
        .eq('id', tenantId)
        .single();

      const tenantPlan = tenant?.plan || 'trial';

      const { data: planInfo } = await supabaseAdmin
        .from('subscription_plans')
        .select('max_users')
        .eq('plan_key', tenantPlan)
        .single();

      if (planInfo?.max_users) {
        const { count } = await supabaseAdmin
          .from('tenantmembership')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('active', true);

        if (count !== null && count >= planInfo.max_users) {
          return res.status(403).json({
            message: `Gói ${tenantPlan === 'trial' ? 'Dùng thử' : tenantPlan === 'basic' ? 'Cơ bản' : 'hiện tại'} chỉ cho phép tối đa ${planInfo.max_users} thành viên. Vui lòng nâng cấp gói để thêm thành viên.`,
            code: 'MAX_USERS_REACHED',
          });
        }
      }

      // Tìm user theo email
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = authUsers?.users?.find(u => u.email === email);

      let targetUserId: string;

      if (existingUser) {
        targetUserId = existingUser.id;
      } else {
        // Tạo user mới nếu chưa có
        if (!password || password.length < 6) {
          return res.status(400).json({ message: 'Người dùng chưa tồn tại. Cần cung cấp mật khẩu (tối thiểu 6 ký tự) để tạo tài khoản mới.' });
        }

        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (createErr) {
          return res.status(400).json({ message: 'Lỗi tạo tài khoản', error: createErr.message });
        }

        targetUserId = newUser.user.id;

        // Tạo user_profiles
        await supabaseAdmin.from('user_profiles').upsert({
          id: targetUserId,
          default_tenant_id: tenantId,
        }, { onConflict: 'id' });
      }

      // Kiểm tra đã là thành viên chưa
      const { data: existing } = await supabaseAdmin
        .from('tenantmembership')
        .select('id, active')
        .eq('user_id', targetUserId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (existing) {
        if (existing.active) {
          return res.status(400).json({ message: 'Người dùng đã là thành viên của phòng khám' });
        }
        // Tái kích hoạt membership cũ
        await supabaseAdmin
          .from('tenantmembership')
          .update({ active: true, role })
          .eq('id', existing.id);

        return res.status(200).json({ message: 'Đã tái kích hoạt thành viên' });
      }

      // Tạo membership
      const { error: memErr } = await supabaseAdmin
        .from('tenantmembership')
        .insert({
          tenant_id: tenantId,
          user_id: targetUserId,
          role,
          active: true,
          invited_by: userId,
        });

      if (memErr) {
        return res.status(400).json({ message: 'Lỗi thêm thành viên', error: memErr.message });
      }

      return res.status(200).json({ message: `Đã thêm ${email} vào phòng khám với vai trò ${role}` });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  // PUT: Cập nhật role thành viên (hỗ trợ cả system role text và custom role_id qua RBAC V054)
  if (req.method === 'PUT') {
    try {
      const { membershipId, role, role_id } = req.body;

      if (!membershipId || (!role && !role_id)) {
        return res.status(400).json({ message: 'Thiếu membershipId và role/role_id' });
      }

      if (role && !['admin', 'doctor', 'staff'].includes(role)) {
        return res.status(400).json({ message: 'Role hệ thống không hợp lệ. Dùng role_id cho custom role.' });
      }

      // Không cho phép tự thay đổi role owner
      const { data: mem } = await supabaseAdmin
        .from('tenantmembership')
        .select('user_id, role')
        .eq('id', membershipId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!mem) {
        return res.status(404).json({ message: 'Không tìm thấy thành viên' });
      }

      if (mem.role === 'owner') {
        return res.status(403).json({ message: 'Không thể thay đổi role của chủ phòng khám' });
      }

      // Nếu role_id được truyền: validate thuộc tenant này
      let updatePayload: Record<string, unknown> = {};
      if (role_id) {
        const { data: targetRole, error: roleErr } = await supabaseAdmin
          .from('tenant_roles')
          .select('id, code, is_protected')
          .eq('id', role_id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (roleErr || !targetRole) {
          return res.status(400).json({ message: 'role_id không tồn tại trong phòng khám này' });
        }
        if (targetRole.is_protected) {
          return res.status(403).json({ message: 'Không thể gán vai trò được bảo vệ (owner) cho thành viên khác' });
        }
        updatePayload.role_id = role_id;
        // Trigger sync_membership_role sẽ tự cập nhật cột role TEXT nếu code là system.
      } else {
        updatePayload.role = role;
      }

      const { error } = await supabaseAdmin
        .from('tenantmembership')
        .update(updatePayload)
        .eq('id', membershipId)
        .eq('tenant_id', tenantId);

      if (error) {
        return res.status(400).json({ message: 'Lỗi cập nhật role', error: error.message });
      }

      // Invalidate permission cache của user bị đổi vai trò.
      invalidateUserPermissionCache(mem.user_id, tenantId);

      return res.status(200).json({ message: 'Đã cập nhật vai trò thành viên' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  // DELETE: Xóa thành viên khỏi phòng khám
  if (req.method === 'DELETE') {
    try {
      const membershipId = req.query.membershipId as string;

      if (!membershipId) {
        return res.status(400).json({ message: 'Thiếu membershipId' });
      }

      // Không cho phép xóa owner
      const { data: mem } = await supabaseAdmin
        .from('tenantmembership')
        .select('user_id, role')
        .eq('id', membershipId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!mem) {
        return res.status(404).json({ message: 'Không tìm thấy thành viên' });
      }

      if (mem.role === 'owner') {
        return res.status(403).json({ message: 'Không thể xóa chủ phòng khám' });
      }

      // Soft delete (deactivate)
      const { error } = await supabaseAdmin
        .from('tenantmembership')
        .update({ active: false })
        .eq('id', membershipId)
        .eq('tenant_id', tenantId);

      if (error) {
        return res.status(400).json({ message: 'Lỗi xóa thành viên', error: error.message });
      }

      invalidateUserPermissionCache(mem.user_id, tenantId);

      return res.status(200).json({ message: 'Đã xóa thành viên khỏi phòng khám' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
