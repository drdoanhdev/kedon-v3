/**
 * API Admin: Thống kê tổng quan nền tảng
 * GET — Số phòng khám, users, đơn thuốc, doanh thu
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '../../../lib/adminGuard';
import { supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Chạy song song tất cả query thống kê
    const [
      tenantsResult,
      usersResult,
      donThuocResult,
      donKinhResult,
      paidOrdersResult,
      tenantsByPlanResult,
    ] = await Promise.all([
      // Tổng phòng khám
      supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true }),
      // Tổng users
      supabaseAdmin.auth.admin.listUsers(),
      // Tổng đơn thuốc
      supabaseAdmin.from('DonThuoc').select('id', { count: 'exact', head: true }),
      // Tổng đơn kính
      supabaseAdmin.from('DonKinh').select('id', { count: 'exact', head: true }),
      // Doanh thu (đơn đã thanh toán)
      supabaseAdmin.from('payment_orders').select('amount').eq('status', 'paid'),
      // Phân bố theo plan
      supabaseAdmin.from('tenants').select('plan'),
    ]);

    const totalTenants = tenantsResult.count || 0;
    const totalUsers = usersResult.data?.users?.length || 0;
    const totalPrescriptions = (donThuocResult.count || 0) + (donKinhResult.count || 0);
    const totalRevenue = (paidOrdersResult.data || []).reduce((sum, o) => sum + (o.amount || 0), 0);

    // Đếm phòng khám theo plan
    const planCounts: Record<string, number> = {};
    for (const t of (tenantsByPlanResult.data || [])) {
      const p = t.plan || 'trial';
      planCounts[p] = (planCounts[p] || 0) + 1;
    }

    return res.status(200).json({
      totalTenants,
      totalUsers,
      totalPrescriptions,
      totalRevenue,
      planDistribution: planCounts,
    });
  } catch (err: any) {
    return res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}
