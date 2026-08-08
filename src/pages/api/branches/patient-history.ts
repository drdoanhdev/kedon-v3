// GET /api/branches/patient-history?benhnhan_id=...
// Lịch sử đơn thuốc / đơn kính / bảo hành toàn chuỗi (không lọc theo CN hiện tại)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch'))) return;
  const { tenantId } = ctx;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const benhnhanId = Number(req.query.benhnhan_id);
  if (!Number.isFinite(benhnhanId)) {
    return res.status(400).json({ error: 'Thiếu benhnhan_id' });
  }

  try {
    const { data: bn, error: bnErr } = await supabase
      .from('BenhNhan')
      .select('id, ten, mabenhnhan, branch_id, branch:branches(id, ten_chi_nhanh)')
      .eq('id', benhnhanId)
      .eq('tenant_id', tenantId)
      .single();

    if (bnErr || !bn) return res.status(404).json({ error: 'Không tìm thấy bệnh nhân' });

    const [donThuocRes, donKinhRes, warrantyRes, transferRes] = await Promise.all([
      supabase
        .from('DonThuoc')
        .select('id, ngay_kham, tongtien, chandoan, branch_id, branch:branches(id, ten_chi_nhanh)')
        .eq('tenant_id', tenantId)
        .eq('benhnhanid', benhnhanId)
        .order('ngay_kham', { ascending: false })
        .limit(100),
      supabase
        .from('DonKinh')
        .select(
          'id, ngay_kham, tong_tien, sph_mp, cyl_mp, ax_mp, sph_mt, cyl_mt, ax_mt, pd, gong, lab_status, branch_id, branch:branches!DonKinh_branch_id_fkey(id, ten_chi_nhanh)'
        )
        .eq('tenant_id', tenantId)
        .eq('benhnhanid', benhnhanId)
        .order('ngay_kham', { ascending: false })
        .limit(100),
      supabase
        .from('branch_warranties')
        .select(
          'id, loai, ly_do, trang_thai, chi_phi, created_at, sale_branch_id, service_branch_id, don_kinh_id'
        )
        .eq('tenant_id', tenantId)
        .eq('benhnhan_id', benhnhanId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('patient_transfers')
        .select('id, from_branch_id, to_branch_id, ly_do, created_at')
        .eq('tenant_id', tenantId)
        .eq('benhnhan_id', benhnhanId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const branchIds = new Set<string>();
    for (const w of warrantyRes.data || []) {
      if (w.sale_branch_id) branchIds.add(w.sale_branch_id);
      if (w.service_branch_id) branchIds.add(w.service_branch_id);
    }
    for (const t of transferRes.data || []) {
      if (t.from_branch_id) branchIds.add(t.from_branch_id);
      if (t.to_branch_id) branchIds.add(t.to_branch_id);
    }

    let branchMap = new Map<string, string>();
    if (branchIds.size > 0) {
      const { data: brs } = await supabase
        .from('branches')
        .select('id, ten_chi_nhanh')
        .in('id', [...branchIds]);
      for (const b of brs || []) branchMap.set(b.id, b.ten_chi_nhanh);
    }

    const warranties = (warrantyRes.data || []).map((w: any) => ({
      ...w,
      sale_branch: w.sale_branch_id ? branchMap.get(w.sale_branch_id) : null,
      service_branch: w.service_branch_id ? branchMap.get(w.service_branch_id) : null,
    }));

    const transfers = (transferRes.data || []).map((t: any) => ({
      ...t,
      from_branch: t.from_branch_id ? branchMap.get(t.from_branch_id) : null,
      to_branch: t.to_branch_id ? branchMap.get(t.to_branch_id) : null,
    }));

    const visitsByBranch: Record<string, { ten: string; don_thuoc: number; don_kinh: number }> = {};
    for (const d of donThuocRes.data || []) {
      const bid = d.branch_id || 'unknown';
      const ten = (d as any).branch?.ten_chi_nhanh || 'Không xác định';
      if (!visitsByBranch[bid]) visitsByBranch[bid] = { ten, don_thuoc: 0, don_kinh: 0 };
      visitsByBranch[bid].don_thuoc += 1;
    }
    for (const d of donKinhRes.data || []) {
      const bid = d.branch_id || 'unknown';
      const ten = (d as any).branch?.ten_chi_nhanh || 'Không xác định';
      if (!visitsByBranch[bid]) visitsByBranch[bid] = { ten, don_thuoc: 0, don_kinh: 0 };
      visitsByBranch[bid].don_kinh += 1;
    }

    return res.status(200).json({
      patient: bn,
      don_thuoc: donThuocRes.data || [],
      don_kinh: donKinhRes.data || [],
      warranties,
      transfers,
      by_branch: Object.values(visitsByBranch),
    });
  } catch (err: any) {
    console.error('patient-history API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
