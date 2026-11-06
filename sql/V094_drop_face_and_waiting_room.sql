-- V094: Drop face recognition + waiting room (ChoKham)
-- Run scripts/purge-face-pending-storage.ts BEFORE this migration to delete R2 snapshots.

BEGIN;

-- ========== 1. Realtime publication ==========
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'PendingFaces'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE "PendingFaces";
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skip drop PendingFaces from realtime: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ChoKham'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE "ChoKham";
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skip drop ChoKham from realtime: %', SQLERRM;
END $$;

-- ========== 2. Face embedding trigger ==========
DROP TRIGGER IF EXISTS trigger_reset_face_embedding_learn_count ON face_embeddings;
DROP FUNCTION IF EXISTS reset_face_embedding_daily_learn_count();

-- ========== 3. Waiting-room RPCs ==========
DROP FUNCTION IF EXISTS cleanup_waiting_room_done_cases(
  INTEGER, UUID, UUID, TEXT, TEXT, UUID, TEXT, JSONB
);
DROP FUNCTION IF EXISTS archive_waiting_cleanup_logs(INTEGER, UUID, UUID);

-- ChoKham done_at sync trigger (V059) if present
DROP TRIGGER IF EXISTS trg_cho_kham_sync_done_at ON "ChoKham";
DROP FUNCTION IF EXISTS cho_kham_sync_done_at();

-- ========== 4. Drop face tables ==========
DROP TABLE IF EXISTS face_audit_log CASCADE;
DROP TABLE IF EXISTS face_biometric_consent CASCADE;
DROP TABLE IF EXISTS face_embeddings CASCADE;
DROP TABLE IF EXISTS "PendingFaces" CASCADE;
DROP TABLE IF EXISTS face_devices CASCADE;
DROP TABLE IF EXISTS insightface_embeddings CASCADE;

-- ========== 5. Drop waiting-room tables ==========
DROP TABLE IF EXISTS waiting_cleanup_logs_archive CASCADE;
DROP TABLE IF EXISTS waiting_cleanup_logs CASCADE;
DROP TABLE IF EXISTS "ChoKham" CASCADE;

-- ========== 6. staff_attendance: remove face/kiosk sources ==========
UPDATE staff_attendance
SET source = 'manual'
WHERE source IN ('face', 'kiosk');

ALTER TABLE staff_attendance
  DROP CONSTRAINT IF EXISTS staff_attendance_source_check;

ALTER TABLE staff_attendance
  ADD CONSTRAINT staff_attendance_source_check
  CHECK (source IN ('manual'));

-- ========== 7. subscription_plans: strip waiting_room + face_recognition ==========
UPDATE subscription_plans
SET
  allowed_features = array_remove(
    array_remove(COALESCE(allowed_features, '{}'::text[]), 'waiting_room'),
    'face_recognition'
  ),
  features = array_remove(
    array_remove(COALESCE(features, '{}'::text[]), 'Phòng chờ khám'),
    'Nhận diện khuôn mặt'
  ),
  updated_at = now();

-- plan_features registry (if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plan_features'
  ) THEN
    DELETE FROM plan_features
    WHERE feature_key IN ('waiting_room', 'face_recognition');
  END IF;
END $$;

-- permission_catalog: remove waiting-room permission (cascades to tenant_role_permissions)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'permission_catalog'
  ) THEN
    DELETE FROM permission_catalog WHERE code = 'manage_waiting_room';
  END IF;
END $$;

COMMIT;
