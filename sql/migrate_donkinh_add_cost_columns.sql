-- Migration: add cost columns & backfill
-- 1. Add new columns if not exist
ALTER TABLE "DonKinh"
  ADD COLUMN IF NOT EXISTS gianhap_trong BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gianhap_gong BIGINT DEFAULT 0;

-- 2. Backfill from ax_mp (lens cost) & ax_mt (frame cost) where new columns are zero or null
UPDATE "DonKinh"
SET gianhap_trong = COALESCE(gianhap_trong, 0) + CASE WHEN (gianhap_trong IS NULL OR gianhap_trong = 0) THEN COALESCE(ax_mp,0) ELSE 0 END,
    gianhap_gong  = COALESCE(gianhap_gong, 0)  + CASE WHEN (gianhap_gong  IS NULL OR gianhap_gong  = 0) THEN COALESCE(ax_mt,0) ELSE 0 END;

-- 3. (Optional later) After frontend/backend switch, repurpose ax_mp/ax_mt to store axis (0-180) and optionally rename.
-- ALTER TABLE "DonKinh" RENAME COLUMN ax_mp TO axis_mp; -- (deferred)
-- ALTER TABLE "DonKinh" RENAME COLUMN ax_mt TO axis_mt; -- (deferred)

-- 4. Create index for reporting/profit if needed
CREATE INDEX IF NOT EXISTS idx_donkinh_gianhap ON "DonKinh" (gianhap_trong, gianhap_gong);
