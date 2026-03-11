-- Migration: Chuyển trạng thái thanh toán sang boolean và chỉ giữ ngày khám
-- 1. Thêm trường mới is_paid kiểu boolean
ALTER TABLE "DonThuoc" ADD COLUMN is_paid boolean DEFAULT false;

-- 2. Chuyển dữ liệu từ trangthai_thanh_toan sang is_paid
UPDATE "DonThuoc" SET is_paid = CASE WHEN trangthai_thanh_toan = 'đã thanh toán' THEN true ELSE false END;

-- 3. Xóa trường trangthai_thanh_toan
ALTER TABLE "DonThuoc" DROP COLUMN trangthai_thanh_toan;

-- 4. Nếu có trường ngày lập/ngày kê đơn dư thừa, xóa trường đó (ví dụ: ngay_ke_don)
-- ALTER TABLE "DonThuoc" DROP COLUMN ngay_ke_don; -- Bỏ comment nếu trường này tồn tại

-- Script này chỉ giữ lại trường ngay_kham và chuyển trạng thái thanh toán sang boolean.
