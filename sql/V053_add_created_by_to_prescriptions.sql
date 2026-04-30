-- V053: Add created_by tracking to prescriptions for per-staff productivity reports
-- This enables KPI dashboards showing how many prescriptions each staff member created.

BEGIN;

ALTER TABLE "DonThuoc"
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "DonKinh"
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_donthuoc_created_by
  ON "DonThuoc" (tenant_id, created_by, ngay_kham);

CREATE INDEX IF NOT EXISTS idx_donkinh_created_by
  ON "DonKinh" (tenant_id, created_by, ngay_kham);

COMMIT;
