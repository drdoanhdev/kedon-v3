// API: Tổng hợp tồn kho toàn chuỗi (inventory overview across all branches)
// GET → { branches, thuoc, gong, lens, alerts, transferSuggestions }
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch', 'manage_clinic'))) return;
  const { tenantId } = ctx;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data: branches } = await supabase
      .from('branches')
      .select('id, ten_chi_nhanh, is_main')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('is_main', { ascending: false });

    if (!branches || branches.length === 0) {
      return res.status(200).json({
        branches: [],
        thuoc: [],
        gong: [],
        lens: [],
        alerts: [],
        transferSuggestions: [],
      });
    }

    const branchIds = branches.map((b: any) => b.id);
    const branchName = (bid: string) =>
      branches.find((b: any) => b.id === bid)?.ten_chi_nhanh || bid;

    // Thuốc: ưu tiên hàng theo branch; gộp theo tên
    const { data: thuocList } = await supabase
      .from('Thuoc')
      .select('id, tenthuoc, donvitinh, tonkho, muc_ton_can_co, branch_id, ngung_kinh_doanh')
      .eq('tenant_id', tenantId)
      .eq('ngung_kinh_doanh', false)
      .or(`branch_id.in.(${branchIds.join(',')}),branch_id.is.null`)
      .order('tenthuoc');

    const thuocByName: Record<string, any> = {};
    for (const t of thuocList || []) {
      if (!thuocByName[t.tenthuoc]) {
        thuocByName[t.tenthuoc] = {
          ten: t.tenthuoc,
          donvi: t.donvitinh,
          per_branch: {} as Record<string, number>,
          muc_min: t.muc_ton_can_co || 10,
        };
      }
      if (t.branch_id && branchIds.includes(t.branch_id)) {
        thuocByName[t.tenthuoc].per_branch[t.branch_id] =
          (thuocByName[t.tenthuoc].per_branch[t.branch_id] || 0) + (t.tonkho || 0);
      } else if (!t.branch_id) {
        // Shared catalog không cộng vào tồn CN; chỉ giữ muc_min
        thuocByName[t.tenthuoc].muc_min = t.muc_ton_can_co || thuocByName[t.tenthuoc].muc_min;
      }
    }
    const thuocRows = Object.values(thuocByName)
      .map((r: any) => ({
        ...r,
        tong: branchIds.reduce((s: number, bid: string) => s + (r.per_branch[bid] || 0), 0),
        co_canh_bao: branchIds.some((bid: string) => (r.per_branch[bid] ?? 0) <= r.muc_min),
      }))
      .sort((a: any, b: any) => a.ten.localeCompare(b.ten, 'vi'));

    // Gọng: catalog shared + tồn theo CN
    const { data: gongList } = await supabase
      .from('GongKinh')
      .select('id, ten_gong, ton_kho, muc_ton_can_co, branch_id, trang_thai')
      .eq('tenant_id', tenantId)
      .eq('trang_thai', true)
      .or(`branch_id.in.(${branchIds.join(',')}),branch_id.is.null`);

    const gongByName: Record<string, any> = {};
    for (const g of gongList || []) {
      if (!gongByName[g.ten_gong]) {
        gongByName[g.ten_gong] = {
          ten: g.ten_gong,
          per_branch: {} as Record<string, number>,
          muc_min: g.muc_ton_can_co || 2,
        };
      }
      if (g.branch_id && branchIds.includes(g.branch_id)) {
        gongByName[g.ten_gong].per_branch[g.branch_id] =
          (gongByName[g.ten_gong].per_branch[g.branch_id] || 0) + (g.ton_kho || 0);
      } else if (!g.branch_id) {
        gongByName[g.ten_gong].muc_min = g.muc_ton_can_co || gongByName[g.ten_gong].muc_min;
      }
    }
    const gongRows = Object.values(gongByName)
      .map((r: any) => ({
        ...r,
        tong: branchIds.reduce((s: number, bid: string) => s + (r.per_branch[bid] || 0), 0),
        co_canh_bao: branchIds.some((bid: string) => (r.per_branch[bid] ?? 0) <= r.muc_min),
      }))
      .sort((a: any, b: any) => a.ten.localeCompare(b.ten, 'vi'));

    // Tròng (lens_stock) theo chi nhánh — gộp theo hang_trong + độ
    const { data: lensList } = await supabase
      .from('lens_stock')
      .select('id, hang_trong_id, sph, cyl, add_power, mat, ton_hien_tai, muc_ton_can_co, branch_id, HangTrong:hang_trong_id(ten_hang)')
      .eq('tenant_id', tenantId)
      .in('branch_id', branchIds)
      .limit(5000);

    const lensByKey: Record<string, any> = {};
    for (const l of lensList || []) {
      const tenHang = (l as any).HangTrong?.ten_hang || `HT#${l.hang_trong_id}`;
      const key = `${l.hang_trong_id}|${l.sph}|${l.cyl}|${l.add_power ?? ''}|${l.mat || ''}`;
      if (!lensByKey[key]) {
        lensByKey[key] = {
          ten: tenHang,
          hang_trong_id: l.hang_trong_id,
          sph: l.sph,
          cyl: l.cyl,
          add_power: l.add_power,
          mat: l.mat,
          per_branch: {} as Record<string, number>,
          muc_min: l.muc_ton_can_co || 1,
        };
      }
      if (l.branch_id) {
        lensByKey[key].per_branch[l.branch_id] =
          (lensByKey[key].per_branch[l.branch_id] || 0) + (l.ton_hien_tai || 0);
      }
    }
    const lensRows = Object.values(lensByKey)
      .map((r: any) => ({
        ...r,
        tong: branchIds.reduce((s: number, bid: string) => s + (r.per_branch[bid] || 0), 0),
        co_canh_bao: branchIds.some((bid: string) => (r.per_branch[bid] ?? 0) <= r.muc_min),
        label: [
          r.ten,
          r.sph != null ? `SPH ${r.sph}` : null,
          r.cyl != null ? `CYL ${r.cyl}` : null,
          r.add_power != null ? `ADD ${r.add_power}` : null,
          r.mat || null,
        ]
          .filter(Boolean)
          .join(' · '),
      }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label, 'vi'));

    const alerts: any[] = [];
    const pushAlerts = (rows: any[], loai: string, nameFn: (r: any) => string) => {
      for (const r of rows) {
        for (const bid of branchIds) {
          const qty = r.per_branch[bid];
          if (qty === undefined) continue;
          if (qty <= r.muc_min) {
            alerts.push({
              loai,
              ten: nameFn(r),
              chi_nhanh: branchName(bid),
              branch_id: bid,
              ton_kho: qty,
              muc_min: r.muc_min,
              trang_thai: qty <= 0 ? 'HET' : 'SAP_HET',
            });
          }
        }
      }
    };
    pushAlerts(thuocRows, 'thuoc', (r) => r.ten);
    pushAlerts(gongRows, 'gong_kinh', (r) => r.ten);
    pushAlerts(lensRows, 'lens', (r) => r.label);

    // Gợi ý điều chuyển: CN thừa (qty > muc_min*3) → CN thiếu (qty <= muc_min)
    const transferSuggestions: any[] = [];
    const suggestFrom = (rows: any[], loai: string, nameFn: (r: any) => string) => {
      for (const r of rows) {
        const surplus = branchIds.filter((bid) => (r.per_branch[bid] || 0) > r.muc_min * 3);
        const deficit = branchIds.filter((bid) => (r.per_branch[bid] ?? 0) <= r.muc_min);
        if (surplus.length === 0 || deficit.length === 0) continue;
        for (const to of deficit) {
          const from = surplus.sort(
            (a, b) => (r.per_branch[b] || 0) - (r.per_branch[a] || 0)
          )[0];
          const canMove = Math.max(
            1,
            Math.min(
              Math.floor(((r.per_branch[from] || 0) - r.muc_min) / 2),
              r.muc_min - (r.per_branch[to] || 0) + 1
            )
          );
          transferSuggestions.push({
            loai,
            ten: nameFn(r),
            from_branch_id: from,
            from_branch: branchName(from),
            to_branch_id: to,
            to_branch: branchName(to),
            from_qty: r.per_branch[from] || 0,
            to_qty: r.per_branch[to] || 0,
            suggest_qty: canMove,
          });
        }
      }
    };
    suggestFrom(gongRows, 'gong', (r) => r.ten);
    suggestFrom(lensRows.filter((r: any) => r.co_canh_bao), 'lens', (r) => r.label);
    suggestFrom(thuocRows.filter((r: any) => r.co_canh_bao), 'thuoc', (r) => r.ten);

    return res.status(200).json({
      branches,
      thuoc: thuocRows,
      gong: gongRows,
      lens: lensRows.slice(0, 500),
      alerts: alerts.sort((a, b) => a.ton_kho - b.ton_kho),
      transferSuggestions: transferSuggestions.slice(0, 50),
    });
  } catch (err: any) {
    console.error('inventory-overview API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
