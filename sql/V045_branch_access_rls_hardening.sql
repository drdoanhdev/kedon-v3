-- V045: Branch access hardening (DB-level)
-- Muc tieu:
-- 1) Enforce 1 active staff assignment / user / tenant
-- 2) Add branch-aware RLS helper
-- 3) Apply branch-aware RLS for per-branch tables

-- ============================================================
-- 1) Data integrity: 1 active assignment per user per tenant
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_assignments_one_active
  ON staff_assignments(tenant_id, user_id)
  WHERE to_date IS NULL;

-- ============================================================
-- 2) Helper: check user can access branch
-- ============================================================
CREATE OR REPLACE FUNCTION has_branch_access(p_tenant_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_active BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_tenant_id IS NULL OR p_branch_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Tenant membership
  SELECT tm.role, COALESCE(tm.active, TRUE)
  INTO v_role, v_active
  FROM tenantmembership tm
  WHERE tm.tenant_id = p_tenant_id
    AND tm.user_id = v_uid
  LIMIT 1;

  IF NOT FOUND OR v_active IS FALSE THEN
    RETURN FALSE;
  END IF;

  -- owner/admin: access all active branches in tenant
  IF lower(COALESCE(v_role, 'staff')) IN ('owner', 'admin') THEN
    RETURN EXISTS (
      SELECT 1
      FROM branches b
      WHERE b.id = p_branch_id
        AND b.tenant_id = p_tenant_id
        AND b.status = 'active'
    );
  END IF;

  -- staff/doctor: must have active assignment at branch
  RETURN EXISTS (
    SELECT 1
    FROM staff_assignments sa
    JOIN branches b ON b.id = sa.branch_id
    WHERE sa.tenant_id = p_tenant_id
      AND sa.user_id = v_uid
      AND sa.branch_id = p_branch_id
      AND sa.to_date IS NULL
      AND b.status = 'active'
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION has_branch_access(UUID, UUID) TO authenticated, anon, service_role;

-- ============================================================
-- 3) Branch-aware RLS for per-branch tables
-- ============================================================

-- ---------- BenhNhan ----------
DROP POLICY IF EXISTS "BenhNhan_select" ON "BenhNhan";
DROP POLICY IF EXISTS "BenhNhan_insert" ON "BenhNhan";
DROP POLICY IF EXISTS "BenhNhan_update" ON "BenhNhan";
DROP POLICY IF EXISTS "BenhNhan_delete" ON "BenhNhan";

CREATE POLICY "BenhNhan_select" ON "BenhNhan" FOR SELECT USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "BenhNhan_insert" ON "BenhNhan" FOR INSERT WITH CHECK (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "BenhNhan_update" ON "BenhNhan" FOR UPDATE USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "BenhNhan_delete" ON "BenhNhan" FOR DELETE USING (
  has_branch_access(tenant_id, branch_id)
);

-- ---------- DonThuoc ----------
DROP POLICY IF EXISTS "DonThuoc_select" ON "DonThuoc";
DROP POLICY IF EXISTS "DonThuoc_insert" ON "DonThuoc";
DROP POLICY IF EXISTS "DonThuoc_update" ON "DonThuoc";
DROP POLICY IF EXISTS "DonThuoc_delete" ON "DonThuoc";

CREATE POLICY "DonThuoc_select" ON "DonThuoc" FOR SELECT USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "DonThuoc_insert" ON "DonThuoc" FOR INSERT WITH CHECK (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "DonThuoc_update" ON "DonThuoc" FOR UPDATE USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "DonThuoc_delete" ON "DonThuoc" FOR DELETE USING (
  has_branch_access(tenant_id, branch_id)
);

-- ---------- DonKinh ----------
DROP POLICY IF EXISTS "DonKinh_select" ON "DonKinh";
DROP POLICY IF EXISTS "DonKinh_insert" ON "DonKinh";
DROP POLICY IF EXISTS "DonKinh_update" ON "DonKinh";
DROP POLICY IF EXISTS "DonKinh_delete" ON "DonKinh";

CREATE POLICY "DonKinh_select" ON "DonKinh" FOR SELECT USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "DonKinh_insert" ON "DonKinh" FOR INSERT WITH CHECK (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "DonKinh_update" ON "DonKinh" FOR UPDATE USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "DonKinh_delete" ON "DonKinh" FOR DELETE USING (
  has_branch_access(tenant_id, branch_id)
);

-- ---------- ChoKham ----------
DROP POLICY IF EXISTS "ChoKham_select" ON "ChoKham";
DROP POLICY IF EXISTS "ChoKham_insert" ON "ChoKham";
DROP POLICY IF EXISTS "ChoKham_update" ON "ChoKham";
DROP POLICY IF EXISTS "ChoKham_delete" ON "ChoKham";

CREATE POLICY "ChoKham_select" ON "ChoKham" FOR SELECT USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "ChoKham_insert" ON "ChoKham" FOR INSERT WITH CHECK (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "ChoKham_update" ON "ChoKham" FOR UPDATE USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY "ChoKham_delete" ON "ChoKham" FOR DELETE USING (
  has_branch_access(tenant_id, branch_id)
);

-- ---------- hen_kham_lai ----------
DROP POLICY IF EXISTS hen_kham_lai_select ON hen_kham_lai;
DROP POLICY IF EXISTS hen_kham_lai_insert ON hen_kham_lai;
DROP POLICY IF EXISTS hen_kham_lai_update ON hen_kham_lai;
DROP POLICY IF EXISTS hen_kham_lai_delete ON hen_kham_lai;

CREATE POLICY hen_kham_lai_select ON hen_kham_lai FOR SELECT USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY hen_kham_lai_insert ON hen_kham_lai FOR INSERT WITH CHECK (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY hen_kham_lai_update ON hen_kham_lai FOR UPDATE USING (
  has_branch_access(tenant_id, branch_id)
);
CREATE POLICY hen_kham_lai_delete ON hen_kham_lai FOR DELETE USING (
  has_branch_access(tenant_id, branch_id)
);

-- ---------- DienTien ----------
DROP POLICY IF EXISTS "DienTien_select" ON "DienTien";
DROP POLICY IF EXISTS "DienTien_insert" ON "DienTien";
DROP POLICY IF EXISTS "DienTien_update" ON "DienTien";
DROP POLICY IF EXISTS "DienTien_delete" ON "DienTien";

-- DienTien khong co branch_id, branch access duoc suy ra qua BenhNhan
CREATE POLICY "DienTien_select" ON "DienTien" FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM "BenhNhan" bn
    WHERE bn.id = "DienTien".benhnhanid
      AND has_branch_access(bn.tenant_id, bn.branch_id)
  )
);
CREATE POLICY "DienTien_insert" ON "DienTien" FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "BenhNhan" bn
    WHERE bn.id = "DienTien".benhnhanid
      AND has_branch_access(bn.tenant_id, bn.branch_id)
  )
);
CREATE POLICY "DienTien_update" ON "DienTien" FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM "BenhNhan" bn
    WHERE bn.id = "DienTien".benhnhanid
      AND has_branch_access(bn.tenant_id, bn.branch_id)
  )
);
CREATE POLICY "DienTien_delete" ON "DienTien" FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM "BenhNhan" bn
    WHERE bn.id = "DienTien".benhnhanid
      AND has_branch_access(bn.tenant_id, bn.branch_id)
  )
);
