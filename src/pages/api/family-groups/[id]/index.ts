/**
 * /api/family-groups/[id]
 *  - GET: chi tiết + danh sách members (kèm patient info)
 *  - PATCH: cập nhật tên, sđt, địa chỉ, ghi chú
 *  - DELETE: xoá nhóm (members tự CASCADE)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireTenant,
  resolveBranchAccess,
  supabaseAdmin as supabase,
  setNoCacheHeaders,
} from '../../../../lib/tenantApi';
import { requirePermission } from '../../../../lib/permissions';

function getId(req: NextApiRequest): string | null {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const branchAccess = await resolveBranchAccess(ctx, res, {
    requireForStaff: true,
    allowAllForOwner: true,
  });
  if (!branchAccess) return;

  const { tenantId, userId } = ctx;
  const groupId = getId(req);
  if (!groupId) return res.status(400).json({ message: 'family_group_id không hợp lệ' });

  // Verify group thuộc tenant
  const { data: group, error: gErr } = await supabase
    .from('family_groups')
    .select('id, tenant_id, branch_id, name, phone, address, note, created_at, updated_at')
    .eq('id', groupId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (gErr) return res.status(400).json({ message: 'Lỗi tải nhóm', details: gErr.message });
  if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm gia đình' });

  try {
    if (req.method === 'GET') {
      const { data: members, error: mErr } = await supabase
        .from('family_members')
        .select('id, benhnhan_id, role, is_primary, created_at')
        .eq('tenant_id', tenantId)
        .eq('family_group_id', groupId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (mErr) return res.status(400).json({ message: 'Lỗi tải thành viên', details: mErr.message });

      const patientIds = (members || []).map((m: any) => Number(m.benhnhan_id)).filter(Boolean);
      const patientMap = new Map<number, any>();
      if (patientIds.length > 0) {
        const { data: ps } = await supabase
          .from('BenhNhan')
          .select('id, ten, namsinh, dienthoai, diachi')
          .eq('tenant_id', tenantId)
          .in('id', patientIds);
        (ps || []).forEach((p: any) => patientMap.set(p.id, p));
      }

      return res.status(200).json({
        data: {
          ...group,
          members: (members || []).map((m: any) => ({
            id: m.id,
            benhnhan_id: m.benhnhan_id,
            role: m.role,
            is_primary: m.is_primary,
            created_at: m.created_at,
            patient: patientMap.get(Number(m.benhnhan_id)) || null,
          })),
        },
      });
    }

    if (req.method === 'PATCH') {
      if (!(await requirePermission(ctx, res, 'manage_patients'))) return;

      const body = req.body || {};
      const update: Record<string, any> = { updated_by: userId };

      if (typeof body.name === 'string') {
        const name = body.name.trim();
        if (!name) return res.status(400).json({ message: 'Tên nhóm không được trống' });
        if (name.length > 150) return res.status(400).json({ message: 'Tên nhóm tối đa 150 ký tự' });
        update.name = name;
      }
      if (body.phone !== undefined)
        update.phone = body.phone ? String(body.phone).trim().slice(0, 20) : null;
      if (body.address !== undefined)
        update.address = body.address ? String(body.address).trim() : null;
      if (body.note !== undefined)
        update.note = body.note ? String(body.note).trim() : null;

      const { data, error } = await supabase
        .from('family_groups')
        .update(update)
        .eq('id', groupId)
        .eq('tenant_id', tenantId)
        .select('id, name, phone, address, note, branch_id, created_at, updated_at')
        .single();

      if (error) return res.status(400).json({ message: 'Lỗi cập nhật', details: error.message });
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      if (!(await requirePermission(ctx, res, 'manage_patients'))) return;

      const { error } = await supabase
        .from('family_groups')
        .delete()
        .eq('id', groupId)
        .eq('tenant_id', tenantId);

      if (error) return res.status(400).json({ message: 'Lỗi xoá nhóm', details: error.message });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Lỗi hệ thống', details: err?.message });
  }
}
