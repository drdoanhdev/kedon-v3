// API: Lấy danh sách gói dịch vụ (public - cho trang billing)
// Fallback về hardcoded nếu bảng chưa tồn tại
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/tenantApi';

const FALLBACK_PLANS = [
  { plan_key: 'trial', name: 'Dùng thử', price: 0, period_label: '3 tháng hoặc 1.000 đơn', features: ['Quản lý bệnh nhân', 'Kê đơn thuốc & kính', 'Báo cáo cơ bản', '1 người dùng'], is_popular: false, max_users: 1 },
  { plan_key: 'basic', name: 'Cơ bản', price: 299000, period_label: '/tháng', features: ['Tất cả tính năng Trial', 'Đơn thuốc không giới hạn', 'Tối đa 3 người dùng', 'Hỗ trợ email'], is_popular: false, max_users: 3 },
  { plan_key: 'pro', name: 'Chuyên nghiệp', price: 599000, period_label: '/tháng', features: ['Tất cả tính năng Cơ bản', 'Nhân viên không giới hạn', 'Báo cáo nâng cao', 'Nhận diện khuôn mặt', 'Hỗ trợ ưu tiên'], is_popular: true, max_users: null },
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
