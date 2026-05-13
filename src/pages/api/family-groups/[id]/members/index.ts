/**
 * /api/family-groups/[id]/members
 *  - POST: thêm bệnh nhân vào nhóm
 *      body: { benhnhan_id: number, role?: string|null, is_primary?: boolean }
 *      → 409 PATIENT_ALREADY_IN_FAMILY (kèm existing_family_group_id) nếu vi phạm UNIQUE
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
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ message: 'family_group_id không hợp lệ' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  if (!(await requirePermission(ctx, res, 'manage_patients'))) return;

  try {
    const body = req.body || {};
    const benhnhanId = Number(body.benhnhan_id);
    const role = normalizeRole(body.role);
    const isPrimary = Boolean(body.is_primary);

    if (!Number.isFinite(benhnhanId) || benhnhanId <= 0)
      return res.status(400).json({ message: 'benhnhan_id không hợp lệ' });

    // Verify group thuộc tenant
    const { data: group } = await supabase
      .from('family_groups')
      .select('id')
      .eq('id', groupId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm gia đình' });

    // Verify bệnh nhân thuộc tenant
    const { data: bn } = await supabase
      .from('BenhNhan')
      .select('id')
      .eq('id', benhnhanId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!bn) return res.status(400).json({ message: 'Bệnh nhân không thuộc tenant hiện tại' });

    // Nếu set primary: tắt primary của các thành viên khác trong nhóm trước
    if (isPrimary) {
      await supabase
        .from('family_members')
        .update({ is_primary: false })
        .eq('tenant_id', tenantId)
        .eq('family_group_id', groupId)
        .eq('is_primary', true);
    }

    const { data: inserted, error } = await supabase
      .from('family_members')
      .insert({
        tenant_id: tenantId,
        family_group_id: groupId,
        benhnhan_id: benhnhanId,
        role,
        is_primary: isPrimary,
        created_by: userId,
      })
      .select('id, benhnhan_id, role, is_primary, created_at')
      .single();

    if (error) {
      if ((error as any).code === '23505') {
        // Lấy family_group_id hiện tại của bệnh nhân để frontend offer "chuyển nhóm"
        const { data: existing } = await supabase
          .from('family_members')
          .select('family_group_id')
          .eq('tenant_id', tenantId)
          .eq('benhnhan_id', benhnhanId)
          .maybeSingle();
        return res.status(409).json({
          message: 'Bệnh nhân đã thuộc nhóm gia đình khác',
          code: 'PATIENT_ALREADY_IN_FAMILY',
          existing_family_group_id: existing?.family_group_id || null,
        });
      }
      return res.status(400).json({ message: 'Lỗi thêm thành viên', details: error.message });
    }

    return res.status(201).json({ data: inserted });
  } catch (err: any) {
    return res.status(500).json({ message: 'Lỗi hệ thống', details: err?.message });
  }
}
