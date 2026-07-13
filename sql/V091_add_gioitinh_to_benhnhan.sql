-- V091: Thêm cột giới tính (Nam | Nữ | null) vào BenhNhan
ALTER TABLE "BenhNhan"
  ADD COLUMN IF NOT EXISTS gioitinh text;

COMMENT ON COLUMN "BenhNhan".gioitinh IS 'Nam | Nữ | null';
