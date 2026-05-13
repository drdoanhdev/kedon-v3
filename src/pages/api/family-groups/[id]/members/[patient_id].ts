/**
 * /api/family-groups/[id]/members/[patient_id]
 *  - PATCH: cập nhật role / is_primary
 *  - DELETE: gỡ bệnh nhân khỏi nhóm
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireTenant,
  resolveBranchAccess,
  supabaseAdmin as supabase,
  setNoCacheHeaders,
} from '../../../../../lib/tenantApi';
import { requirePermission } from '../../../../../lib/permissions';

const VALID_ROLES = new Set(['father', 'mother', 'child', 'spouse', 'other']);

function normalizeRole(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const v = String(raw).trim().toLowerCase();
  return VALID_ROLES.has(v) ? v : null;
}

function getGroupId(req: NextApiRequest): string | null {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function getPatientId(req: NextApiRequest): number | null {
  const raw = req.query.patient_id;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
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

  const { tenantId } = ctx;
  const groupId = getGroupId(req);
  const patientId = getPatientId(req);
  if (!groupId) return res.status(400).json({ message: 'family_group_id không hợp lệ' });
  if (!patientId) return res.status(400).json({ message: 'patient_id không hợp lệ' });

  if (!(await requirePermission(ctx, res, 'manage_patients'))) return;

  try {
    if (req.method === 'PATCH') {
      const body = req.body || {};
      const update: Record<string, any> = {};

      if (body.role !== undefined) update.role = normalizeRole(body.role);

      if (body.is_primary !== undefined) {
        const next = Boolean(body.is_primary);
        if (next) {
          // Tắt primary khác trước (tránh vi phạm partial unique)
          await supabase
            .from('family_members')
            .update({ is_primary: false })
            .eq('tenant_id', tenantId)
            .eq('family_group_id', groupId)
            .eq('is_primary', true)
            .neq('benhnhan_id', patientId);
        }
        update.is_primary = next;
      }

      if (Object.keys(update).length === 0)
        return res.status(400).json({ message: 'Không có trường nào để cập nhật' });

      const { data, error } = await supabase
        .from('family_members')
        .update(update)
        .eq('tenant_id', tenantId)
        .eq('family_group_id', groupId)
        .eq('benhnhan_id', patientId)
        .select('id, benhnhan_id, role, is_primary, created_at')
        .maybeSingle();

      if (error) return res.status(400).json({ message: 'Lỗi cập nhật', details: error.message });
      if (!data) return res.status(404).json({ message: 'Không tìm thấy thành viên' });
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const { error, count } = await supabase
        .from('family_members')
        .delete({ count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('family_group_id', groupId)
        .eq('benhnhan_id', patientId);

      if (error) return res.status(400).json({ message: 'Lỗi xoá thành viên', details: error.message });
      if (!count) return res.status(404).json({ message: 'Không tìm thấy thành viên' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Lỗi hệ thống', details: err?.message });
  }
}
