// API: Cảnh báo tồn kho thấp (tổng hợp tất cả loại hàng)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const alerts: any[] = [];

    // Tròng kính sắp hết
    const { data: lensAlerts } = await supabase
      .from('lens_stock')
      .select('id, sph, cyl, add_power, ton_hien_tai, muc_ton_toi_thieu, muc_nhap_goi_y, trang_thai_ton, HangTrong(ten_hang)')
      .eq('tenant_id', tenantId)
      .in('trang_thai_ton', ['HET', 'SAP_HET']);

    (lensAlerts || []).forEach((item: any) => {
      alerts.push({
        loai_hang: 'trong_kinh',
        ten: item.HangTrong?.ten_hang || '',
        chi_tiet: `${item.sph}/${item.cyl}${item.add_power != null ? ` ADD:${item.add_power}` : ''}`,
        ton_kho: item.ton_hien_tai,
        muc_toi_thieu: item.muc_ton_toi_thieu,
        can_nhap: Math.max(item.muc_nhap_goi_y - item.ton_hien_tai, 0),
        trang_thai: item.trang_thai_ton,
      });
    });

    // Gọng kính sắp hết
    const { data: frameAlerts } = await supabase
      .from('GongKinh')
      .select('id, ten_gong, mau_sac, ton_kho, muc_ton_toi_thieu')
      .eq('tenant_id', tenantId)
      .not('trang_thai', 'eq', false);

    (frameAlerts || []).filter((f: any) =>
      (f.ton_kho ?? 0) <= (f.muc_ton_toi_thieu ?? 2)
    ).forEach((item: any) => {
      alerts.push({
        loai_hang: 'gong_kinh',
        ten: item.ten_gong,
        chi_tiet: item.mau_sac || '',
        ton_kho: item.ton_kho ?? 0,
        muc_toi_thieu: item.muc_ton_toi_thieu ?? 2,
        can_nhap: Math.max((item.muc_ton_toi_thieu ?? 2) - (item.ton_kho ?? 0), 0),
        trang_thai: (item.ton_kho ?? 0) <= 0 ? 'HET' : 'SAP_HET',
      });
    });

    // Thuốc sắp hết
    const { data: medAlerts } = await supabase
      .from('Thuoc')
      .select('id, tenthuoc, donvitinh, tonkho, muc_ton_toi_thieu')
      .eq('tenant_id', tenantId);

    (medAlerts || []).filter((m: any) =>
      (m.tonkho ?? 0) <= (m.muc_ton_toi_thieu ?? 10)
    ).forEach((item: any) => {
      alerts.push({
        loai_hang: 'thuoc',
        ten: item.tenthuoc,
        chi_tiet: item.donvitinh || '',
        ton_kho: item.tonkho ?? 0,
        muc_toi_thieu: item.muc_ton_toi_thieu ?? 10,
        can_nhap: Math.max((item.muc_ton_toi_thieu ?? 10) - (item.tonkho ?? 0), 0),
        trang_thai: (item.tonkho ?? 0) <= 0 ? 'HET' : 'SAP_HET',
      });
    });

    // Vật tư sắp hết
    const { data: supplyAlerts } = await supabase
      .from('medical_supply')
      .select('id, ten_vat_tu, don_vi_tinh, ton_kho, muc_ton_toi_thieu')
      .eq('tenant_id', tenantId)
      .eq('trang_thai', 'active');

    (supplyAlerts || []).filter((s: any) =>
      s.ton_kho <= s.muc_ton_toi_thieu
    ).forEach((item: any) => {
      alerts.push({
        loai_hang: 'vat_tu',
        ten: item.ten_vat_tu,
        chi_tiet: item.don_vi_tinh || '',
        ton_kho: item.ton_kho,
        muc_toi_thieu: item.muc_ton_toi_thieu,
        can_nhap: Math.max(item.muc_ton_toi_thieu - item.ton_kho, 0),
        trang_thai: item.ton_kho <= 0 ? 'HET' : 'SAP_HET',
      });
    });

    // Tròng cần đặt (chờ đặt)
    const { data: pendingOrders } = await supabase
      .from('lens_order')
      .select('id, sph, cyl, add_power, so_luong_mieng, HangTrong(ten_hang)')
      .eq('tenant_id', tenantId)
      .eq('trang_thai', 'cho_dat');

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
