-- V080: DonThuoc media storage foundation
-- Luu anh cho don thuoc tuong tu don kinh, giu tam khi chua luu don.

CREATE TABLE IF NOT EXISTS don_thuoc_media (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  don_thuoc_id INTEGER NOT NULL REFERENCES "DonThuoc"(id) ON DELETE CASCADE,
  benhnhan_id INTEGER NOT NULL REFERENCES "BenhNhan"(id) ON DELETE CASCADE,
  loai_anh TEXT NOT NULL DEFAULT 'don_thuoc' CHECK (loai_anh IN ('don_thuoc')),
  storage_driver TEXT NOT NULL DEFAULT 'supabase' CHECK (storage_driver IN ('supabase', 'r2')),
  bucket TEXT NOT NULL DEFAULT 'don-thuoc-media',
  object_path TEXT NOT NULL,
  original_filename TEXT NULL,
  mime_type TEXT NULL,
  size_bytes INTEGER NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  width INTEGER NULL CHECK (width IS NULL OR width > 0),
  height INTEGER NULL CHECK (height IS NULL OR height > 0),
  captured_at TIMESTAMPTZ NULL,
  captured_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source_device TEXT NULL,
  ghi_chu TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_don_thuoc_media_object
  ON don_thuoc_media(storage_driver, bucket, object_path);

CREATE INDEX IF NOT EXISTS idx_don_thuoc_media_lookup
  ON don_thuoc_media(tenant_id, branch_id, don_thuoc_id, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_don_thuoc_media_benhnhan_lookup
  ON don_thuoc_media(tenant_id, benhnhan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_don_thuoc_media_status
  ON don_thuoc_media(tenant_id, status, created_at DESC);

ALTER TABLE don_thuoc_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS don_thuoc_media_select ON don_thuoc_media;
DROP POLICY IF EXISTS don_thuoc_media_insert ON don_thuoc_media;
DROP POLICY IF EXISTS don_thuoc_media_update ON don_thuoc_media;
DROP POLICY IF EXISTS don_thuoc_media_delete ON don_thuoc_media;

CREATE POLICY don_thuoc_media_select ON don_thuoc_media
FOR SELECT
USING (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM tenantmembership tm
      WHERE tm.tenant_id = don_thuoc_media.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
);

CREATE POLICY don_thuoc_media_insert ON don_thuoc_media
FOR INSERT
WITH CHECK (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM tenantmembership tm
      WHERE tm.tenant_id = don_thuoc_media.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
);

CREATE POLICY don_thuoc_media_update ON don_thuoc_media
FOR UPDATE
USING (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM tenantmembership tm
      WHERE tm.tenant_id = don_thuoc_media.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
)
WITH CHECK (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM tenantmembership tm
      WHERE tm.tenant_id = don_thuoc_media.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
);

CREATE POLICY don_thuoc_media_delete ON don_thuoc_media
FOR DELETE
USING (
  (
    branch_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM tenantmembership tm
      WHERE tm.tenant_id = don_thuoc_media.tenant_id
        AND tm.user_id = auth.uid()
        AND COALESCE(tm.active, TRUE)
    )
  )
  OR has_branch_access(tenant_id, branch_id)
);

DROP TRIGGER IF EXISTS trg_don_thuoc_media_updated_at ON don_thuoc_media;
CREATE TRIGGER trg_don_thuoc_media_updated_at
  BEFORE UPDATE ON don_thuoc_media
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'don-thuoc-media',
  'don-thuoc-media',
  FALSE,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
