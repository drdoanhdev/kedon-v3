// API: Tổng hợp tồn kho toàn chuỗi (inventory overview across all branches)
// GET → { branches, thuoc, gong_kinh, lens_stock, low_stock_alerts }
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
    // 1. Danh sách chi nhánh active
    const { data: branches } = await supabase
      .from('branches')
      .select('id, ten_chi_nhanh, is_main')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('is_main', { ascending: false });

    if (!branches || branches.length === 0) {
      return res.status(200).json({ branches: [], thuoc: [], gong: [], lens: [], alerts: [] });
    }

    const branchIds = branches.map((b: any) => b.id);

    // 2. Thuốc tồn kho theo chi nhánh
    const { data: thuocList } = await supabase
      .from('Thuoc')
      .select('id, tenthuoc, donvitinh, tonkho, muc_ton_toi_thieu, branch_id, ngung_kinh_doanh')
      .eq('tenant_id', tenantId)
      .eq('ngung_kinh_doanh', false)
      .in('branch_id', branchIds)
      .order('tenthuoc');

    // Group thuoc by name across branches (so_sanh nhanh hơn)
    const thuocByName: Record<string, any> = {};
    for (const t of thuocList || []) {
      if (!thuocByName[t.tenthuoc]) {
        thuocByName[t.tenthuoc] = {
          ten: t.tenthuoc,
          donvi: t.donvitinh,
          per_branch: {},
          muc_min: t.muc_ton_toi_thieu || 10,
        };
      }
      thuocByName[t.tenthuoc].per_branch[t.branch_id] = t.tonkho || 0;
    }
    const thuocRows = Object.values(thuocByName)
      .map((r: any) => ({
        ...r,
        tong: branchIds.reduce((s: number, bid: string) => s + (r.per_branch[bid] || 0), 0),
        co_canh_bao: branchIds.some((bid: string) => (r.per_branch[bid] ?? 0) <= r.muc_min),
      }))
      .sort((a: any, b: any) => a.ten.localeCompare(b.ten, 'vi'));

    // 3. Gọng kính tồn kho theo chi nhánh
    const { data: gongList } = await supabase
      .from('GongKinh')
      .select('id, ten_gong, ton_kho, muc_ton_can_co, branch_id')
      .eq('tenant_id', tenantId)
      .eq('trang_thai', true)
      .in('branch_id', branchIds);

    const gongByName: Record<string, any> = {};
    for (const g of gongList || []) {
      if (!gongByName[g.ten_gong]) {
        gongByName[g.ten_gong] = { ten: g.ten_gong, per_branch: {}, muc_min: g.muc_ton_can_co || 2 };
      }
      gongByName[g.ten_gong].per_branch[g.branch_id] = g.ton_kho || 0;
    }
    const gongRows = Object.values(gongByName)
      .map((r: any) => ({
        ...r,
        tong: branchIds.reduce((s: number, bid: string) => s + (r.per_branch[bid] || 0), 0),
        co_canh_bao: branchIds.some((bid: string) => (r.per_branch[bid] ?? 0) <= r.muc_min),
      }))
      .sort((a: any, b: any) => a.ten.localeCompare(b.ten, 'vi'));

    // 4. Tồn kho cảnh báo (hết hàng hoặc sắp hết)
    const alerts: any[] = [];

    for (const t of thuocRows) {
      for (const bid of branchIds) {
        const qty = t.per_branch[bid] ?? null;
        if (qty !== null && qty <= t.muc_min) {
          const branchName = branches.find((b: any) => b.id === bid)?.ten_chi_nhanh || bid;
          alerts.push({
            loai: 'thuoc',
            ten: t.ten,
            chi_nhanh: branchName,
            branch_id: bid,
            ton_kho: qty,
            muc_min: t.muc_min,
            trang_thai: qty <= 0 ? 'HET' : 'SAP_HET',
          });
        }
      }
    }

    for (const g of gongRows) {
      for (const bid of branchIds) {
        const qty = g.per_branch[bid] ?? null;
        if (qty !== null && qty <= g.muc_min) {
          const branchName = branches.find((b: any) => b.id === bid)?.ten_chi_nhanh || bid;
          alerts.push({
            loai: 'gong_kinh',
            ten: g.ten,
            chi_nhanh: branchName,
            branch_id: bid,
            ton_kho: qty,
            muc_min: g.muc_min,
            trang_thai: qty <= 0 ? 'HET' : 'SAP_HET',
          });
        }
      }
    }

    return res.status(200).json({
      branches,
      thuoc: thuocRows,
      gong: gongRows,
      alerts: alerts.sort((a, b) => a.ton_kho - b.ton_kho),
    });
  } catch (err: any) {
    console.error('inventory-overview API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
