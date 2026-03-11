/**
 * API: Quản lý Tenant (Phòng khám)
 * - GET: Danh sách tenant của user hiện tại
 * - POST: Tạo phòng khám mới (user trở thành owner)
 * - PUT: Cập nhật thông tin phòng khám (chỉ owner/admin)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';

function getBearer(req: NextApiRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const parts = (Array.isArray(h) ? h[0] : h).split(' ');
  return parts.length >= 2 && parts[0].toLowerCase() === 'bearer'
    ? parts.slice(1).join(' ').trim() || null
    : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực user (không cần tenant cho endpoint này)
  const token = getBearer(req);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return res.status(401).json({ message: 'Token không hợp lệ' });
  }

  const userId = userData.user.id;

  // GET: Danh sách phòng khám của user
  if (req.method === 'GET') {
    try {
      const { data: memberships, error: memErr } = await supabaseAdmin
        .from('tenantmembership')
        .select('tenant_id, role, active, last_login_at')
        .eq('user_id', userId)
        .eq('active', true);

      if (memErr) {
        return res.status(500).json({ message: 'Lỗi lấy danh sách membership', error: memErr.message });
      }

      if (!memberships || memberships.length === 0) {
        return res.status(200).json({ data: [] });
      }

      const tenantIds = memberships.map(m => m.tenant_id);
      const { data: tenants, error: tenantErr } = await supabaseAdmin
        .from('tenants')
        .select('id, name, code, phone, address, status, owner_id, settings, created_at')
        .in('id', tenantIds);

      if (tenantErr) {
        return res.status(500).json({ message: 'Lỗi lấy danh sách phòng khám', error: tenantErr.message });
      }

      // Kết hợp tenant + role
      const result = (tenants || []).map(t => {
        const mem = memberships.find(m => m.tenant_id === t.id);
        return {
          ...t,
          role: mem?.role || 'staff',
          last_login_at: mem?.last_login_at,
        };
      });

      return res.status(200).json({ data: result });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  // POST: Tạo phòng khám mới
  if (req.method === 'POST') {
    try {
      const { name, code, phone, address } = req.body;

      if (!name) {
        return res.status(400).json({ message: 'Tên phòng khám là bắt buộc' });
      }

      // Kiểm tra code trùng (nếu có)
      if (code) {
        const { data: existing } = await supabaseAdmin
          .from('tenants')
          .select('id')
          .eq('code', code)
          .maybeSingle();

        if (existing) {
          return res.status(400).json({ message: 'Mã phòng khám đã tồn tại' });
        }
      }

      // Tạo tenant
      const { data: tenant, error: tenantErr } = await supabaseAdmin
        .from('tenants')
        .insert({
          name,
          code: code || null,
          phone: phone || null,
          address: address || null,
          owner_id: userId,
          status: 'active',
        })
        .select()
        .single();

      if (tenantErr) {
        return res.status(400).json({ message: 'Lỗi tạo phòng khám', error: tenantErr.message });
      }

      // Tạo membership cho owner
      const { error: memErr } = await supabaseAdmin
        .from('tenantmembership')
        .insert({
          tenant_id: tenant.id,
          user_id: userId,
          role: 'owner',
          active: true,
        });

      if (memErr) {
        // Rollback tenant nếu tạo membership thất bại
        await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
        return res.status(400).json({ message: 'Lỗi tạo quyền sở hữu', error: memErr.message });
      }

      // Cập nhật default_tenant_id cho user (nếu chưa có)
      await supabaseAdmin
        .from('user_profiles')
        .upsert({
          id: userId,
          default_tenant_id: tenant.id,
        }, { onConflict: 'id' });

      return res.status(200).json({
        message: 'Đã tạo phòng khám thành công',
        data: { ...tenant, role: 'owner' },
      });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  // PUT: Cập nhật thông tin phòng khám (owner/admin only)
  if (req.method === 'PUT') {
    try {
      const { id, name, code, phone, address, settings } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'Thiếu ID phòng khám' });
      }

      // Kiểm tra quyền owner/admin
      const { data: membership } = await supabaseAdmin
        .from('tenantmembership')
        .select('role')
        .eq('user_id', userId)
        .eq('tenant_id', id)
        .eq('active', true)
        .maybeSingle();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return res.status(403).json({ message: 'Chỉ chủ phòng khám/admin mới có quyền cập nhật' });
      }

      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (code !== undefined) updateData.code = code;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (settings !== undefined) updateData.settings = settings;

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('tenants')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateErr) {
        return res.status(400).json({ message: 'Lỗi cập nhật', error: updateErr.message });
      }

      return res.status(200).json({ message: 'Đã cập nhật phòng khám', data: updated });
    } catch (err: any) {
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
