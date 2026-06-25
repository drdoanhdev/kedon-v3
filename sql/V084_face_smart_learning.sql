-- V084: Smart Learning columns for face_embeddings (centroid EMA updates)

ALTER TABLE face_embeddings
  ADD COLUMN IF NOT EXISTS embedding_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quality_score REAL NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS last_learned_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS learn_count_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS learn_date DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE OR REPLACE FUNCTION reset_face_embedding_daily_learn_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.learn_date IS DISTINCT FROM CURRENT_DATE THEN
    NEW.learn_date := CURRENT_DATE;
    NEW.learn_count_today := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reset_face_embedding_learn_count ON face_embeddings;
CREATE TRIGGER trigger_reset_face_embedding_learn_count
  BEFORE UPDATE ON face_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION reset_face_embedding_daily_learn_count();

COMMENT ON COLUMN face_embeddings.embedding_count IS 'Số lần centroid được cập nhật (Smart Learning)';
COMMENT ON COLUMN face_embeddings.quality_score IS 'Độ tin cậy centroid 0-1, tăng dần theo số lần học';
