-- ============================================
-- V036: Thêm các cột FK vào DonKinh
-- Cột hang_trong_mp_id, hang_trong_mt_id, gong_kinh_id
-- đã tồn tại trên Optigo (dev) nhưng chưa có migration chính thức
-- ============================================

-- Thêm cột FK cho hãng tròng mắt phải
ALTER TABLE "DonKinh" ADD COLUMN IF NOT EXISTS hang_trong_mp_id INTEGER;

-- Thêm cột FK cho hãng tròng mắt trái
ALTER TABLE "DonKinh" ADD COLUMN IF NOT EXISTS hang_trong_mt_id INTEGER;

-- Thêm cột FK cho gọng kính
ALTER TABLE "DonKinh" ADD COLUMN IF NOT EXISTS gong_kinh_id INTEGER;

-- Indexes cho FK columns
CREATE INDEX IF NOT EXISTS idx_donkinh_hang_trong_mp ON "DonKinh"(hang_trong_mp_id);
CREATE INDEX IF NOT EXISTS idx_donkinh_hang_trong_mt ON "DonKinh"(hang_trong_mt_id);
CREATE INDEX IF NOT EXISTS idx_donkinh_gong_kinh ON "DonKinh"(gong_kinh_id);
