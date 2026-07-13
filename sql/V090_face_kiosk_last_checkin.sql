-- V090: Cột last_face_checkin_at cho phản hồi kiosk khi nhận diện lại
-- (kể cả khi BN đã có trong ChoKham — vẫn hiện "Xin chào" trên màn hình kiosk)

ALTER TABLE "ChoKham" ADD COLUMN IF NOT EXISTS last_face_checkin_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_chokham_last_face_checkin
  ON "ChoKham"(tenant_id, last_face_checkin_at DESC)
  WHERE last_face_checkin_at IS NOT NULL;
