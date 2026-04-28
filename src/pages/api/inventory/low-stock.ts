// API: Cảnh báo tồn kho thấp (kho kính: tròng + gọng)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_lens', 'manage_inventory'))) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  const { branchId } = branchAccess;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // type: 'kinh' = chỉ tròng+gọng, 'thuoc' = chỉ thuốc, undefined = tất cả
    const { type } = req.query;
    const alerts: any[] = [];

    // Tròng kính sắp hết
    if (type !== 'thuoc') {
    let lensQuery = supabase
      .from('lens_stock')
      .select('id, sph, cyl, add_power, ton_hien_tai, muc_ton_can_co, trang_thai_ton, HangTrong(ten_hang)')
      .eq('tenant_id', tenantId)
      .in('trang_thai_ton', ['HET', 'SAP_HET']);

    if (branchId) {
      lensQuery = lensQuery.eq('branch_id', branchId);
    }

    const { data: lensAlerts } = await lensQuery;

    (lensAlerts || []).forEach((item: any) => {
      alerts.push({
        loai_hang: 'trong_kinh',
        ten: item.HangTrong?.ten_hang || '',
        chi_tiet: `${item.sph}/${item.cyl}${item.add_power != null ? ` ADD:${item.add_power}` : ''}`,
        ton_kho: item.ton_hien_tai,
        muc_toi_thieu: item.muc_ton_can_co,
        can_nhap: Math.max(item.muc_ton_can_co - item.ton_hien_tai, 0),
        trang_thai: item.trang_thai_ton,
      });
    });
    }

    // Gọng kính sắp hết
    if (type !== 'thuoc') {
    let frameQuery = supabase
      .from('GongKinh')
      .select('id, ten_gong, mau_sac, ton_kho, muc_ton_can_co')
      .eq('tenant_id', tenantId)
      .not('trang_thai', 'eq', false);

    if (branchId) {
      frameQuery = frameQuery.eq('branch_id', branchId);
    }

    const { data: frameAlerts } = await frameQuery;

    (frameAlerts || []).filter((f: any) =>
      (f.ton_kho ?? 0) <= (f.muc_ton_can_co ?? 2)
    ).forEach((item: any) => {
      alerts.push({
        loai_hang: 'gong_kinh',
        ten: item.ten_gong,
        chi_tiet: item.mau_sac || '',
        ton_kho: item.ton_kho ?? 0,
        muc_toi_thieu: item.muc_ton_can_co ?? 2,
        can_nhap: Math.max((item.muc_ton_can_co ?? 2) - (item.ton_kho ?? 0), 0),
        trang_thai: (item.ton_kho ?? 0) <= 0 ? 'HET' : 'SAP_HET',
      });
    });
    }

    // Thuốc sắp hết / đã hết
    if (type !== 'kinh') {
    let thuocQuery = supabase
      .from('Thuoc')
      .select('id, tenthuoc, donvitinh, tonkho, muc_ton_can_co, ngung_kinh_doanh')
      .eq('tenant_id', tenantId)
      .or('la_thu_thuat.is.null,la_thu_thuat.eq.false')
      .or('ngung_kinh_doanh.is.null,ngung_kinh_doanh.eq.false');

    if (branchId) {
      thuocQuery = thuocQuery.eq('branch_id', branchId);
    }

    const { data: thuocAlerts } = await thuocQuery;

    (thuocAlerts || []).filter((t: any) =>
      (t.tonkho ?? 0) <= (t.muc_ton_can_co ?? 10)
    ).forEach((item: any) => {
      const tonkho = item.tonkho ?? 0;
      const mucMin = item.muc_ton_can_co ?? 10;
      alerts.push({
        loai_hang: 'thuoc',
        ten: item.tenthuoc,
        chi_tiet: item.donvitinh || '',
        ton_kho: tonkho,
        muc_toi_thieu: mucMin,
        can_nhap: Math.max(mucMin - tonkho, 0),
        trang_thai: tonkho <= 0 ? 'HET' : 'SAP_HET',
      });
    });
    }

    // Tròng cần đặt (chờ đặt)
    let pendingQuery = supabase
      .from('lens_order')
      .select('id, sph, cyl, add_power, so_luong_mieng, HangTrong(ten_hang), DonKinh(branch_id)')
      .eq('tenant_id', tenantId)
      .eq('trang_thai', 'cho_dat');

    const { data: pendingOrdersRaw } = await pendingQuery;
    const pendingOrders = branchId
      ? (pendingOrdersRaw || []).filter((o: any) => o?.DonKinh?.branch_id === branchId)
      : pendingOrdersRaw;

    return res.status(200).json({
      alerts: alerts.sort((a, b) =>
        a.trang_thai === 'HET' ? -1 : b.trang_thai === 'HET' ? 1 : 0
      ),
      pending_lens_orders: pendingOrders?.length || 0,
      summary: {
        het: alerts.filter(a => a.trang_thai === 'HET').length,
        sap_het: alerts.filter(a => a.trang_thai === 'SAP_HET').length,
        total: alerts.length,
      },
    });
  } catch (err: any) {
    console.error('low-stock error:', err);
    return res.status(500).json({ error: err.message });
  }
}
