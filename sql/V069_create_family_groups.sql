-- V069: Family Group CRM — nhóm bệnh nhân theo hộ gia đình
-- Theo INITIAL.md "Hồ sơ Gia đình Khách hàng"
--   - 1 bệnh nhân chỉ thuộc tối đa 1 family_group (UNIQUE benhnhan_id)
--   - role là soft-link, có thể NULL
--   - tenant_id bắt buộc; branch_id (chi nhánh tạo) optional

-- =============================================================
-- 1. family_groups
-- =============================================================
CREATE TABLE IF NOT EXISTS family_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  name          VARCHAR(150) NOT NULL,
  phone         VARCHAR(20) NULL,
  address       TEXT NULL,
  note          TEXT NULL,
  created_by    UUID NULL,
  updated_by    UUID NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_groups_tenant
  ON family_groups(tenant_id);

CREATE INDEX IF NOT EXISTS idx_family_groups_tenant_phone
  ON family_groups(tenant_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_family_groups_tenant_name_lower
  ON family_groups(tenant_id, lower(name));

-- =============================================================
-- 2. family_members
-- =============================================================
-- tenant_id denormalized để RLS check rẻ và filter list nhanh.
-- UNIQUE(benhnhan_id) ép mỗi bệnh nhân chỉ thuộc 1 nhóm — đơn giản hoá logic.
CREATE TABLE IF NOT EXISTS family_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  family_group_id   UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  benhnhan_id       INTEGER NOT NULL REFERENCES "BenhNhan"(id) ON DELETE CASCADE,
  role              VARCHAR(20) NULL
    CHECK (role IS NULL OR role IN ('father','mother','child','spouse','other')),
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        UUID NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_family_members_benhnhan UNIQUE (benhnhan_id)
);

CREATE INDEX IF NOT EXISTS idx_family_members_group
  ON family_members(family_group_id);

CREATE INDEX IF NOT EXISTS idx_family_members_tenant_patient
  ON family_members(tenant_id, benhnhan_id);

-- Mỗi nhóm chỉ có tối đa 1 primary. Partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_family_members_one_primary_per_group
  ON family_members(family_group_id)
  WHERE is_primary = TRUE;

-- =============================================================
-- 3. updated_at trigger cho family_groups
-- =============================================================
DROP TRIGGER IF EXISTS trg_family_groups_updated_at ON family_groups;
CREATE TRIGGER trg_family_groups_updated_at
  BEFORE UPDATE ON family_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- 4. RLS — pattern theo V067, defense-in-depth (API dùng service role)
-- =============================================================
ALTER TABLE family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- ---- family_groups policies ----
DROP POLICY IF EXISTS family_groups_select ON family_groups;
DROP POLICY IF EXISTS family_groups_insert ON family_groups;
DROP POLICY IF EXISTS family_groups_update ON family_groups;
DROP POLICY IF EXISTS family_groups_delete ON family_groups;

CREATE POLICY family_groups_select ON family_groups
FOR SELECT
USING (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1 FROM tenantmembership tm
      WHERE tm.tenant_id = family_groups.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
);

CREATE POLICY family_groups_insert ON family_groups
FOR INSERT
WITH CHECK (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1 FROM tenantmembership tm
      WHERE tm.tenant_id = family_groups.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
);

CREATE POLICY family_groups_update ON family_groups
FOR UPDATE
USING (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1 FROM tenantmembership tm
      WHERE tm.tenant_id = family_groups.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
)
WITH CHECK (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1 FROM tenantmembership tm
      WHERE tm.tenant_id = family_groups.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
);

CREATE POLICY family_groups_delete ON family_groups
FOR DELETE
USING (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1 FROM tenantmembership tm
      WHERE tm.tenant_id = family_groups.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
);

-- ---- family_members policies (chỉ check tenant; branch theo group cha) ----
DROP POLICY IF EXISTS family_members_select ON family_members;
DROP POLICY IF EXISTS family_members_insert ON family_members;
DROP POLICY IF EXISTS family_members_update ON family_members;
DROP POLICY IF EXISTS family_members_delete ON family_members;

CREATE POLICY family_members_select ON family_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tenantmembership tm
    WHERE tm.tenant_id = family_members.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
);

CREATE POLICY family_members_insert ON family_members
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenantmembership tm
    WHERE tm.tenant_id = family_members.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
);

CREATE POLICY family_members_update ON family_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tenantmembership tm
    WHERE tm.tenant_id = family_members.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenantmembership tm
    WHERE tm.tenant_id = family_members.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
);

CREATE POLICY family_members_delete ON family_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tenantmembership tm
    WHERE tm.tenant_id = family_members.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
);

-- =============================================================
-- 5. Safety trigger — đồng bộ tenant_id của family_members với family_groups
-- =============================================================
-- Tránh trường hợp API ghi sai tenant_id member vs group cha.
CREATE OR REPLACE FUNCTION family_members_sync_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_group_tenant
  FROM family_groups
  WHERE id = NEW.family_group_id;

  IF v_group_tenant IS NULL THEN
    RAISE EXCEPTION 'family_group_id % không tồn tại', NEW.family_group_id;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_group_tenant THEN
    NEW.tenant_id := v_group_tenant;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_members_sync_tenant ON family_members;
CREATE TRIGGER trg_family_members_sync_tenant
  BEFORE INSERT OR UPDATE OF family_group_id, tenant_id ON family_members
  FOR EACH ROW EXECUTE FUNCTION family_members_sync_tenant();
