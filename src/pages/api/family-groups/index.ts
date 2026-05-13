/**
 * /api/family-groups
 *  - GET: liệt kê / search nhóm gia đình của tenant (?q=name|phone, ?page, ?pageSize)
 *  - POST: tạo nhóm mới (kèm tuỳ chọn first_member để liên kết bệnh nhân hiện tại vào luôn)
 *
 * Tuân theo pattern tenantApi + RBAC `manage_patients`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireTenant,
  resolveBranchAccess,
  supabaseAdmin as supabase,
  setNoCacheHeaders,
} from '../../../lib/tenantApi';
import { requirePermission } from '../../../lib/permissions';

interface FirstMemberPayload {
  benhnhan_id: number;
  role?: string | null;
  is_primary?: boolean;
}

const VALID_ROLES = new Set(['father', 'mother', 'child', 'spouse', 'other']);

function normalizeRole(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const v = String(raw).trim().toLowerCase();
  return VALID_ROLES.has(v) ? v : null;
}

function escapePostgrestLikeValue(value: string): string {
  return value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
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
  const { branchId } = branchAccess;

  try {
    // ===== GET =====
    if (req.method === 'GET') {
      const q = ((req.query.q as string) || '').trim();
      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
      const pageSize = Math.min(
        200,
        Math.max(1, parseInt((req.query.pageSize as string) || '50', 10) || 50)
      );
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('family_groups')
        .select('id, name, phone, address, note, branch_id, created_at, updated_at', {
          count: 'exact',
        })
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (branchId) query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);

      if (q) {
        const esc = escapePostgrestLikeValue(q);
        if (esc) query = query.or(`name.ilike.%${esc}%,phone.ilike.%${esc}%`);
      }

      const { data, count, error } = await query;
      if (error) return res.status(400).json({ message: 'Lỗi tải nhóm gia đình', details: error.message });

      // Đếm số thành viên cho từng nhóm (1 query gộp)
      const groupIds = (data || []).map((g: any) => g.id);
      const memberCounts = new Map<string, number>();
      if (groupIds.length > 0) {
        const { data: mems } = await supabase
          .from('family_members')
          .select('family_group_id')
          .eq('tenant_id', tenantId)
          .in('family_group_id', groupIds);
        (mems || []).forEach((m: any) => {
          memberCounts.set(m.family_group_id, (memberCounts.get(m.family_group_id) || 0) + 1);
        });
      }

      return res.status(200).json({
        data: (data || []).map((g: any) => ({
          ...g,
          member_count: memberCounts.get(g.id) || 0,
        })),
        total: count || 0,
      });
    }

    // ===== POST =====
    if (req.method === 'POST') {
      if (!(await requirePermission(ctx, res, 'manage_patients'))) return;

      const body = req.body || {};
      const name = String(body.name || '').trim();
      const phone = body.phone ? String(body.phone).trim().slice(0, 20) : null;
      const address = body.address ? String(body.address).trim() : null;
      const note = body.note ? String(body.note).trim() : null;
      const firstMember: FirstMemberPayload | null =
        body.first_member && Number(body.first_member.benhnhan_id) > 0
          ? {
              benhnhan_id: Number(body.first_member.benhnhan_id),
              role: normalizeRole(body.first_member.role),
              is_primary: Boolean(body.first_member.is_primary),
            }
          : null;

      if (!name) return res.status(400).json({ message: 'Thiếu tên nhóm gia đình' });
      if (name.length > 150) return res.status(400).json({ message: 'Tên nhóm tối đa 150 ký tự' });

      // Tạo nhóm
      const { data: created, error: createErr } = await supabase
        .from('family_groups')
        .insert({
          tenant_id: tenantId,
          branch_id: branchId || null,
          name,
          phone,
          address,
          note,
          created_by: userId,
          updated_by: userId,
        })
        .select('id, name, phone, address, note, branch_id, created_at, updated_at')
        .single();

      if (createErr || !created)
        return res.status(400).json({ message: 'Lỗi tạo nhóm gia đình', details: createErr?.message });

      // Liên kết bệnh nhân đầu tiên (optional)
      if (firstMember) {
        // Verify bệnh nhân thuộc tenant
        const { data: bn } = await supabase
          .from('BenhNhan')
          .select('id')
          .eq('id', firstMember.benhnhan_id)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (!bn) {
          // Rollback
          await supabase.from('family_groups').delete().eq('id', created.id);
          return res.status(400).json({ message: 'Bệnh nhân không thuộc tenant hiện tại' });
        }

        const { error: memberErr } = await supabase.from('family_members').insert({
          tenant_id: tenantId,
          family_group_id: created.id,
          benhnhan_id: firstMember.benhnhan_id,
          role: firstMember.role,
          is_primary: firstMember.is_primary ?? true,
          created_by: userId,
        });

        if (memberErr) {
          await supabase.from('family_groups').delete().eq('id', created.id);
          if ((memberErr as any).code === '23505') {
            return res.status(409).json({
              message: 'Bệnh nhân đã thuộc nhóm gia đình khác',
              code: 'PATIENT_ALREADY_IN_FAMILY',
            });
          }
          return res.status(400).json({ message: 'Lỗi liên kết bệnh nhân', details: memberErr.message });
        }
      }

      return res.status(201).json({ data: created });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Lỗi hệ thống', details: err?.message });
  }
}
