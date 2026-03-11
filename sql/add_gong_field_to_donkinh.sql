-- Thêm trường gọng kính vào bảng DonKinh
-- Chạy câu lệnh này trong Supabase SQL Editor

-- Thêm cột ten_gong để lưu tên gọng đã chọn
ALTER TABLE "DonKinh" 
ADD COLUMN IF NOT EXISTS "ten_gong" TEXT;

-- Có thể thêm index cho việc tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS "idx_donkinh_ten_gong" 
ON "DonKinh" ("ten_gong");

-- Kiểm tra cấu trúc bảng sau khi thêm
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'DonKinh' 
-- ORDER BY ordinal_position;
