-- V049: Branch pricing overrides + cost snapshots foundation
-- Goal:
-- 1) Keep global catalog price as default
-- 2) Allow branch-level price/cost override without forking catalog rows
-- 3) Preserve sold price/cost snapshot per prescription line (audit-safe PnL)

BEGIN;

-- ============================================================
-- 1) Branch-level override table (generic across item types)
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_price_overrides (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('thuoc', 'hang_trong', 'gong_kinh', 'nhom_gia_gong')),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  gia_ban_override BIGINT,
  gia_von_override BIGINT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'promo', 'bulk_deal', 'migration')),
  reason TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_branch_override_has_price
    CHECK (gia_ban_override IS NOT NULL OR gia_von_override IS NOT NULL),
  CONSTRAINT chk_branch_override_effective_range
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_tenant_branch
  ON branch_price_overrides(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_lookup
  ON branch_price_overrides(tenant_id, branch_id, item_type, item_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_price_overrides_active
  ON branch_price_overrides(tenant_id, branch_id, item_type, item_id)
  WHERE deleted_at IS NULL AND effective_to IS NULL;

DROP TRIGGER IF EXISTS trg_branch_price_overrides_updated_at ON branch_price_overrides;
CREATE TRIGGER trg_branch_price_overrides_updated_at
  BEFORE UPDATE ON branch_price_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE branch_price_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branch_price_overrides_service_all ON branch_price_overrides;
CREATE POLICY branch_price_overrides_service_all
  ON branch_price_overrides
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS branch_price_overrides_tenant_select ON branch_price_overrides;
CREATE POLICY branch_price_overrides_tenant_select
  ON branch_price_overrides
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- ============================================================
-- 2) Snapshot price/cost for DonThuoc details (line-level source of truth)
-- ============================================================
ALTER TABLE "ChiTietDonThuoc"
  ADD COLUMN IF NOT EXISTS don_gia_ban BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS don_gia_von BIGINT NOT NULL DEFAULT 0;

-- Backfill snapshots from current Thuoc values for legacy rows
UPDATE "ChiTietDonThuoc" c
SET
  don_gia_ban = COALESCE(NULLIF(c.don_gia_ban, 0), t.giaban, 0),
  don_gia_von = COALESCE(NULLIF(c.don_gia_von, 0), t.gianhap, 0)
FROM "Thuoc" t
WHERE c.thuocid = t.id;

CREATE INDEX IF NOT EXISTS idx_chitiet_donthuoc_price_snapshot
  ON "ChiTietDonThuoc"(donthuocid, thuocid, don_gia_ban, don_gia_von);

-- ============================================================
-- 3) Optional branch trace on inventory transactions (forward-compatible)
-- ============================================================
ALTER TABLE thuoc_nhap_kho ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE thuoc_huy ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE frame_import ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE frame_export ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE lens_import ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE lens_export_sale ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE lens_export_damaged ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE nhom_gia_gong_nhap ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS idx_thuoc_nhap_kho_branch ON thuoc_nhap_kho(branch_id);
CREATE INDEX IF NOT EXISTS idx_thuoc_huy_branch ON thuoc_huy(branch_id);
CREATE INDEX IF NOT EXISTS idx_frame_import_branch ON frame_import(branch_id);
CREATE INDEX IF NOT EXISTS idx_frame_export_branch ON frame_export(branch_id);
CREATE INDEX IF NOT EXISTS idx_lens_import_branch ON lens_import(branch_id);
CREATE INDEX IF NOT EXISTS idx_lens_export_sale_branch ON lens_export_sale(branch_id);
CREATE INDEX IF NOT EXISTS idx_lens_export_damaged_branch ON lens_export_damaged(branch_id);
CREATE INDEX IF NOT EXISTS idx_nhom_gia_gong_nhap_branch ON nhom_gia_gong_nhap(branch_id);

-- Best-effort backfill from catalog/stock ownership
UPDATE thuoc_nhap_kho nk
SET branch_id = t.branch_id
FROM "Thuoc" t
WHERE nk.branch_id IS NULL
  AND nk.thuoc_id = t.id
  AND nk.tenant_id = t.tenant_id;

UPDATE thuoc_huy th
SET branch_id = t.branch_id
FROM "Thuoc" t
WHERE th.branch_id IS NULL
  AND th.thuoc_id = t.id
  AND th.tenant_id = t.tenant_id;

UPDATE frame_import fi
SET branch_id = g.branch_id
FROM "GongKinh" g
WHERE fi.branch_id IS NULL
  AND fi.gong_kinh_id = g.id
  AND fi.tenant_id = g.tenant_id;

UPDATE frame_export fe
SET branch_id = g.branch_id
FROM "GongKinh" g
WHERE fe.branch_id IS NULL
  AND fe.gong_kinh_id = g.id
  AND fe.tenant_id = g.tenant_id;

UPDATE lens_import li
SET branch_id = ls.branch_id
FROM lens_stock ls
WHERE li.branch_id IS NULL
  AND li.lens_stock_id = ls.id
  AND li.tenant_id = ls.tenant_id;

UPDATE lens_export_sale les
SET branch_id = ls.branch_id
FROM lens_stock ls
WHERE les.branch_id IS NULL
  AND les.lens_stock_id = ls.id
  AND les.tenant_id = ls.tenant_id;

UPDATE lens_export_damaged led
SET branch_id = ls.branch_id
FROM lens_stock ls
WHERE led.branch_id IS NULL
  AND led.lens_stock_id = ls.id
  AND led.tenant_id = ls.tenant_id;

UPDATE nhom_gia_gong_nhap n
SET branch_id = dk.branch_id
FROM "DonKinh" dk
WHERE n.branch_id IS NULL
  AND dk.tenant_id = n.tenant_id
  AND dk.nhom_gia_gong_id = n.nhom_gia_gong_id
  AND dk.branch_id IS NOT NULL;

-- ============================================================
-- 4) Helper function: resolve effective price at branch
-- ============================================================
CREATE OR REPLACE FUNCTION fn_get_effective_item_price(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_item_type TEXT,
  p_item_id INTEGER,
  p_default_sell BIGINT,
  p_default_cost BIGINT
)
RETURNS TABLE(
  gia_ban BIGINT,
  gia_von BIGINT,
  resolved_source TEXT,
  override_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  o RECORD;
BEGIN
  SELECT id, gia_ban_override, gia_von_override
  INTO o
  FROM branch_price_overrides
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND item_type = p_item_type
    AND item_id = p_item_id
    AND deleted_at IS NULL
    AND effective_to IS NULL
  LIMIT 1;

  IF o.id IS NULL THEN
    RETURN QUERY SELECT p_default_sell, p_default_cost, 'catalog_default'::TEXT, NULL::BIGINT;
  ELSE
    RETURN QUERY SELECT
      COALESCE(o.gia_ban_override, p_default_sell),
      COALESCE(o.gia_von_override, p_default_cost),
      'branch_override'::TEXT,
      o.id::BIGINT;
  END IF;
END;
$body$;

COMMIT;
