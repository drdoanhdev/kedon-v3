/**
 * /api/roles/[id]
 * PUT    — Cập nhật tên/mô tả/tập permission của vai trò (ma trận tick).
 * DELETE — Xóa vai trò (chỉ role không phải hệ thống và không có thành viên).
 *
 * Cần permission `manage_members`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';
import { requirePermission, invalidateTenantPermissionCache } from '../../../lib/permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requirePermission(ctx, res, 'manage_members'))) return;

  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ message: 'Thiếu id vai trò' });

  // Lấy role để verify thuộc tenant + check is_system / is_protected.
  const { data: role, error: roleErr } = await supabaseAdmin
    .from('tenant_roles')
    .select('id, code, is_system, is_protected, tenant_id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (roleErr) {
    return res.status(500).json({ message: 'Lỗi đọc vai trò', error: roleErr.message });
  }
  if (!role) {
    return res.status(404).json({ message: 'Không tìm thấy vai trò trong phòng khám.' });
  }

  if (req.method === 'PUT') {
    const { name, description, permissions } = req.body || {};

    // 1. Cập nhật tên/mô tả nếu có thay đổi (system role được đổi tên hiển thị).
    const updates: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim().length >= 2) updates.name = name.trim();
    if (typeof description === 'string') updates.description = description.trim();
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { error: upErr } = await supabaseAdmin
        .from('tenant_roles')
        .update(updates)
        .eq('id', id);
      if (upErr) {
        return res.status(400).json({ message: 'Lỗi cập nhật vai trò', error: upErr.message });
      }
    }

    // 2. Cập nhật ma trận permission (replace toàn bộ).
    if (Array.isArray(permissions)) {
      const cleaned = Array.from(new Set(
        permissions.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)
      ));

      // Bảo vệ role owner: phải giữ các quyền cốt lõi.
      if (role.is_protected) {
        const required = ['manage_billing', 'manage_clinic', 'manage_members'];
        const missing = required.filter((p) => !cleaned.includes(p));
        if (missing.length > 0) {
          return res.status(400).json({
            message: 'Không thể bỏ quyền cốt lõi của vai trò chủ phòng khám: ' + missing.join(', '),
            code: 'PROTECTED_PERMISSION',
          });
        }
      }

      // Xác thực permission code tồn tại trong catalog.
      if (cleaned.length > 0) {
        const { data: catalog } = await supabaseAdmin
          .from('permission_catalog')
          .select('code')
          .in('code', cleaned);
        const validCodes = new Set((catalog || []).map((r: any) => r.code));
        const invalid = cleaned.filter((p) => !validCodes.has(p));
        if (invalid.length > 0) {
          return res.status(400).json({ message: 'Quyền không hợp lệ: ' + invalid.join(', ') });
        }
      }

      // Xóa hết permission cũ rồi insert lại tập mới (đơn giản, đúng).
      const { error: delErr } = await supabaseAdmin
        .from('tenant_role_permissions')
        .delete()
        .eq('role_id', id);
      if (delErr) {
        // Trigger guard trên owner sẽ chặn ở đây nếu user cố tình.
        return res.status(400).json({ message: 'Lỗi xóa quyền cũ', error: delErr.message });
      }

      if (cleaned.length > 0) {
        const rows = cleaned.map((p) => ({ role_id: id, permission_code: p }));
        const { error: insErr } = await supabaseAdmin
          .from('tenant_role_permissions')
          .insert(rows);
        if (insErr) {
          return res.status(400).json({ message: 'Lỗi gán quyền', error: insErr.message });
        }
      }
    }

    invalidateTenantPermissionCache(ctx.tenantId);
    return res.status(200).json({ message: 'Đã cập nhật vai trò.' });
  }

  if (req.method === 'DELETE') {
    if (role.is_system) {
      return res.status(403).json({ message: 'Không thể xóa vai trò hệ thống.' });
    }

    // Chặn xóa nếu còn thành viên.
    const { count } = await supabaseAdmin
      .from('tenantmembership')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('role_id', id);
    if (count && count > 0) {
      return res.status(400).json({
        message: `Vai trò đang được gán cho ${count} thành viên. Vui lòng chuyển họ sang vai trò khác trước khi xóa.`,
      });
    }

    const { error: delErr } = await supabaseAdmin
      .from('tenant_roles')
      .delete()
      .eq('id', id);
    if (delErr) {
      return res.status(400).json({ message: 'Lỗi xóa vai trò', error: delErr.message });
    }

    invalidateTenantPermissionCache(ctx.tenantId);
    return res.status(200).json({ message: 'Đã xóa vai trò.' });
  }

  res.setHeader('Allow', 'PUT, DELETE');
  return res.status(405).json({ message: 'Method Not Allowed' });
}
