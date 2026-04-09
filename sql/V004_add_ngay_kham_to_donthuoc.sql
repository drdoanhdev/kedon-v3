-- Thêm field ngay_kham vào bảng DonThuoc
ALTER TABLE "DonThuoc" 
ADD COLUMN "ngay_kham" TIMESTAMP;

-- Cập nhật ngay_kham cho các record cũ = ngaylap
UPDATE "DonThuoc" 
SET "ngay_kham" = "ngaylap" 
WHERE "ngay_kham" IS NULL;

-- Comment: Field ngay_kham giúp lưu ngày khám riêng biệt với ngày lập đơn
