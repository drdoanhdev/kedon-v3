-- ============================================
-- Thêm cột người ký và ngày khám cho cấu hình in
-- ============================================

ALTER TABLE cau_hinh_mau_in
  ADD COLUMN IF NOT EXISTS chuc_danh_nguoi_ky TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ho_ten_nguoi_ky TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS chu_ky_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS hien_thi_nguoi_ky BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS hien_thi_nguoi_ky_thuoc BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS hien_thi_ngay_kham BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS hien_thi_ngay_kham_thuoc BOOLEAN DEFAULT true;
