-- ============================================
-- V042: Phân gói dịch vụ & Phân quyền tài khoản
-- 1. Cập nhật bảng subscription_plans (giá mới + allowed_features)
-- 2. Tạo bảng plan_features (feature registry)
-- ============================================

-- Thêm cột allowed_features (feature keys cho gating logic)
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS allowed_features TEXT[] DEFAULT '{}';

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_branches INTEGER DEFAULT 1;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS branch_addon_price BIGINT DEFAULT 0;

-- Cập nhật gói Trial
UPDATE subscription_plans SET
  price = 0,
  period_label = '3 tháng hoặc 1.000 đơn',
  max_users = 1,
  max_branches = 1,
  features = ARRAY[
    'Quản lý bệnh nhân',
    'Kê đơn thuốc & kính',
    'Phòng chờ khám',
    'Danh mục thuốc cơ bản',
    'Báo cáo cơ bản',
    '1 người dùng'
  ],
  allowed_features = ARRAY[
    'patient_management',
    'prescription_medicine',
    'prescription_glasses',
    'waiting_room',
    'drug_catalog',
    'basic_reports',
    'categories'
  ],
  updated_at = now()
WHERE plan_key = 'trial';

-- Cập nhật gói Cơ bản (99k)
UPDATE subscription_plans SET
  price = 99000,
  period_label = '/tháng',
  max_users = 1,
  max_branches = 1,
  features = ARRAY[
    'Tất cả tính năng Dùng thử',
    'Đơn thuốc không giới hạn',
    'Lịch hẹn khám',
    'Cấu hình mẫu in',
    'Hỗ trợ qua tin nhắn',
    '1 người dùng'
  ],
  allowed_features = ARRAY[
    'patient_management',
    'prescription_medicine',
    'prescription_glasses',
    'waiting_room',
    'drug_catalog',
    'basic_reports',
    'categories',
    'appointments',
    'print_config',
    'notifications'
  ],
  updated_at = now()
WHERE plan_key = 'basic';

-- Cập nhật gói Chuyên nghiệp (199k)
UPDATE subscription_plans SET
  price = 199000,
  period_label = '/tháng',
  max_users = 10,
  max_branches = 1,
  features = ARRAY[
    'Tất cả tính năng Cơ bản',
    'Quản lý kho kính & thuốc',
    'Báo cáo nâng cao',
    'Chăm sóc khách hàng (CRM)',
    'Quản lý nhân viên (4 cấp)',
    'Phân quyền chi tiết',
    'Tối đa 10 người dùng',
    'Hỗ trợ ưu tiên'
  ],
  allowed_features = ARRAY[
    'patient_management',
    'prescription_medicine',
    'prescription_glasses',
    'waiting_room',
    'drug_catalog',
    'basic_reports',
    'categories',
    'appointments',
    'print_config',
    'notifications',
    'inventory_lens',
    'inventory_drug',
    'advanced_reports',
    'crm',
    'multi_staff',
    'clinic_settings'
  ],
  is_popular = true,
  updated_at = now()
WHERE plan_key = 'pro';

-- Thêm gói Enterprise (nếu chưa có)
INSERT INTO subscription_plans (
  plan_key, name, price, period_label, max_users, max_branches, branch_addon_price,
  features, allowed_features, is_popular, sort_order, is_active
)
VALUES (
  'enterprise', 'Cao cấp', 199000, '/tháng + 79.000đ/chi nhánh', NULL, 999, 79000,
  ARRAY[
    'Tất cả tính năng Chuyên nghiệp',
    'Quản lý đa chi nhánh',
    'Điều chuyển nhân viên giữa chi nhánh',
    'Chuyển kho giữa cửa hàng',
    'Chấm công nhân viên',
    'Báo cáo tổng hợp chuỗi',
    'Không giới hạn người dùng',
    'Hỗ trợ cao cấp'
  ],
  ARRAY[
    'patient_management',
    'prescription_medicine',
    'prescription_glasses',
    'waiting_room',
    'drug_catalog',
    'basic_reports',
    'categories',
    'appointments',
    'print_config',
    'notifications',
    'inventory_lens',
    'inventory_drug',
    'advanced_reports',
    'crm',
    'multi_staff',
    'clinic_settings',
    'multi_branch',
    'branch_transfer',
    'chain_reports',
    'staff_attendance',
    'staff_transfer'
  ],
  false, 3, false  -- is_active = false (chưa mở bán)
)
ON CONFLICT (plan_key) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  period_label = EXCLUDED.period_label,
  max_users = EXCLUDED.max_users,
  max_branches = EXCLUDED.max_branches,
  branch_addon_price = EXCLUDED.branch_addon_price,
  features = EXCLUDED.features,
  allowed_features = EXCLUDED.allowed_features,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
