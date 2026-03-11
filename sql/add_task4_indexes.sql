-- TASK 4: Thêm index phục vụ tìm kiếm & lịch sử
-- YÊU CẦU:
-- 1. BenhNhan(lower(ten))
-- 2. BenhNhan(mabenhnhan) UNIQUE WHERE mabenhnhan IS NOT NULL
-- 3. DonThuoc(benhnhanid, ngay_kham DESC)
-- 4. DonKinh(benhnhanid, ngay_kham DESC)  -- giả định cột chuẩn trong DB là ngay_kham
-- 5. Partial index nợ (no = true) cho DonThuoc và DonKinh (tăng tốc lọc nợ)
--   * Nếu cột 'no' kiểu boolean.
-- GHI CHÚ: Dùng kiểm tra catalog để tránh duplicate.

-- =========================
-- BenhNhan: index tìm kiếm tên không phân biệt hoa thường
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_benhnhan_lower_ten'
  ) THEN
    CREATE INDEX idx_benhnhan_lower_ten ON "BenhNhan" (lower(ten));
  END IF;
END $$;

-- =========================
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT mabenhnhan FROM "BenhNhan"
    WHERE mabenhnhan IS NOT NULL
    GROUP BY mabenhnhan
    HAVING COUNT(*) > 1
  ) t;

  IF dup_count > 0 THEN
    RAISE NOTICE '⚠️  Không tạo unique index uniq_benhnhan_mabenhnhan_notnull: phát hiện % mã trùng. Dọn dữ liệu trước.', dup_count;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_benhnhan_mabenhnhan_notnull'
  ) THEN
    CREATE UNIQUE INDEX uniq_benhnhan_mabenhnhan_notnull ON "BenhNhan" (mabenhnhan) WHERE mabenhnhan IS NOT NULL;
  END IF;
END $$;

-- =========================
-- DonThuoc: composite (benhnhanid, ngay_kham DESC)
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_donthuoc_benhnhanid_ngaykham'
  ) THEN
    CREATE INDEX idx_donthuoc_benhnhanid_ngaykham ON "DonThuoc" (benhnhanid, ngay_kham DESC);
  END IF;
END $$;

-- =========================
-- DonKinh: composite (benhnhanid, ngaykham DESC) (đã chỉnh sang 'ngaykham')
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_donkinh_benhnhanid_ngaykham'
  ) THEN
    CREATE INDEX idx_donkinh_benhnhanid_ngaykham ON "DonKinh" (benhnhanid, ngaykham DESC);
  END IF;
END $$;

-- =========================
-- Partial index: đơn thuốc còn nợ (no = true)
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_donthuoc_no_true'
  ) THEN
    CREATE INDEX idx_donthuoc_no_true ON "DonThuoc" (benhnhanid, ngay_kham DESC) WHERE no IS TRUE;
  END IF;
END $$;

-- =========================
-- Partial index: đơn kính còn nợ (no = true) nếu bảng có cột 'no'
-- =========================
DO $$
DECLARE
  has_no BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='DonKinh' AND column_name='no'
  ) INTO has_no;

  IF has_no THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_donkinh_no_true'
    ) THEN
      CREATE INDEX idx_donkinh_no_true ON "DonKinh" (benhnhanid) WHERE no IS TRUE;
    END IF;
  END IF;
END $$;

-- KẾT THÚC TASK 4 (PHASE 1 - Indexes)
