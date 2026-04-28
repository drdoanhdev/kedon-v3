-- V050: Branch transfer hardening for inventory operations
-- 1) Allow GongKinh duplicates across different branches in same tenant
-- 2) Add transfer inventory audit log table for thuoc/lens/gong completion tracing

-- ------------------------------------------------------------
-- 1) GongKinh unique scope: per-branch instead of per-tenant only
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gongkinh_tenant_ten_gong_key'
      AND conrelid = '"GongKinh"'::regclass
  ) THEN
    ALTER TABLE "GongKinh" DROP CONSTRAINT gongkinh_tenant_ten_gong_key;
  END IF;
END $$;

-- Unique in shared scope (branch_id is null)
CREATE UNIQUE INDEX IF NOT EXISTS uq_gongkinh_tenant_shared_ten_gong
  ON "GongKinh"(tenant_id, ten_gong)
  WHERE branch_id IS NULL;

-- Unique in branch scope (branch_id is not null)
CREATE UNIQUE INDEX IF NOT EXISTS uq_gongkinh_tenant_branch_ten_gong
  ON "GongKinh"(tenant_id, branch_id, ten_gong)
  WHERE branch_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2) Inventory transfer audit table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_transfer_inventory_logs (
  id BIGSERIAL PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES branch_transfers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loai TEXT NOT NULL CHECK (loai IN ('lens', 'gong', 'thuoc', 'vat_tu')),
  from_branch_id UUID NOT NULL REFERENCES branches(id),
  to_branch_id UUID NOT NULL REFERENCES branches(id),
  source_item_id INTEGER NOT NULL,
  destination_item_id INTEGER NOT NULL,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  don_gia BIGINT NOT NULL DEFAULT 0,
  ten_san_pham TEXT,
  ghi_chu TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_transfer_inventory_logs_tenant
  ON branch_transfer_inventory_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_branch_transfer_inventory_logs_transfer
  ON branch_transfer_inventory_logs(transfer_id);
CREATE INDEX IF NOT EXISTS idx_branch_transfer_inventory_logs_branch_pair
  ON branch_transfer_inventory_logs(from_branch_id, to_branch_id, created_at DESC);

ALTER TABLE branch_transfer_inventory_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branch_transfer_inventory_logs_service_all ON branch_transfer_inventory_logs;
CREATE POLICY branch_transfer_inventory_logs_service_all
  ON branch_transfer_inventory_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS branch_transfer_inventory_logs_tenant_select ON branch_transfer_inventory_logs;
CREATE POLICY branch_transfer_inventory_logs_tenant_select
  ON branch_transfer_inventory_logs
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
