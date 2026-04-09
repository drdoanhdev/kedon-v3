-- Thêm cột ngung_kinh_doanh cho bảng Thuoc
-- Đánh dấu thuốc không còn kinh doanh (ẩn khỏi kê đơn, quản lý kho)
ALTER TABLE "Thuoc" ADD COLUMN IF NOT EXISTS ngung_kinh_doanh BOOLEAN DEFAULT false;
