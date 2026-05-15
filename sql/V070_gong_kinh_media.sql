-- V070: GongKinh media storage (frames)
-- Goals:
-- 1) Add normalized metadata table for images attached to GongKinh.
-- 2) Max 3 images per frame (mặt trước, mặt trái, mặt phải).
-- 3) Store in Supabase bucket 'gong-kinh-media'.

CREATE TABLE IF NOT EXISTS gong_kinh_media (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  gong_kinh_id INTEGER NOT NULL REFERENCES "GongKinh"(id) ON DELETE CASCADE,
  loai_anh TEXT NOT NULL CHECK (loai_anh IN ('mat_truoc', 'mat_trai', 'mat_phai')),
  storage_driver TEXT NOT NULL DEFAULT 'supabase' CHECK (storage_driver IN ('supabase', 'r2')),
  bucket TEXT NOT NULL DEFAULT 'gong-kinh-media',
  object_path TEXT NOT NULL,
  original_filename TEXT NULL,
  mime_type TEXT NULL,
  size_bytes INTEGER NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  width INTEGER NULL CHECK (width IS NULL OR width > 0),
  height INTEGER NULL CHECK (height IS NULL OR height > 0),
  captured_at TIMESTAMPTZ NULL,
  captured_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ghi_chu TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: 1 ảnh per loại ảnh per gọng
CREATE UNIQUE INDEX IF NOT EXISTS uq_gong_kinh_media_per_type
  ON gong_kinh_media(tenant_id, gong_kinh_id, loai_anh)
  WHERE status = 'uploaded';

CREATE UNIQUE INDEX IF NOT EXISTS uq_gong_kinh_media_object
  ON gong_kinh_media(storage_driver, bucket, object_path);

CREATE INDEX IF NOT EXISTS idx_gong_kinh_media_lookup
  ON gong_kinh_media(tenant_id, gong_kinh_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gong_kinh_media_status
  ON gong_kinh_media(tenant_id, status, created_at DESC);

ALTER TABLE gong_kinh_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gong_kinh_media_select ON gong_kinh_media;
DROP POLICY IF EXISTS gong_kinh_media_insert ON gong_kinh_media;
DROP POLICY IF EXISTS gong_kinh_media_update ON gong_kinh_media;
DROP POLICY IF EXISTS gong_kinh_media_delete ON gong_kinh_media;

CREATE POLICY gong_kinh_media_select ON gong_kinh_media
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM tenantmembership tm
    WHERE tm.tenant_id = gong_kinh_media.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
);

CREATE POLICY gong_kinh_media_insert ON gong_kinh_media
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM tenantmembership tm
    WHERE tm.tenant_id = gong_kinh_media.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
);

CREATE POLICY gong_kinh_media_update ON gong_kinh_media
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM tenantmembership tm
    WHERE tm.tenant_id = gong_kinh_media.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM tenantmembership tm
    WHERE tm.tenant_id = gong_kinh_media.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
);

CREATE POLICY gong_kinh_media_delete ON gong_kinh_media
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM tenantmembership tm
    WHERE tm.tenant_id = gong_kinh_media.tenant_id
      AND tm.user_id = auth.uid()
      AND COALESCE(tm.active, TRUE)
  )
);
