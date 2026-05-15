-- V071: Ensure GongKinh media bucket + updated_at trigger exist
-- Why: V070 introduces table/policies but existing DBs may miss storage bucket/trigger.

DROP TRIGGER IF EXISTS trg_gong_kinh_media_updated_at ON gong_kinh_media;
CREATE TRIGGER trg_gong_kinh_media_updated_at
  BEFORE UPDATE ON gong_kinh_media
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gong-kinh-media',
  'gong-kinh-media',
  FALSE,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
