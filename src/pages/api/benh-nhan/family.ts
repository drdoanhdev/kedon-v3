/**
 * /api/benh-nhan/family?benhnhanid=...
 *  - GET: family_group + members (kèm patient info) của 1 bệnh nhân.
 *         Trả 200 với data=null nếu bệnh nhân chưa thuộc nhóm.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireTenant,
  resolveBranchAccess,
  supabaseAdmin as supabase,
  setNoCacheHeaders,
} from '../../../lib/tenantApi';

function parseId(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const branchAccess = await resolveBranchAccess(ctx, res, {
    requireForStaff: true,
    allowAllForOwner: true,
  });
  if (!branchAccess) return;

  const { tenantId } = ctx;
  const benhnhanId = parseId(req.query.benhnhanid);
  if (!benhnhanId) return res.status(400).json({ message: 'Thiếu benhnhanid' });

  try {
    // Lookup family_group_id của bệnh nhân
    const { data: myRow, error: myErr } = await supabase
      .from('family_members')
      .select('family_group_id')
      .eq('tenant_id', tenantId)
      .eq('benhnhan_id', benhnhanId)
      .maybeSingle();

    if (myErr) return res.status(400).json({ message: 'Lỗi truy vấn', details: myErr.message });
    if (!myRow) return res.status(200).json({ data: null });

    const groupId = myRow.family_group_id;

    const [{ data: group }, { data: members }] = await Promise.all([
      supabase
        .from('family_groups')
        .select('id, name, phone, address, note, branch_id, created_at, updated_at')
        .eq('id', groupId)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabase
        .from('family_members')
        .select('id, benhnhan_id, role, is_primary, created_at')
        .eq('tenant_id', tenantId)
        .eq('family_group_id', groupId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true }),
    ]);

    if (!group) return res.status(200).json({ data: null });

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
  } catch (err: any) {
    return res.status(500).json({ message: 'Lỗi hệ thống', details: err?.message });
  }
}
