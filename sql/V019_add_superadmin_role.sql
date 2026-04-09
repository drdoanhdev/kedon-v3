-- ============================================
-- THÊM ROLE SUPERADMIN CHO ADMIN NỀN TẢNG
-- ============================================
-- superadmin = quản trị viên nền tảng SaaS (bạn)
-- Khác với owner/admin phòng khám — superadmin quản lý TẤT CẢ tenants

-- 1. Mở rộng constraint cho user_roles
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check 
  CHECK (role IN ('superadmin', 'admin', 'doctor', 'staff'));

-- 2. Gán superadmin cho tài khoản của bạn (thay <your-email> hoặc <your-user-id>)
-- Cách 1: Nếu biết user_id
-- UPDATE user_roles SET role = 'superadmin' WHERE user_id = '<your-user-id>';

-- Cách 2: Nếu biết email (tìm user_id từ auth.users rồi cập nhật)
-- UPDATE user_roles SET role = 'superadmin' 
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');

-- LƯU Ý: Chạy 1 trong 2 câu trên sau khi uncomment và thay đúng giá trị
