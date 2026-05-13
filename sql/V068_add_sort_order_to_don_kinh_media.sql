-- V068: Add stable sort order for DonKinh media gallery
-- Goal: allow users to reorder images and keep the order after reload.

ALTER TABLE don_kinh_media
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, don_kinh_id
      ORDER BY created_at ASC, id ASC
    ) - 1 AS rn
  FROM don_kinh_media
)
UPDATE don_kinh_media AS m
SET sort_order = ranked.rn
FROM ranked
WHERE m.id = ranked.id
  AND (m.sort_order IS NULL OR m.sort_order < 0);

UPDATE don_kinh_media
SET sort_order = 0
WHERE sort_order IS NULL;

ALTER TABLE don_kinh_media
  ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE don_kinh_media
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_don_kinh_media_sort_order_lookup
  ON don_kinh_media(tenant_id, don_kinh_id, sort_order, created_at DESC);
