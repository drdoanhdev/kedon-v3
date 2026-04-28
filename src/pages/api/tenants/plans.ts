// API: Lấy danh sách gói dịch vụ (public - cho trang billing)
// Fallback về hardcoded nếu bảng chưa tồn tại
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/tenantApi';

const FALLBACK_PLANS = [
  { plan_key: 'trial', name: 'Dùng thử', price: 0, period_label: '3 tháng hoặc 1.000 đơn', features: ['Quản lý bệnh nhân', 'Kê đơn thuốc & kính', 'Phòng chờ khám', 'Danh mục thuốc cơ bản', 'Báo cáo cơ bản', '1 người dùng'], is_popular: false, max_users: 1 },
  { plan_key: 'basic', name: 'Cơ bản', price: 99000, period_label: '/tháng', features: ['Tất cả tính năng Dùng thử', 'Đơn thuốc không giới hạn', 'Lịch hẹn khám', 'Cấu hình mẫu in', 'Hỗ trợ qua tin nhắn', '1 người dùng'], is_popular: false, max_users: 1 },
  { plan_key: 'pro', name: 'Chuyên nghiệp', price: 199000, period_label: '/tháng', features: ['Tất cả tính năng Cơ bản', 'Quản lý kho kính & thuốc', 'Báo cáo nâng cao', 'Chăm sóc khách hàng (CRM)', 'Quản lý nhân viên (4 cấp)', 'Phân quyền chi tiết', 'Tối đa 10 người dùng', 'Hỗ trợ ưu tiên'], is_popular: true, max_users: 10 },
  { plan_key: 'enterprise', name: 'Doanh nghiệp', price: 199000, period_label: '/tháng', features: ['Tất cả tính năng Chuyên nghiệp', 'Quản lý chuỗi cửa hàng', 'Giá: 199K + 79K/chi nhánh thêm', 'Điều chuyển kho giữa chi nhánh', 'Tra cứu khách hàng liên chi nhánh', 'Báo cáo chuỗi tổng hợp', 'Điều chuyển nhân viên', 'Không giới hạn người dùng', 'Hỗ trợ 24/7'], is_popular: false, max_users: 999 },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .select('plan_key, name, price, period_label, features, is_popular, max_users, trial_days, trial_max_prescriptions')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      // Bảng chưa tạo → trả fallback
      console.warn('subscription_plans not found, using fallback:', error.message);
      return res.status(200).json(FALLBACK_PLANS);
    }

    return res.status(200).json(data && data.length > 0 ? data : FALLBACK_PLANS);
  } catch (err: any) {
    console.error('tenants/plans error:', err);
    return res.status(200).json(FALLBACK_PLANS);
  }
}
