-- Thêm cột plan_source để phân biệt gói do admin kích hoạt hay khách hàng mua
-- 'trial' = mặc định khi đăng ký, 'admin' = superadmin kích hoạt, 'payment' = khách hàng thanh toán
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_source TEXT NOT NULL DEFAULT 'trial' CHECK (plan_source IN ('trial', 'admin', 'payment'));
