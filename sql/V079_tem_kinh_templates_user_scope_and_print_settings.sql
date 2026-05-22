-- ====================================================================
-- V079: tem_kinh_templates user scope + print settings
-- Hoan thien bang V078 cho DB da chay ban cu.
-- ====================================================================

ALTER TABLE IF EXISTS tem_kinh_templates
  ADD COLUMN IF NOT EXISTS dpi INTEGER NOT NULL DEFAULT 203 CHECK (dpi >= 200 AND dpi <= 600),
  ADD COLUMN IF NOT EXISTS gap_mm NUMERIC(6, 2) NOT NULL DEFAULT 2 CHECK (gap_mm >= 0 AND gap_mm <= 10),
  ADD COLUMN IF NOT EXISTS speed INTEGER NOT NULL DEFAULT 4 CHECK (speed >= 1 AND speed <= 6),
  ADD COLUMN IF NOT EXISTS density INTEGER NOT NULL DEFAULT 10 CHECK (density >= 1 AND density <= 15),
  ADD COLUMN IF NOT EXISTS bitmap_invert BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bitmap_rotate_180 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bitmap_offset_x_mm NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (bitmap_offset_x_mm >= -8 AND bitmap_offset_x_mm <= 8),
  ADD COLUMN IF NOT EXISTS bitmap_offset_y_mm NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (bitmap_offset_y_mm >= -8 AND bitmap_offset_y_mm <= 8);

CREATE INDEX IF NOT EXISTS idx_tem_kinh_templates_tenant_user
  ON tem_kinh_templates(tenant_id, created_by)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS uq_tem_kinh_template_name_scope;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tem_kinh_template_name_scope
  ON tem_kinh_templates(
    tenant_id,
    COALESCE(created_by, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS uq_tem_kinh_template_default_scope;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tem_kinh_template_default_scope
  ON tem_kinh_templates(
    tenant_id,
    COALESCE(created_by, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_default = true AND deleted_at IS NULL;

ALTER TABLE tem_kinh_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tem_kinh_templates_select ON tem_kinh_templates;
DROP POLICY IF EXISTS tem_kinh_templates_insert ON tem_kinh_templates;
DROP POLICY IF EXISTS tem_kinh_templates_update ON tem_kinh_templates;
DROP POLICY IF EXISTS tem_kinh_templates_delete ON tem_kinh_templates;

CREATE POLICY tem_kinh_templates_select
ON tem_kinh_templates
FOR SELECT
USING (
  tenant_id IN (
    SELECT tm.tenant_id
    FROM tenantmembership tm
    WHERE tm.user_id = auth.uid() AND tm.active = true
  )
);

CREATE POLICY tem_kinh_templates_insert
ON tem_kinh_templates
FOR INSERT
WITH CHECK (
  created_by = auth.uid() AND
  tenant_id IN (
    SELECT tm.tenant_id
    FROM tenantmembership tm
    WHERE tm.user_id = auth.uid() AND tm.active = true
  )
);

CREATE POLICY tem_kinh_templates_update
ON tem_kinh_templates
FOR UPDATE
USING (
  created_by = auth.uid() AND
  tenant_id IN (
    SELECT tm.tenant_id
    FROM tenantmembership tm
    WHERE tm.user_id = auth.uid() AND tm.active = true
  )
);

CREATE POLICY tem_kinh_templates_delete
ON tem_kinh_templates
FOR DELETE
USING (
  created_by = auth.uid() AND
  tenant_id IN (
    SELECT tm.tenant_id
    FROM tenantmembership tm
    WHERE tm.user_id = auth.uid() AND tm.active = true
  )
);
