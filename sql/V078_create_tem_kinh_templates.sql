-- ====================================================================
-- V078: Template in tem kinh (label goc kinh)
-- Luu template JSON de in tem theo tenant/chi nhanh.
-- ====================================================================

CREATE TABLE IF NOT EXISTS tem_kinh_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  width_mm NUMERIC(8, 2) NOT NULL DEFAULT 70 CHECK (width_mm >= 10 AND width_mm <= 300),
  height_mm NUMERIC(8, 2) NOT NULL DEFAULT 50 CHECK (height_mm >= 10 AND height_mm <= 300),
  dpi INTEGER NOT NULL DEFAULT 203 CHECK (dpi >= 200 AND dpi <= 600),
  gap_mm NUMERIC(6, 2) NOT NULL DEFAULT 2 CHECK (gap_mm >= 0 AND gap_mm <= 10),
  speed INTEGER NOT NULL DEFAULT 4 CHECK (speed >= 1 AND speed <= 6),
  density INTEGER NOT NULL DEFAULT 10 CHECK (density >= 1 AND density <= 15),
  bitmap_invert BOOLEAN NOT NULL DEFAULT true,
  bitmap_rotate_180 BOOLEAN NOT NULL DEFAULT true,
  bitmap_offset_x_mm NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (bitmap_offset_x_mm >= -8 AND bitmap_offset_x_mm <= 8),
  bitmap_offset_y_mm NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (bitmap_offset_y_mm >= -8 AND bitmap_offset_y_mm <= 8),
  background TEXT NOT NULL DEFAULT '#4d74bf',
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 500),
  elements JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tem_kinh_templates_tenant
  ON tem_kinh_templates(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tem_kinh_templates_tenant_branch
  ON tem_kinh_templates(tenant_id, branch_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tem_kinh_templates_tenant_user
  ON tem_kinh_templates(tenant_id, created_by)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tem_kinh_template_name_scope
  ON tem_kinh_templates(
    tenant_id,
    created_by,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tem_kinh_template_default_scope
  ON tem_kinh_templates(
    tenant_id,
    created_by,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_default = true AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_tem_kinh_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tem_kinh_templates_updated_at ON tem_kinh_templates;
CREATE TRIGGER trg_tem_kinh_templates_updated_at
  BEFORE UPDATE ON tem_kinh_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_tem_kinh_templates_updated_at();

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
    WHERE tm.user_id = auth.uid()
      AND tm.active = true
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
    WHERE tm.user_id = auth.uid()
      AND tm.active = true
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
    WHERE tm.user_id = auth.uid()
      AND tm.active = true
  )
);
