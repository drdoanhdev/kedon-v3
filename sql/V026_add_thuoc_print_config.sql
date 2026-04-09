-- ============================================
-- Thêm cột riêng cho cấu hình in đơn thuốc
-- Tách bạch cài đặt đơn kính và đơn thuốc
-- ============================================

ALTER TABLE cau_hinh_mau_in
  ADD COLUMN IF NOT EXISTS hien_thi_logo_thuoc BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS hien_thi_chan_doan_thuoc BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS hien_thi_gia_thuoc BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hien_thi_ghi_chu_thuoc BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ghi_chu_cuoi_thuoc TEXT DEFAULT '';
