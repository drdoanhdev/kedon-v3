-- V040: Thêm cột created_at vào bảng BenhNhan để theo dõi ngày lập hồ sơ
-- Cột này sẽ tự động gán thời gian hiện tại khi thêm bệnh nhân mới
-- Các bệnh nhân cũ sẽ có giá trị NULL (chưa có ngày lập)

ALTER TABLE "BenhNhan" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Cập nhật bệnh nhân cũ: ước tính ngày lập dựa trên đơn thuốc/đơn kính đầu tiên
-- Nếu bệnh nhân có đơn thuốc hoặc đơn kính, lấy ngày sớm nhất làm ngày lập
UPDATE "BenhNhan" bn
SET created_at = COALESCE(
  (SELECT LEAST(
    (SELECT MIN(ngay_kham) FROM "DonThuoc" WHERE benhnhanid = bn.id),
    (SELECT MIN(ngaykham) FROM "DonKinh" WHERE benhnhanid = bn.id)
  )),
  now()
)
WHERE created_at IS NULL OR created_at = now();
