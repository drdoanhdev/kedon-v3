// API: Báo cáo chuỗi (chain reports) - doanh thu, kho, nhân sự theo chi nhánh
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

// Helper: tính doanh thu + đơn cho 1 chi nhánh trong 1 khoảng thời gian
async function calcBranchStats(tenantId: string, branchId: string, fromDate: string, toDate: string) {
  const [donThuocRes, donKinhRes] = await Promise.all([
    supabase
      .from('DonThuoc')
      .select('id, tongtien')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .gte('created_at', fromDate)
      .lte('created_at', toDate),
    supabase
      .from('DonKinh')
      .select('id, giatrong, giagong, giagongrieng')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .gte('created_at', fromDate)
      .lte('created_at', toDate),
  ]);
  const donThuoc = donThuocRes.data || [];
  const donKinh = donKinhRes.data || [];
  const doanhThuThuoc = donThuoc.reduce((s: number, d: any) => s + (d.tongtien || 0), 0);
  const doanhThuKinh = donKinh.reduce((s: number, d: any) =>
    s + (d.giatrong || 0) + (d.giagong || 0) + (d.giagongrieng || 0), 0);
  return {
    so_don_thuoc: donThuoc.length,
    so_don_kinh: donKinh.length,
    doanh_thu_thuoc: doanhThuThuoc,
    doanh_thu_kinh: doanhThuKinh,
    tong_doanh_thu: doanhThuThuoc + doanhThuKinh,
  };
}

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

    // Previous period (same duration, shifted back)
    const periodMs = new Date(toDate).getTime() - new Date(fromDate).getTime();
    const prevFromDate = new Date(new Date(fromDate).getTime() - periodMs).toISOString();
    const prevToDate = fromDate;

    // Today's range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayFrom = todayStart.toISOString();
    const todayTo = todayEnd.toISOString();

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

    // 2. Tính doanh thu & số lượng đơn cho mỗi chi nhánh (current + previous + today)
    const reports = await Promise.all(branches.map(async (branch) => {
      const [currentStats, prevStats, todayStats, patientRes, staffRes, newPatientRes] = await Promise.all([
        calcBranchStats(tenantId, branch.id, fromDate, toDate),
        calcBranchStats(tenantId, branch.id, prevFromDate, prevToDate),
        calcBranchStats(tenantId, branch.id, todayFrom, todayTo),
        // Tổng bệnh nhân (all time)
        supabase
          .from('BenhNhan')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('branch_id', branch.id),
        // Nhân viên hiện tại
        supabase
          .from('staff_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('branch_id', branch.id)
          .is('to_date', null),
        // Bệnh nhân mới trong kỳ
        supabase
          .from('BenhNhan')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('branch_id', branch.id)
          .gte('created_at', fromDate)
          .lte('created_at', toDate),
      ]);

      // Tính trend so với kỳ trước
      const trendPct = prevStats.tong_doanh_thu > 0
        ? Math.round(((currentStats.tong_doanh_thu - prevStats.tong_doanh_thu) / prevStats.tong_doanh_thu) * 100)
        : currentStats.tong_doanh_thu > 0 ? 100 : 0;

      return {
        branch_id: branch.id,
        ten_chi_nhanh: branch.ten_chi_nhanh,
        is_main: branch.is_main,
        // Current period
        so_don_thuoc: currentStats.so_don_thuoc,
        so_don_kinh: currentStats.so_don_kinh,
        doanh_thu_thuoc: currentStats.doanh_thu_thuoc,
        doanh_thu_kinh: currentStats.doanh_thu_kinh,
        tong_doanh_thu: currentStats.tong_doanh_thu,
        so_benh_nhan: patientRes.count || 0,
        so_benh_nhan_moi: newPatientRes.count || 0,
        so_nhan_vien: staffRes.count || 0,
        // Today
        hom_nay_doanh_thu: todayStats.tong_doanh_thu,
        hom_nay_don_thuoc: todayStats.so_don_thuoc,
        hom_nay_don_kinh: todayStats.so_don_kinh,
        // Trend
        trend_pct: trendPct,
        prev_doanh_thu: prevStats.tong_doanh_thu,
      };
    }));

    // 3. Tổng hợp
    const tongHop = {
      tong_doanh_thu: reports.reduce((s, r) => s + r.tong_doanh_thu, 0),
      tong_don_thuoc: reports.reduce((s, r) => s + r.so_don_thuoc, 0),
      tong_don_kinh: reports.reduce((s, r) => s + r.so_don_kinh, 0),
      tong_benh_nhan: reports.reduce((s, r) => s + r.so_benh_nhan, 0),
      tong_benh_nhan_moi: reports.reduce((s, r) => s + r.so_benh_nhan_moi, 0),
      tong_nhan_vien: reports.reduce((s, r) => s + r.so_nhan_vien, 0),
    };

    // 4. Tổng hợp hôm nay
    const homNay = {
      tong_doanh_thu: reports.reduce((s, r) => s + r.hom_nay_doanh_thu, 0),
      tong_don_thuoc: reports.reduce((s, r) => s + r.hom_nay_don_thuoc, 0),
      tong_don_kinh: reports.reduce((s, r) => s + r.hom_nay_don_kinh, 0),
      per_branch: reports.map(r => ({
        branch_id: r.branch_id,
        ten_chi_nhanh: r.ten_chi_nhanh,
        doanh_thu: r.hom_nay_doanh_thu,
        don_thuoc: r.hom_nay_don_thuoc,
        don_kinh: r.hom_nay_don_kinh,
      })),
    };

    // 5. Ranking chi nhánh theo doanh thu (sort descending)
    const ranking = [...reports]
      .sort((a, b) => b.tong_doanh_thu - a.tong_doanh_thu)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    // 6. Staff KPI - lấy danh sách nhân viên + số đơn mỗi branch
    const staffPerBranch: Record<string, any[]> = {};
    const allAssignments = await supabase
      .from('staff_assignments')
      .select('user_id, branch_id, from_date')
      .eq('tenant_id', tenantId)
      .is('to_date', null);

    if (allAssignments.data && allAssignments.data.length > 0) {
      const userIds = [...new Set(allAssignments.data.map((a: any) => a.user_id))];
      const [profilesRes, membershipsRes] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, phone').in('id', userIds),
        supabase.from('tenantmembership').select('user_id, role').eq('tenant_id', tenantId).in('user_id', userIds),
      ]);
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
      const roleMap = new Map((membershipsRes.data || []).map((m: any) => [m.user_id, m.role]));

      for (const a of allAssignments.data) {
        const profile = profileMap.get(a.user_id);
        const role = roleMap.get(a.user_id);
        if (!staffPerBranch[a.branch_id]) staffPerBranch[a.branch_id] = [];
        staffPerBranch[a.branch_id].push({
          user_id: a.user_id,
          full_name: profile?.full_name || 'Chưa cập nhật',
          phone: profile?.phone,
          role: role || 'staff',
          from_date: a.from_date,
        });
      }
    }

    // 7. Lấy thống kê điều chuyển
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
      ranking,
      tongHop,
      homNay,
      staffPerBranch,
      transferStats,
      period: { from: fromDate, to: toDate },
    });
  } catch (err: any) {
    console.error('chain-reports API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
