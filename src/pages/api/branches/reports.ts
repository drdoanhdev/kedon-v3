// API: Báo cáo chuỗi (chain reports) - doanh thu, kho, nhân sự theo chi nhánh
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'chain_reports', 'view_reports'))) return;
  const { tenantId } = ctx;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from as string).toISOString() : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const toDate = to ? new Date(to as string).toISOString() : new Date().toISOString();

    // 1. Lấy danh sách chi nhánh
    const { data: branches } = await supabase
      .from('branches')
      .select('id, ten_chi_nhanh, is_main, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('is_main', { ascending: false });

    if (!branches || branches.length === 0) {
      return res.status(200).json({ branches: [], reports: [] });
    }

    // 2. Tính doanh thu & số lượng đơn cho mỗi chi nhánh
    const reports = await Promise.all(branches.map(async (branch) => {
      const [donThuocRes, donKinhRes, patientRes, staffRes] = await Promise.all([
        // Đơn thuốc
        supabase
          .from('DonThuoc')
          .select('id, tongtien, created_at')
          .eq('tenant_id', tenantId)
          .eq('branch_id', branch.id)
          .gte('created_at', fromDate)
          .lte('created_at', toDate),
        // Đơn kính
        supabase
          .from('DonKinh')
          .select('id, giatrong, giagong, giagongrieng, created_at')
          .eq('tenant_id', tenantId)
          .eq('branch_id', branch.id)
          .gte('created_at', fromDate)
          .lte('created_at', toDate),
        // Bệnh nhân
        supabase
          .from('BenhNhan')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('branch_id', branch.id),
        // Nhân viên
        supabase
          .from('staff_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('branch_id', branch.id)
          .is('to_date', null),
      ]);

      const donThuoc = donThuocRes.data || [];
      const donKinh = donKinhRes.data || [];

      const doanhThuThuoc = donThuoc.reduce((sum: number, d: any) => sum + (d.tongtien || 0), 0);
      const doanhThuKinh = donKinh.reduce((sum: number, d: any) =>
        sum + (d.giatrong || 0) + (d.giagong || 0) + (d.giagongrieng || 0), 0);

      return {
        branch_id: branch.id,
        ten_chi_nhanh: branch.ten_chi_nhanh,
        is_main: branch.is_main,
        so_don_thuoc: donThuoc.length,
        so_don_kinh: donKinh.length,
        doanh_thu_thuoc: doanhThuThuoc,
        doanh_thu_kinh: doanhThuKinh,
        tong_doanh_thu: doanhThuThuoc + doanhThuKinh,
        so_benh_nhan: patientRes.count || 0,
        so_nhan_vien: staffRes.count || 0,
      };
    }));

    // 3. Tổng hợp
    const tongHop = {
      tong_doanh_thu: reports.reduce((s, r) => s + r.tong_doanh_thu, 0),
      tong_don_thuoc: reports.reduce((s, r) => s + r.so_don_thuoc, 0),
      tong_don_kinh: reports.reduce((s, r) => s + r.so_don_kinh, 0),
      tong_benh_nhan: reports.reduce((s, r) => s + r.so_benh_nhan, 0),
      tong_nhan_vien: reports.reduce((s, r) => s + r.so_nhan_vien, 0),
    };

    // 4. Lấy thống kê điều chuyển
    const { data: transfers } = await supabase
      .from('branch_transfers')
      .select('id, status, loai', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('created_at', fromDate)
      .lte('created_at', toDate);

    const transferStats = {
      tong: transfers?.length || 0,
      pending: transfers?.filter((t: any) => t.status === 'pending').length || 0,
      completed: transfers?.filter((t: any) => t.status === 'completed').length || 0,
    };

    return res.status(200).json({
      branches,
      reports,
      tongHop,
      transferStats,
      period: { from: fromDate, to: toDate },
    });
  } catch (err: any) {
    console.error('chain-reports API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
