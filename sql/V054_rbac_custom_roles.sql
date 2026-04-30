-- =====================================================================
-- V054: RBAC giai đoạn 1 — Cho phép tenant tùy biến quyền theo vai trò
-- =====================================================================
-- Mục tiêu:
--   - Giữ nguyên 4 role hiện hữu (owner/admin/doctor/staff) để không phá
--     code đang chạy.
--   - Tách "tập permission của một role" thành dữ liệu (table-driven),
--     thay vì hardcode trong featureConfig.ts.
--   - Cho phép admin tenant TICK / BỎ TICK quyền cho từng role
--     (giống màn hình "Sửa vai trò" của KiotViet).
--
-- Nguyên tắc thiết kế (an toàn, không vỡ hệ thống):
--   1. KHÔNG đổi schema cũ: `tenantmembership.role TEXT` vẫn nguyên.
--   2. THÊM bảng mới + cột `role_id` nullable trên tenantmembership.
--   3. Backfill: mỗi tenant được seed sẵn 4 role hệ thống với matrix
--      đúng bằng ROLE_PERMISSIONS hiện tại trong featureConfig.ts.
--   4. Owner role là `is_system = TRUE` và `is_protected = TRUE`
--      → KHÔNG ai xóa hoặc bỏ quyền `manage_billing` / `manage_clinic`
--      của owner để tránh tenant tự khóa chính mình ra ngoài.
--   5. App code có thể đọc song song 2 nguồn (role TEXT cũ và
--      tenant_role_permissions mới) trong giai đoạn chuyển tiếp.
--   6. Migration idempotent (IF NOT EXISTS).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Bảng catalog permission toàn hệ thống (master data, dùng chung)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permission_catalog (
  code        TEXT PRIMARY KEY,
  module      TEXT NOT NULL,        -- nhóm hiển thị trên UI: 'patients', 'inventory', 'reports', ...
  label       TEXT NOT NULL,        -- tên hiển thị tiếng Việt
  description TEXT,
  sort_order  INT NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE permission_catalog IS
  'Danh mục quyền toàn hệ thống. Đồng bộ với type Permission trong src/lib/featureConfig.ts.';

INSERT INTO permission_catalog (code, module, label, description, sort_order) VALUES
  ('manage_billing',       'system',   'Quản lý gói dịch vụ & thanh toán', 'Nâng/hạ gói, xem hóa đơn',                    10),
  ('manage_clinic',        'system',   'Cài đặt phòng khám',               'Sửa thông tin phòng khám, logo, địa chỉ',     20),
  ('manage_members',       'system',   'Quản lý thành viên',               'Mời/xóa nhân viên, đổi vai trò',              30),
  ('manage_branches',      'system',   'Quản lý chi nhánh',                'Tạo/sửa/xóa chi nhánh',                       40),
  ('manage_transfers',     'inventory','Quản lý điều chuyển kho',          'Điều chuyển hàng giữa các chi nhánh',         50),
  ('manage_inventory',     'inventory','Quản lý kho',                      'Nhập/xuất/kiểm kê thuốc, kính',               60),
  ('manage_categories',    'inventory','Quản lý danh mục',                 'Thuốc, gọng kính, tròng kính',                70),
  ('view_patients',        'patients', 'Xem bệnh nhân',                    'Xem danh sách & hồ sơ bệnh nhân',             80),
  ('manage_patients',      'patients', 'Thêm/sửa bệnh nhân',               'Tạo mới hoặc cập nhật hồ sơ',                 90),
  ('manage_waiting_room',  'patients', 'Quản lý phòng chờ',                'Đưa vào / gọi / hủy bệnh nhân',              100),
  ('manage_appointments',  'patients', 'Quản lý lịch hẹn',                 'Đặt/sửa/hủy lịch tái khám',                  110),
  ('write_prescription',   'medical',  'Kê đơn thuốc / kính',              'Tạo đơn thuốc, đơn kính',                    120),
  ('view_reports',         'reports',  'Xem báo cáo',                      'Báo cáo doanh thu, hoạt động',               130),
  ('view_revenue',         'reports',  'Xem doanh thu & giá bán',          'Truy cập số liệu tiền',                      140),
  ('manage_crm',           'crm',      'Chăm sóc khách hàng',              'Cập nhật trạng thái CSKH, gửi tin',          150),
  ('manage_print_config',  'system',   'Cấu hình mẫu in',                  'Sửa mẫu phiếu, đơn thuốc',                   160),
  ('manage_messaging',     'system',   'Cấu hình tin nhắn (Zalo/SMS)',     'Kết nối kênh, kịch bản tự động',             170)
ON CONFLICT (code) DO UPDATE
  SET module      = EXCLUDED.module,
      label       = EXCLUDED.label,
      description = EXCLUDED.description,
      sort_order  = EXCLUDED.sort_order;


-- ---------------------------------------------------------------------
-- 2. Bảng vai trò theo từng tenant
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,        -- slug: 'owner', 'admin', 'doctor', 'staff', 'cashier', ...
  name         TEXT NOT NULL,        -- tên hiển thị, tenant tự đặt: "Nhân viên thu ngân"
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT FALSE, -- 4 role mặc định = TRUE, không thể xóa
  is_protected BOOLEAN NOT NULL DEFAULT FALSE, -- owner role: KHÔNG được bỏ permission cốt lõi
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant ON tenant_roles(tenant_id);

COMMENT ON TABLE tenant_roles IS
  'Vai trò trong từng phòng khám. 4 role mặc định is_system=true; tenant có thể tạo thêm role mới.';


-- ---------------------------------------------------------------------
-- 3. Bảng mapping role → permission (ma trận tick/bỏ tick)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  role_id         UUID NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permission_catalog(code) ON DELETE CASCADE,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_trp_role ON tenant_role_permissions(role_id);

COMMENT ON TABLE tenant_role_permissions IS
  'Ma trận quyền của từng role. Mỗi dòng = 1 ô tick trong UI "Sửa vai trò".';


-- ---------------------------------------------------------------------
-- 4. Thêm liên kết từ tenantmembership → tenant_roles (KHÔNG bỏ cột role cũ)
-- ---------------------------------------------------------------------
ALTER TABLE tenantmembership
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES tenant_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenantmembership_role_id
  ON tenantmembership(role_id) WHERE role_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- 5. Function: seed 4 role mặc định cho 1 tenant
--    Idempotent — gọi lại nhiều lần không sinh trùng.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_default_tenant_roles(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role_id UUID;
BEGIN
  -- ===== owner: toàn quyền, protected =====
  INSERT INTO tenant_roles (tenant_id, code, name, description, is_system, is_protected)
  VALUES (p_tenant_id, 'owner', 'Chủ phòng khám', 'Toàn quyền — không thể xóa hoặc giảm quyền cốt lõi', TRUE, TRUE)
  ON CONFLICT (tenant_id, code) DO NOTHING
  RETURNING id INTO v_role_id;

  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM tenant_roles WHERE tenant_id = p_tenant_id AND code = 'owner';
  END IF;

  INSERT INTO tenant_role_permissions (role_id, permission_code)
  SELECT v_role_id, code FROM permission_catalog
  ON CONFLICT DO NOTHING;

  -- ===== admin: gần toàn quyền, không có manage_billing =====
  v_role_id := NULL;
  INSERT INTO tenant_roles (tenant_id, code, name, description, is_system, is_protected)
  VALUES (p_tenant_id, 'admin', 'Quản lý', 'Quản trị phòng khám trừ thanh toán gói', TRUE, FALSE)
  ON CONFLICT (tenant_id, code) DO NOTHING
  RETURNING id INTO v_role_id;
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM tenant_roles WHERE tenant_id = p_tenant_id AND code = 'admin';
  END IF;

  INSERT INTO tenant_role_permissions (role_id, permission_code)
  SELECT v_role_id, code FROM permission_catalog
   WHERE code <> 'manage_billing'
  ON CONFLICT DO NOTHING;

  -- ===== doctor =====
  v_role_id := NULL;
  INSERT INTO tenant_roles (tenant_id, code, name, description, is_system, is_protected)
  VALUES (p_tenant_id, 'doctor', 'Bác sĩ', 'Khám và kê đơn cho bệnh nhân', TRUE, FALSE)
  ON CONFLICT (tenant_id, code) DO NOTHING
  RETURNING id INTO v_role_id;
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM tenant_roles WHERE tenant_id = p_tenant_id AND code = 'doctor';
  END IF;

  INSERT INTO tenant_role_permissions (role_id, permission_code)
  SELECT v_role_id, code FROM permission_catalog
   WHERE code IN (
     'write_prescription', 'manage_patients', 'view_patients',
     'manage_waiting_room', 'manage_appointments', 'view_reports'
   )
  ON CONFLICT DO NOTHING;

  -- ===== staff =====
  v_role_id := NULL;
  INSERT INTO tenant_roles (tenant_id, code, name, description, is_system, is_protected)
  VALUES (p_tenant_id, 'staff', 'Nhân viên', 'Hỗ trợ tiếp đón và phòng chờ', TRUE, FALSE)
  ON CONFLICT (tenant_id, code) DO NOTHING
  RETURNING id INTO v_role_id;
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM tenant_roles WHERE tenant_id = p_tenant_id AND code = 'staff';
  END IF;

  INSERT INTO tenant_role_permissions (role_id, permission_code)
  SELECT v_role_id, code FROM permission_catalog
   WHERE code IN (
     'view_patients', 'manage_patients', 'manage_waiting_room', 'manage_appointments'
   )
  ON CONFLICT DO NOTHING;
END;
$$;


-- ---------------------------------------------------------------------
-- 6. Trigger: tenant mới → tự seed 4 role mặc định
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_seed_roles_on_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM seed_default_tenant_roles(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_seed_default_roles ON tenants;
CREATE TRIGGER tenants_seed_default_roles
AFTER INSERT ON tenants
FOR EACH ROW
EXECUTE FUNCTION trg_seed_roles_on_new_tenant();


-- ---------------------------------------------------------------------
-- 7. Backfill cho mọi tenant đang tồn tại
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM seed_default_tenant_roles(t.id);
  END LOOP;
END;
$$;


-- ---------------------------------------------------------------------
-- 8. Backfill: gán role_id cho tenantmembership dựa trên role TEXT cũ
-- ---------------------------------------------------------------------
UPDATE tenantmembership tm
   SET role_id = tr.id
  FROM tenant_roles tr
 WHERE tr.tenant_id = tm.tenant_id
   AND tr.code      = tm.role
   AND tm.role_id IS NULL;


-- ---------------------------------------------------------------------
-- 9. Trigger: giữ role TEXT và role_id đồng bộ (backward-compat)
--    - Nếu app set role_id mới → cập nhật role TEXT theo code của role.
--    - Nếu app set role TEXT (code cũ) → cập nhật role_id tương ứng.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_sync_membership_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_id   UUID;
BEGIN
  -- Trường hợp đổi role_id
  IF NEW.role_id IS DISTINCT FROM OLD.role_id AND NEW.role_id IS NOT NULL THEN
    SELECT code INTO v_code FROM tenant_roles WHERE id = NEW.role_id;
    IF v_code IS NOT NULL AND v_code IN ('owner','admin','doctor','staff') THEN
      NEW.role := v_code;
    END IF;
  END IF;

  -- Trường hợp đổi role TEXT (code hệ thống)
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT id INTO v_id FROM tenant_roles
     WHERE tenant_id = NEW.tenant_id AND code = NEW.role;
    IF v_id IS NOT NULL THEN
      NEW.role_id := v_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenantmembership_sync_role ON tenantmembership;
CREATE TRIGGER tenantmembership_sync_role
BEFORE UPDATE ON tenantmembership
FOR EACH ROW
EXECUTE FUNCTION trg_sync_membership_role();


-- ---------------------------------------------------------------------
-- 10. Helper function dùng trong RLS / API: user có quyền X tại tenant Y?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id    UUID,
  p_tenant_id  UUID,
  p_permission TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM tenantmembership tm
      JOIN tenant_role_permissions trp
        ON trp.role_id = tm.role_id
     WHERE tm.user_id   = p_user_id
       AND tm.tenant_id = p_tenant_id
       AND tm.active    = TRUE
       AND trp.permission_code = p_permission
  );
$$;

COMMENT ON FUNCTION user_has_permission(UUID, UUID, TEXT) IS
  'Trả về TRUE nếu user có permission tại tenant. An toàn dùng trong RLS USING/WITH CHECK.';


-- ---------------------------------------------------------------------
-- 11. Chốt an toàn: KHÔNG cho phép xóa role hệ thống, KHÔNG cho phép
--     bỏ permission cốt lõi của role protected (owner)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_guard_system_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.is_system) THEN
    RAISE EXCEPTION 'Không thể xóa role hệ thống "%": role mặc định phải tồn tại.', OLD.code;
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.is_system AND NEW.code <> OLD.code) THEN
    RAISE EXCEPTION 'Không thể đổi mã role hệ thống "%".', OLD.code;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tenant_roles_guard ON tenant_roles;
CREATE TRIGGER tenant_roles_guard
BEFORE UPDATE OR DELETE ON tenant_roles
FOR EACH ROW
EXECUTE FUNCTION trg_guard_system_roles();

CREATE OR REPLACE FUNCTION trg_guard_protected_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_protected BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT is_protected INTO v_protected FROM tenant_roles WHERE id = OLD.role_id;
    IF v_protected
       AND OLD.permission_code IN ('manage_billing','manage_clinic','manage_members') THEN
      RAISE EXCEPTION
        'Không thể bỏ permission cốt lõi "%" khỏi role chủ phòng khám.', OLD.permission_code;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trp_guard_protected ON tenant_role_permissions;
CREATE TRIGGER trp_guard_protected
BEFORE DELETE ON tenant_role_permissions
FOR EACH ROW
EXECUTE FUNCTION trg_guard_protected_permissions();


-- ---------------------------------------------------------------------
-- 12. RLS cho 3 bảng mới (tenant-scoped, đọc/ghi qua API service role)
-- ---------------------------------------------------------------------
ALTER TABLE tenant_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_catalog      ENABLE ROW LEVEL SECURITY;

-- permission_catalog: ai cũng đọc được (đây là master data)
DROP POLICY IF EXISTS permission_catalog_read ON permission_catalog;
CREATE POLICY permission_catalog_read ON permission_catalog
  FOR SELECT USING (TRUE);

-- tenant_roles: chỉ thành viên tenant mới SELECT; INSERT/UPDATE/DELETE
-- chỉ user có manage_members
DROP POLICY IF EXISTS tenant_roles_select ON tenant_roles;
CREATE POLICY tenant_roles_select ON tenant_roles
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenantmembership
       WHERE user_id = auth.uid() AND active = TRUE
    )
  );

DROP POLICY IF EXISTS tenant_roles_modify ON tenant_roles;
CREATE POLICY tenant_roles_modify ON tenant_roles
  FOR ALL USING (
    user_has_permission(auth.uid(), tenant_id, 'manage_members')
  ) WITH CHECK (
    user_has_permission(auth.uid(), tenant_id, 'manage_members')
  );

-- tenant_role_permissions: SELECT theo tenant của role; modify cần manage_members
DROP POLICY IF EXISTS trp_select ON tenant_role_permissions;
CREATE POLICY trp_select ON tenant_role_permissions
  FOR SELECT USING (
    role_id IN (
      SELECT id FROM tenant_roles
       WHERE tenant_id IN (
         SELECT tenant_id FROM tenantmembership
          WHERE user_id = auth.uid() AND active = TRUE
       )
    )
  );

DROP POLICY IF EXISTS trp_modify ON tenant_role_permissions;
CREATE POLICY trp_modify ON tenant_role_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tenant_roles tr
       WHERE tr.id = role_id
         AND user_has_permission(auth.uid(), tr.tenant_id, 'manage_members')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_roles tr
       WHERE tr.id = role_id
         AND user_has_permission(auth.uid(), tr.tenant_id, 'manage_members')
    )
  );

COMMIT;

-- =====================================================================
-- ROLLBACK (nếu cần, chạy thủ công):
--   BEGIN;
--   DROP TRIGGER IF EXISTS tenants_seed_default_roles ON tenants;
--   DROP TRIGGER IF EXISTS tenantmembership_sync_role ON tenantmembership;
--   DROP TRIGGER IF EXISTS tenant_roles_guard ON tenant_roles;
--   DROP TRIGGER IF EXISTS trp_guard_protected ON tenant_role_permissions;
--   ALTER TABLE tenantmembership DROP COLUMN IF EXISTS role_id;
--   DROP TABLE IF EXISTS tenant_role_permissions;
--   DROP TABLE IF EXISTS tenant_roles;
--   DROP TABLE IF EXISTS permission_catalog;
--   DROP FUNCTION IF EXISTS user_has_permission(UUID, UUID, TEXT);
--   DROP FUNCTION IF EXISTS seed_default_tenant_roles(UUID);
--   DROP FUNCTION IF EXISTS trg_seed_roles_on_new_tenant();
--   DROP FUNCTION IF EXISTS trg_sync_membership_role();
--   DROP FUNCTION IF EXISTS trg_guard_system_roles();
--   DROP FUNCTION IF EXISTS trg_guard_protected_permissions();
--   COMMIT;
-- =====================================================================
