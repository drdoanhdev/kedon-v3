-- V093: Multi-branch enhancements
-- - Multi staff assignment (area managers)
-- - Staff attendance
-- - Lab / gia công workflow on DonKinh
-- - Print agent ↔ branch registry
-- - Branch promotions
-- - Cross-branch warranty / returns
-- - Centralized supplier PO for lens orders

-- ------------------------------------------------------------
-- 1) Allow multiple active staff assignments (1 primary + extras)
-- ------------------------------------------------------------
DROP INDEX IF EXISTS idx_staff_assignments_one_active;

-- Keep at most one primary assignment per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_assignments_primary
  ON staff_assignments(tenant_id, user_id)
  WHERE is_primary = true AND to_date IS NULL;

-- Prevent duplicate (user, branch) active rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_assignments_user_branch_active
  ON staff_assignments(tenant_id, user_id, branch_id)
  WHERE to_date IS NULL;

-- ------------------------------------------------------------
-- 2) Staff attendance
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'face', 'kiosk')),
  device_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_tenant_day
  ON staff_attendance(tenant_id, check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_user
  ON staff_attendance(tenant_id, user_id, check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_branch
  ON staff_attendance(tenant_id, branch_id, check_in_at DESC);

ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_attendance_service_all ON staff_attendance;
CREATE POLICY staff_attendance_service_all
  ON staff_attendance FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS staff_attendance_tenant_select ON staff_attendance;
CREATE POLICY staff_attendance_tenant_select
  ON staff_attendance FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

DROP POLICY IF EXISTS staff_attendance_tenant_insert ON staff_attendance;
CREATE POLICY staff_attendance_tenant_insert
  ON staff_attendance FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

DROP POLICY IF EXISTS staff_attendance_tenant_update ON staff_attendance;
CREATE POLICY staff_attendance_tenant_update
  ON staff_attendance FOR UPDATE
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- ------------------------------------------------------------
-- 3) Lab / gia công workflow on DonKinh
-- ------------------------------------------------------------
ALTER TABLE "DonKinh"
  ADD COLUMN IF NOT EXISTS lab_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lab_branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS lab_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lab_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lab_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lab_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'donkinh_lab_status_check'
  ) THEN
    ALTER TABLE "DonKinh"
      ADD CONSTRAINT donkinh_lab_status_check
      CHECK (
        lab_status IS NULL
        OR lab_status IN ('cho_gia_cong', 'dang_cat', 'san_sang', 'da_giao')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_donkinh_lab_status
  ON "DonKinh"(tenant_id, lab_status)
  WHERE lab_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_donkinh_lab_branch
  ON "DonKinh"(tenant_id, lab_branch_id)
  WHERE lab_branch_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4) Print agent devices registered to a branch
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS print_agent_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  device_label TEXT NOT NULL,
  device_fingerprint TEXT,
  agent_version TEXT,
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_agent_devices_tenant
  ON print_agent_devices(tenant_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_print_agent_devices_fingerprint
  ON print_agent_devices(tenant_id, device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

ALTER TABLE print_agent_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS print_agent_devices_service_all ON print_agent_devices;
CREATE POLICY print_agent_devices_service_all
  ON print_agent_devices FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS print_agent_devices_tenant_all ON print_agent_devices;
CREATE POLICY print_agent_devices_tenant_all
  ON print_agent_devices FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Prefer branch identity on print config when use_branch_identity = true
ALTER TABLE cau_hinh_mau_in
  ADD COLUMN IF NOT EXISTS use_branch_identity BOOLEAN NOT NULL DEFAULT true;

-- ------------------------------------------------------------
-- 5) Branch promotions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  -- NULL branch_id = áp dụng toàn chuỗi
  ten_chuong_trinh TEXT NOT NULL,
  mo_ta TEXT,
  loai TEXT NOT NULL DEFAULT 'percent'
    CHECK (loai IN ('percent', 'fixed', 'voucher')),
  gia_tri BIGINT NOT NULL DEFAULT 0,
  ma_voucher TEXT,
  ap_dung_cho TEXT NOT NULL DEFAULT 'all'
    CHECK (ap_dung_cho IN ('all', 'gong', 'trong', 'thuoc')),
  tu_ngay DATE NOT NULL,
  den_ngay DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_promotions_tenant
  ON branch_promotions(tenant_id, is_active, tu_ngay, den_ngay);
CREATE INDEX IF NOT EXISTS idx_branch_promotions_branch
  ON branch_promotions(tenant_id, branch_id);

ALTER TABLE branch_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branch_promotions_service_all ON branch_promotions;
CREATE POLICY branch_promotions_service_all
  ON branch_promotions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS branch_promotions_tenant_all ON branch_promotions;
CREATE POLICY branch_promotions_tenant_all
  ON branch_promotions FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- ------------------------------------------------------------
-- 6) Cross-branch warranty / returns
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  benhnhan_id INTEGER NOT NULL,
  don_kinh_id INTEGER,
  sale_branch_id UUID REFERENCES branches(id),
  service_branch_id UUID REFERENCES branches(id),
  loai TEXT NOT NULL DEFAULT 'bao_hanh'
    CHECK (loai IN ('bao_hanh', 'doi_tra', 'sua_chua')),
  ly_do TEXT,
  trang_thai TEXT NOT NULL DEFAULT 'tiep_nhan'
    CHECK (trang_thai IN ('tiep_nhan', 'dang_xu_ly', 'hoan_tat', 'huy')),
  chi_phi BIGINT NOT NULL DEFAULT 0,
  created_by UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_warranties_tenant
  ON branch_warranties(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_branch_warranties_patient
  ON branch_warranties(tenant_id, benhnhan_id);

ALTER TABLE branch_warranties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branch_warranties_service_all ON branch_warranties;
CREATE POLICY branch_warranties_service_all
  ON branch_warranties FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS branch_warranties_tenant_all ON branch_warranties;
CREATE POLICY branch_warranties_tenant_all
  ON branch_warranties FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- ------------------------------------------------------------
-- 7) Centralized lens purchase orders (gộp tròng cần đặt)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lens_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ma_po TEXT,
  nha_cung_cap_id INTEGER,
  trang_thai TEXT NOT NULL DEFAULT 'draft'
    CHECK (trang_thai IN ('draft', 'ordered', 'partial', 'received', 'cancelled')),
  ghi_chu TEXT,
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lens_purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES lens_purchase_orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  don_kinh_id INTEGER,
  hang_trong_id INTEGER,
  ten_trong TEXT,
  sph NUMERIC,
  cyl NUMERIC,
  add_power NUMERIC,
  mat TEXT,
  so_luong INTEGER NOT NULL DEFAULT 1,
  don_gia BIGINT NOT NULL DEFAULT 0,
  trang_thai TEXT NOT NULL DEFAULT 'pending'
    CHECK (trang_thai IN ('pending', 'ordered', 'received', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_po_tenant
  ON lens_purchase_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lens_po_items_po
  ON lens_purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_lens_po_items_branch
  ON lens_purchase_order_items(tenant_id, branch_id);

ALTER TABLE lens_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lens_po_service_all ON lens_purchase_orders;
CREATE POLICY lens_po_service_all
  ON lens_purchase_orders FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS lens_po_tenant_all ON lens_purchase_orders;
CREATE POLICY lens_po_tenant_all
  ON lens_purchase_orders FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

DROP POLICY IF EXISTS lens_po_items_service_all ON lens_purchase_order_items;
CREATE POLICY lens_po_items_service_all
  ON lens_purchase_order_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS lens_po_items_tenant_all ON lens_purchase_order_items;
CREATE POLICY lens_po_items_tenant_all
  ON lens_purchase_order_items FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- ------------------------------------------------------------
-- 8) Extra branch slots purchased (beyond plan max_branches base)
-- ------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS extra_branches INTEGER NOT NULL DEFAULT 0;
