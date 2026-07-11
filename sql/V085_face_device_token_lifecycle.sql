-- V085: Vòng đời device token cho nhận diện khuôn mặt
-- Thêm hạn token + mốc xoay vòng để hỗ trợ thu hồi/luân chuyển an toàn.

ALTER TABLE face_devices
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS token_rotated_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN face_devices.token_expires_at IS 'Thời điểm device token hết hạn (NULL = không hết hạn, dữ liệu cũ)';
COMMENT ON COLUMN face_devices.token_rotated_at IS 'Lần gần nhất token được xoay vòng (re-pair)';

-- Index hỗ trợ truy vấn thiết bị sắp hết hạn (cảnh báo/luân chuyển).
CREATE INDEX IF NOT EXISTS idx_face_devices_token_expiry
  ON face_devices (tenant_id, token_expires_at)
  WHERE status = 'active' AND token_expires_at IS NOT NULL;
