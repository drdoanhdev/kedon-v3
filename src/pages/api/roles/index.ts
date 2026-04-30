/**
 * /api/roles
 * GET    — Danh sách role của tenant (kèm permissions + member count).
 * POST   — Tạo role mới (custom role do tenant tự đặt tên).
 *
 * Cần permission `manage_members`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';
import { requirePermission, invalidateTenantPermissionCache } from '../../../lib/permissions';

const SLUG_RE = /^[a-z0-9_-]{2,32}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requirePermission(ctx, res, 'manage_members'))) return;

  if (req.method === 'GET') {
    const { data: roles, error } = await supabaseAdmin
      .from('tenant_roles')
      .select('id, code, name, description, is_system, is_protected, created_at, updated_at, tenant_role_permissions(permission_code)')
      .eq('tenant_id', ctx.tenantId)
      .order('is_system', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ message: 'Lỗi tải vai trò', error: error.message });
    }

    // Đếm số thành viên mỗi role.
    const roleIds = (roles || []).map((r: any) => r.id);
    const memberCount: Record<string, number> = {};
    if (roleIds.length > 0) {
      const { data: counts } = await supabaseAdmin
        .from('tenantmembership')
        .select('role_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('active', true)
        .in('role_id', roleIds);
      for (const row of counts || []) {
        const k = (row as any).role_id;
        if (k) memberCount[k] = (memberCount[k] || 0) + 1;
      }
    }

    const result = (roles || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      is_system: r.is_system,
      is_protected: r.is_protected,
      permissions: (r.tenant_role_permissions || []).map((p: any) => p.permission_code).sort(),
      member_count: memberCount[r.id] || 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return res.status(200).json({ data: result });
  }

  if (req.method === 'POST') {
    const { code, name, description, permissions } = req.body || {};
    if (typeof code !== 'string' || !SLUG_RE.test(code)) {
      return res.status(400).json({ message: 'Mã vai trò chỉ gồm chữ thường, số, "_" hoặc "-", 2–32 ký tự.' });
    }
    if (typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ message: 'Tên vai trò phải có ít nhất 2 ký tự.' });
    }
    if (['owner', 'admin', 'doctor', 'staff'].includes(code)) {
      return res.status(400).json({ message: 'Mã vai trò trùng với vai trò hệ thống.' });
    }

    const permList: string[] = Array.isArray(permissions) ? permissions.filter((p) => typeof p === 'string') : [];

    const { data: created, error: insErr } = await supabaseAdmin
      .from('tenant_roles')
      .insert({
        tenant_id: ctx.tenantId,
        code,
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : null,
        is_system: false,
        is_protected: false,
      })
      .select('id')
      .single();

    if (insErr) {
      if ((insErr as any).code === '23505') {
        return res.status(409).json({ message: 'Mã vai trò đã tồn tại trong phòng khám.' });
      }
      return res.status(500).json({ message: 'Lỗi tạo vai trò', error: insErr.message });
    }

    if (permList.length > 0) {
      const rows = permList.map((p) => ({ role_id: created.id, permission_code: p }));
      const { error: trpErr } = await supabaseAdmin
        .from('tenant_role_permissions')
        .insert(rows);
      if (trpErr) {
        // Rollback role nếu insert permissions thất bại.
        await supabaseAdmin.from('tenant_roles').delete().eq('id', created.id);
        return res.status(400).json({ message: 'Lỗi gán quyền cho vai trò', error: trpErr.message });
      }
    }

    invalidateTenantPermissionCache(ctx.tenantId);
    return res.status(201).json({ id: created.id, message: 'Đã tạo vai trò.' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ message: 'Method Not Allowed' });
}
