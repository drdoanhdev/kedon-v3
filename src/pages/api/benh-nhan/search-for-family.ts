/**
 * /api/benh-nhan/search-for-family?q=...&exclude_patient_id=...
 *  - Tìm bệnh nhân theo tên hoặc SĐT để liên kết vào nhóm gia đình.
 *  - Trả về thêm `family_group_id` (nullable) để frontend cảnh báo conflict trước khi POST.
 *  - Giới hạn 20 kết quả.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireTenant,
  resolveBranchAccess,
  supabaseAdmin as supabase,
  setNoCacheHeaders,
} from '../../../lib/tenantApi';

function escapeLike(value: string): string {
  return value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
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
  const { branchId } = branchAccess;

  const q = ((req.query.q as string) || '').trim();
  if (q.length < 2) return res.status(200).json({ data: [] });

  const excludeId = Number(req.query.exclude_patient_id);
  const esc = escapeLike(q);
  if (!esc) return res.status(200).json({ data: [] });

  try {
    let query = supabase
      .from('BenhNhan')
      .select('id, ten, namsinh, dienthoai, diachi, branch_id')
      .eq('tenant_id', tenantId)
      .limit(20);

    // Branch isolation: nếu staff có branch → chỉ thấy BN trong branch đó
    if (branchId) query = query.eq('branch_id', branchId);

    const digits = esc.replace(/\D/g, '');
    if (digits && digits === esc.replace(/\s/g, '')) {
      // Toàn số → ưu tiên SĐT, hoặc id
      query = query.or(`dienthoai.ilike.%${digits}%,id.eq.${digits}`);
    } else {
      query = query.or(`ten.ilike.%${esc}%,dienthoai.ilike.%${esc}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ message: 'Lỗi tìm kiếm', details: error.message });

    let rows = data || [];
    if (Number.isFinite(excludeId) && excludeId > 0) {
      rows = rows.filter((r: any) => r.id !== excludeId);
    }

    // Lookup family_group_id cho từng bệnh nhân
    const ids = rows.map((r: any) => r.id);
    const familyMap = new Map<number, string>();
    if (ids.length > 0) {
      const { data: mems } = await supabase
        .from('family_members')
        .select('benhnhan_id, family_group_id')
        .eq('tenant_id', tenantId)
        .in('benhnhan_id', ids);
      (mems || []).forEach((m: any) => familyMap.set(Number(m.benhnhan_id), m.family_group_id));
    }

    return res.status(200).json({
      data: rows.map((r: any) => ({
        id: r.id,
        ten: r.ten,
        namsinh: r.namsinh,
        dienthoai: r.dienthoai,
        diachi: r.diachi,
        family_group_id: familyMap.get(r.id) || null,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ message: 'Lỗi hệ thống', details: err?.message });
  }
}
