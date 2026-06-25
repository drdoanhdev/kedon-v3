-- V083: Face recognition UX — track check-in source on waiting queue

ALTER TABLE "ChoKham"
  ADD COLUMN IF NOT EXISTS check_in_source TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_chokham_check_in_source
  ON "ChoKham" (tenant_id, check_in_source)
  WHERE check_in_source IS NOT NULL;
