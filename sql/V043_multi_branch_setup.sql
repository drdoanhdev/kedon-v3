-- V043: Multi-branch / Chain Store Management
-- Quản lý chuỗi cửa hàng: chi nhánh, điều chuyển kho, nhân viên, khách hàng

-- ============================================================
-- 1. BẢNG BRANCHES (Chi nhánh)
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ten_chi_nhanh TEXT NOT NULL,
  dia_chi TEXT,
  dien_thoai TEXT,
  is_main BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_main_unique ON branches(tenant_id) WHERE is_main = TRUE;

-- Trigger updated_at
CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. BẢNG STAFF_ASSIGNMENTS (Phân công nhân viên vào chi nhánh)
-- ============================================================
CREATE TABLE IF NOT EXISTS staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  from_date DATE NOT NULL DEFAULT CURRENT_DATE,
  to_date DATE,
  ghi_chu TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_tenant ON staff_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_user ON staff_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_branch ON staff_assignments(branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_assignments_primary 
  ON staff_assignments(tenant_id, user_id) WHERE is_primary = TRUE AND to_date IS NULL;

CREATE TRIGGER trg_staff_assignments_updated_at
  BEFORE UPDATE ON staff_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. BẢNG BRANCH_TRANSFERS (Điều chuyển kho giữa chi nhánh)
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_branch_id UUID NOT NULL REFERENCES branches(id),
  to_branch_id UUID NOT NULL REFERENCES branches(id),
  loai TEXT NOT NULL CHECK (loai IN ('lens', 'gong', 'thuoc', 'vat_tu')),
  item_id TEXT NOT NULL,                 -- ID sản phẩm (có thể int hoặc uuid tùy bảng)
  ten_san_pham TEXT,                     -- Tên SP để hiển thị nhanh
  so_luong INT NOT NULL CHECK (so_luong > 0),
  don_gia BIGINT DEFAULT 0,
  ghi_chu TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'rejected', 'cancelled')),
  nguoi_tao UUID NOT NULL REFERENCES auth.users(id),
  nguoi_duyet UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_different_branches CHECK (from_branch_id <> to_branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_transfers_tenant ON branch_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_status ON branch_transfers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_from ON branch_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_to ON branch_transfers(to_branch_id);

CREATE TRIGGER trg_branch_transfers_updated_at
  BEFORE UPDATE ON branch_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. BẢNG PATIENT_TRANSFERS (Chuyển khách hàng giữa chi nhánh)
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  benhnhan_id INTEGER NOT NULL,
  from_branch_id UUID NOT NULL REFERENCES branches(id),
  to_branch_id UUID NOT NULL REFERENCES branches(id),
  ly_do TEXT,
  nguoi_chuyen UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_patient_transfer_diff CHECK (from_branch_id <> to_branch_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_transfers_tenant ON patient_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_transfers_patient ON patient_transfers(benhnhan_id);

-- ============================================================
-- 5. THÊM CỘT branch_id VÀO CÁC BẢNG HIỆN CÓ
-- (nullable để backward-compatible với dữ liệu cũ)
-- ============================================================

-- Bệnh nhân
ALTER TABLE "BenhNhan" ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_benhnhan_branch ON "BenhNhan"(branch_id);

-- Đơn thuốc
ALTER TABLE "DonThuoc" ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_donthuoc_branch ON "DonThuoc"(branch_id);

-- Đơn kính
ALTER TABLE "DonKinh" ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_donkinh_branch ON "DonKinh"(branch_id);

-- Kho tròng
ALTER TABLE lens_stock ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_lens_stock_branch ON lens_stock(branch_id);

-- Thuốc
ALTER TABLE "Thuoc" ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_thuoc_branch ON "Thuoc"(branch_id);

-- Gọng kính
ALTER TABLE "GongKinh" ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_gongkinh_branch ON "GongKinh"(branch_id);

-- Phòng chờ
ALTER TABLE "ChoKham" ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_chokham_branch ON "ChoKham"(branch_id);

-- ============================================================
-- 6. FUNCTION: Tự động tạo branch mặc định khi tenant bật enterprise
-- ============================================================
CREATE OR REPLACE FUNCTION create_default_branch_for_tenant(p_tenant_id UUID)
RETURNS UUID AS $body$
DECLARE
  v_branch_id UUID;
  v_tenant_name TEXT;
BEGIN
  -- Kiểm tra đã có branch chưa
  SELECT id INTO v_branch_id FROM branches WHERE tenant_id = p_tenant_id AND is_main = TRUE;
  IF v_branch_id IS NOT NULL THEN
    RETURN v_branch_id;
  END IF;

  -- Lấy tên tenant
  SELECT name INTO v_tenant_name FROM tenants WHERE id = p_tenant_id;

  -- Tạo branch chính
  INSERT INTO branches (tenant_id, ten_chi_nhanh, is_main, status)
  VALUES (p_tenant_id, COALESCE(v_tenant_name, 'Chi nhánh chính'), TRUE, 'active')
  RETURNING id INTO v_branch_id;

  -- Gán tất cả dữ liệu hiện có vào branch chính
  UPDATE "BenhNhan" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE "DonThuoc" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE "DonKinh" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE lens_stock SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE "Thuoc" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE "GongKinh" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;

  -- Gán tất cả thành viên vào branch chính
  INSERT INTO staff_assignments (tenant_id, user_id, branch_id, is_primary)
  SELECT p_tenant_id, user_id, v_branch_id, TRUE
  FROM tenantmembership
  WHERE tenant_id = p_tenant_id AND active = TRUE
  ON CONFLICT DO NOTHING;

  RETURN v_branch_id;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. RLS POLICIES
-- ============================================================

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_transfers ENABLE ROW LEVEL SECURITY;

-- Service role bypass (backend API dùng service_role key)
CREATE POLICY branches_service_all ON branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY staff_assignments_service_all ON staff_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY branch_transfers_service_all ON branch_transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY patient_transfers_service_all ON patient_transfers FOR ALL USING (true) WITH CHECK (true);

-- Anon key: chỉ xem được data thuộc tenant mình
CREATE POLICY branches_tenant_select ON branches FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY staff_assignments_tenant_select ON staff_assignments FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY branch_transfers_tenant_select ON branch_transfers FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY patient_transfers_tenant_select ON patient_transfers FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- ============================================================
-- Done. Backward compatible: branch_id nullable, feature-gated.
-- ============================================================
