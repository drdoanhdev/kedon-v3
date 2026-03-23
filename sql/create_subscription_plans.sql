-- ============================================
-- BẢNG GÓI DỊCH VỤ (subscription_plans)
-- Quản lý giá và tính năng từ trang admin
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  plan_key TEXT NOT NULL UNIQUE,        -- 'trial', 'basic', 'pro', 'enterprise'
  name TEXT NOT NULL,                    -- 'Dùng thử', 'Cơ bản', 'Chuyên nghiệp'
  price BIGINT NOT NULL DEFAULT 0,       -- Giá/tháng (VND), 0 = miễn phí
  period_label TEXT DEFAULT '/tháng',    -- Hiển thị: '/tháng', '3 tháng hoặc 1.000 đơn'
  features TEXT[] DEFAULT '{}',          -- Mảng tính năng hiển thị
  is_popular BOOLEAN DEFAULT false,      -- Đánh dấu gói phổ biến
  is_active BOOLEAN DEFAULT true,        -- Ẩn/hiện gói
  sort_order INTEGER DEFAULT 0,          -- Thứ tự hiển thị
  trial_days INTEGER,                    -- Chỉ cho gói trial (số ngày dùng thử)
  trial_max_prescriptions INTEGER,       -- Chỉ cho gói trial (giới hạn đơn)
  max_users INTEGER,                     -- Giới hạn user (null = không giới hạn)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Dữ liệu mặc định
INSERT INTO subscription_plans (plan_key, name, price, period_label, features, is_popular, sort_order, trial_days, trial_max_prescriptions, max_users)
VALUES
  ('trial', 'Dùng thử', 0, '3 tháng hoặc 1.000 đơn', ARRAY['Quản lý bệnh nhân', 'Kê đơn thuốc & kính', 'Báo cáo cơ bản', '1 người dùng'], false, 0, 90, 1000, 1),
  ('basic', 'Cơ bản', 299000, '/tháng', ARRAY['Tất cả tính năng Trial', 'Đơn thuốc không giới hạn', 'Tối đa 3 người dùng', 'Hỗ trợ email'], false, 1, NULL, NULL, 3),
  ('pro', 'Chuyên nghiệp', 599000, '/tháng', ARRAY['Tất cả tính năng Cơ bản', 'Nhân viên không giới hạn', 'Báo cáo nâng cao', 'Nhận diện khuôn mặt', 'Hỗ trợ ưu tiên'], true, 2, NULL, NULL, NULL)
ON CONFLICT (plan_key) DO NOTHING;

-- Không cần RLS vì bảng này public read, chỉ superadmin write
-- Superadmin thao tác qua supabaseAdmin (service role key)
