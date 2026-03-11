-- TASK 3: Chuyển các cột tiền từ double precision → bigint (đơn vị: VND, không thập phân)
-- BẢNG & CỘT:
--   DonThuoc (tongtien, lai)
--   DonKinh  (giatrong, giagong, lai)
--   Thuoc    (giaban, gianhap)
-- CHIẾN LƯỢC:
--   1. Thêm cột *_int kiểu BIGINT (NOT NULL DEFAULT 0)
--   2. Backfill: UPDATE với ROUND(cột_cũ)
--   3. Kiểm tra chênh lệch (log số bản ghi có sai khác >1 VND nếu cần)
--   4. Transaction ngắn: Đổi tên cột cũ -> *_double (hoặc *_old), cột mới -> tên gốc
--   5. (Tuỳ chọn) Drop cột *_double sau khi ổn định (chạy riêng, không gộp để rollback dễ)
-- ZERO DOWNTIME LƯU Ý:
--   - Bước backfill chạy ngoài transaction dài để tránh khóa.
--   - Đổi tên cột (ALTER TABLE RENAME) nhanh (metadata only) → gói vào transaction ngắn.
-- ROLLBACK:
--   - Đổi tên trả lại nếu chưa drop cột *_double.
--   - Không thực hiện nếu ứng dụng đã ghi dữ liệu mới vào cột bigint.

-- =============================
-- 1. THÊM CỘT MỚI
-- =============================
ALTER TABLE "DonThuoc"
  ADD COLUMN IF NOT EXISTS tongtien_int BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lai_int BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "DonKinh"
  ADD COLUMN IF NOT EXISTS giatrong_int BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS giagong_int BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lai_int BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "Thuoc"
  ADD COLUMN IF NOT EXISTS giaban_int BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gianhap_int BIGINT NOT NULL DEFAULT 0;

-- =============================
-- 2. BACKFILL (chạy nhiều lần an toàn, idempotent)
-- =============================
-- DonThuoc
UPDATE "DonThuoc"
   SET tongtien_int = ROUND(tongtien)::BIGINT,
       lai_int      = ROUND(lai)::BIGINT
 WHERE (tongtien IS NOT NULL AND tongtien_int = 0) OR (lai IS NOT NULL AND lai_int = 0);

-- DonKinh
UPDATE "DonKinh"
   SET giatrong_int = ROUND(giatrong)::BIGINT,
       giagong_int  = ROUND(giagong)::BIGINT,
       lai_int      = ROUND(lai)::BIGINT
 WHERE (giatrong IS NOT NULL AND giatrong_int = 0)
    OR (giagong  IS NOT NULL AND giagong_int  = 0)
    OR (lai      IS NOT NULL AND lai_int      = 0);

-- Thuoc
UPDATE "Thuoc"
   SET giaban_int  = ROUND(giaban)::BIGINT,
       gianhap_int = ROUND(gianhap)::BIGINT
 WHERE (giaban IS NOT NULL AND giaban_int = 0)
    OR (gianhap IS NOT NULL AND gianhap_int = 0);

-- =============================
-- 3. KIỂM TRA SAI KHÁC (tùy chọn – chạy thủ công để audit trước khi rename)
-- =============================
-- SELECT COUNT(*) AS diff_tongtien FROM "DonThuoc" WHERE ABS(ROUND(tongtien)::BIGINT - tongtien_int) > 0;
-- SELECT COUNT(*) AS diff_lai_donthuoc FROM "DonThuoc" WHERE ABS(ROUND(lai)::BIGINT - lai_int) > 0;
-- SELECT COUNT(*) AS diff_giatrong FROM "DonKinh" WHERE ABS(ROUND(giatrong)::BIGINT - giatrong_int) > 0;
-- SELECT COUNT(*) AS diff_giagong FROM "DonKinh" WHERE ABS(ROUND(giagong)::BIGINT - giagong_int) > 0;
-- SELECT COUNT(*) AS diff_lai_donkinh FROM "DonKinh" WHERE ABS(ROUND(lai)::BIGINT - lai_int) > 0;
-- SELECT COUNT(*) AS diff_giaban FROM "Thuoc" WHERE ABS(ROUND(giaban)::BIGINT - giaban_int) > 0;
-- SELECT COUNT(*) AS diff_gianhap FROM "Thuoc" WHERE ABS(ROUND(gianhap)::BIGINT - gianhap_int) > 0;

-- =============================
-- 4. ĐỔI TÊN CỘT (TRANSACTION NGẮN)
-- =============================
BEGIN;
-- DonThuoc
ALTER TABLE "DonThuoc" RENAME COLUMN tongtien TO tongtien_double;
ALTER TABLE "DonThuoc" RENAME COLUMN lai TO lai_double;
ALTER TABLE "DonThuoc" RENAME COLUMN tongtien_int TO tongtien;
ALTER TABLE "DonThuoc" RENAME COLUMN lai_int TO lai;

-- DonKinh
ALTER TABLE "DonKinh" RENAME COLUMN giatrong TO giatrong_double;
ALTER TABLE "DonKinh" RENAME COLUMN giagong TO giagong_double;
ALTER TABLE "DonKinh" RENAME COLUMN lai TO lai_double;
ALTER TABLE "DonKinh" RENAME COLUMN giatrong_int TO giatrong;
ALTER TABLE "DonKinh" RENAME COLUMN giagong_int TO giagong;
ALTER TABLE "DonKinh" RENAME COLUMN lai_int TO lai;

-- Thuoc
ALTER TABLE "Thuoc" RENAME COLUMN giaban TO giaban_double;
ALTER TABLE "Thuoc" RENAME COLUMN gianhap TO gianhap_double;
ALTER TABLE "Thuoc" RENAME COLUMN giaban_int TO giaban;
ALTER TABLE "Thuoc" RENAME COLUMN gianhap_int TO gianhap;
COMMIT;

-- =============================
-- 5. (TUỲ CHỌN) THÊM COMMENT ĐÁNH DẤU ĐƠN VỊ
-- =============================
COMMENT ON COLUMN "DonThuoc".tongtien IS 'VND (bigint, nguyên)';
COMMENT ON COLUMN "DonThuoc".lai IS 'VND (bigint, nguyên)';
COMMENT ON COLUMN "DonKinh".giatrong IS 'VND (bigint, nguyên)';
COMMENT ON COLUMN "DonKinh".giagong IS 'VND (bigint, nguyên)';
COMMENT ON COLUMN "DonKinh".lai IS 'VND (bigint, nguyên)';
COMMENT ON COLUMN "Thuoc".giaban IS 'VND (bigint, nguyên)';
COMMENT ON COLUMN "Thuoc".gianhap IS 'VND (bigint, nguyên)';

-- =============================
-- 6. (SAU KHI ỔN ĐỊNH) DỌN DẸP CỘT CŨ (CHẠY RIÊNG SAU 1-2 NGÀY)
-- =============================
-- ALTER TABLE "DonThuoc" DROP COLUMN IF EXISTS tongtien_double, DROP COLUMN IF EXISTS lai_double;
-- ALTER TABLE "DonKinh"  DROP COLUMN IF EXISTS giatrong_double, DROP COLUMN IF EXISTS giagong_double, DROP COLUMN IF EXISTS lai_double;
-- ALTER TABLE "Thuoc"    DROP COLUMN IF EXISTS giaban_double, DROP COLUMN IF EXISTS gianhap_double;

-- =============================
-- ROLLBACK (NẾU CẦN VÀ CHƯA XÓA *_double; chú ý có thể mất dữ liệu mới ghi):
-- BEGIN;
-- ALTER TABLE "DonThuoc" RENAME COLUMN tongtien TO tongtien_int_rollback;
-- ALTER TABLE "DonThuoc" RENAME COLUMN tongtien_double TO tongtien;
-- ALTER TABLE "DonThuoc" RENAME COLUMN lai TO lai_int_rollback;
-- ALTER TABLE "DonThuoc" RENAME COLUMN lai_double TO lai;
-- (Tương tự cho DonKinh, Thuoc...)
-- COMMIT;

-- KẾT THÚC TASK 3
