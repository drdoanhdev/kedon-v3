-- V089: Bật Supabase Realtime cho ChoKham + PendingFaces
-- Dùng cho toast check-in tức thì, pending faces inbox, và màn hình kiosk.

DO $$
BEGIN
  -- ChoKham
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ChoKham'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "ChoKham";
  END IF;

  -- PendingFaces
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'PendingFaces'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PendingFaces";
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Publication supabase_realtime không tồn tại — bỏ qua (môi trường không phải Supabase)';
  WHEN duplicate_object THEN
    RAISE NOTICE 'Bảng đã nằm trong publication supabase_realtime';
END $$;
