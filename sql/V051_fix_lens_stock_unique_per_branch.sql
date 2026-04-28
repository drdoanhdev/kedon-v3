-- V051: Fix lens stock unique scope to support multi-branch
-- Problem:
--   lens_stock_unique_combo (from V035) did not include branch_id,
--   causing duplicate-key errors when the same lens combo exists in different branches.
--
-- Goal:
--   Enforce uniqueness per tenant + branch + lens combo.
--   Keep null-branch rows deterministic via COALESCE.

DROP INDEX IF EXISTS lens_stock_unique_combo;

CREATE UNIQUE INDEX IF NOT EXISTS lens_stock_unique_combo
  ON lens_stock(
    tenant_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    hang_trong_id,
    sph,
    cyl,
    COALESCE(add_power, -999),
    COALESCE(mat, '')
  );
