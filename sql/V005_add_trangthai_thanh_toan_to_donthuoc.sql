-- TASK 2: Thêm cột trangthai_thanh_toan cho bảng DonThuoc
-- Yêu cầu: text CHECK ('đã trả','nợ','miễn phí') DEFAULT 'đã trả'
-- Chấp nhận: Tất cả bản ghi cũ nhận giá trị 'đã trả'; insert mới không chỉ định vẫn dùng default.

BEGIN;

-- 1. Thêm cột (nếu đã tồn tại lần chạy lại sẽ bỏ qua nhờ IF NOT EXISTS cho cột)
ALTER TABLE "DonThuoc"
  ADD COLUMN IF NOT EXISTS trangthai_thanh_toan text DEFAULT 'đã trả';

-- 2. Gán giá trị mặc định cho các bản ghi cũ (chỉ những bản ghi còn NULL)
UPDATE "DonThuoc"
   SET trangthai_thanh_toan = 'đã trả'
 WHERE trangthai_thanh_toan IS NULL;

-- 3. Thêm ràng buộc CHECK (chỉ chạy nếu chưa tồn tại)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
     WHERE conname = 'DonThuoc_trangthai_thanh_toan_check'
  ) THEN
    ALTER TABLE "DonThuoc"
      ADD CONSTRAINT DonThuoc_trangthai_thanh_toan_check
      CHECK (trangthai_thanh_toan IN ('đã trả','nợ','miễn phí'));
  END IF;
END $$;

-- 4. (Tuỳ chọn) Ép NOT NULL để đảm bảo luôn có trạng thái. Bỏ comment nếu cần.
-- ALTER TABLE "DonThuoc" ALTER COLUMN trangthai_thanh_toan SET NOT NULL;

COMMIT;

-- Rollback thủ công (nếu cần sau khi chạy sai và chưa dùng ở nơi khác):
-- ALTER TABLE "DonThuoc" DROP CONSTRAINT IF EXISTS DonThuoc_trangthai_thanh_toan_check;
-- ALTER TABLE "DonThuoc" DROP COLUMN IF EXISTS trangthai_thanh_toan;
