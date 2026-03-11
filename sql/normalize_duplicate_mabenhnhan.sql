-- PURPOSE: Chuẩn hoá mã bệnh nhân trùng (mabenhnhan) để tạo được unique index.
-- Chiến lược:
--  * Giữ lại bản ghi có id nhỏ nhất cho mỗi mã hiện có (coi là bản gốc).
--  * Các bản ghi trùng còn lại cấp mã mới dạng BN00001, BN00002... nối tiếp max hiện có.
--  * Áp dụng cho mọi bản ghi có mabenhnhan trùng (kể cả mã không đúng pattern BN\d+).
--  * Nếu mã gốc không theo pattern BN\d+, vẫn giữ nguyên; các mã phát sinh mới luôn chuẩn BNxxxxx.
-- An toàn chạy nhiều lần: Sau lần đầu sẽ không còn bản ghi rn>1 → không cập nhật gì.
-- Sau khi chạy: thực thi lại block tạo unique index trong add_task4_indexes.sql.

-- BƯỚC 0 (tuỳ chọn): Xem trước các mã trùng & đề xuất mã mới (dry run)
-- SELECT * FROM (
--   WITH dups AS (
--     SELECT id, mabenhnhan,
--            ROW_NUMBER() OVER (PARTITION BY mabenhnhan ORDER BY id) rn
--     FROM "BenhNhan"
--     WHERE mabenhnhan IS NOT NULL
--   ), base AS (
--     SELECT mabenhnhan, id FROM dups WHERE rn = 1
--   ), to_fix AS (
--     SELECT id, mabenhnhan, rn FROM dups WHERE rn > 1
--   ), max_bn AS (
--     SELECT COALESCE(MAX((regexp_replace(mabenhnhan,'^BN(\\d+)$','\\1'))::int),0) AS max_num
--     FROM "BenhNhan" WHERE mabenhnhan ~ '^BN\\d+$'
--   )
--   SELECT t.id, t.mabenhnhan AS old_code,
--          'BN'||LPAD( (max_bn.max_num + ROW_NUMBER() OVER (ORDER BY t.id))::text, 5, '0') AS new_code
--   FROM to_fix t CROSS JOIN max_bn
--   ORDER BY t.mabenhnhan, t.id
-- ) preview;

DO $$
DECLARE
  v_dup_count INTEGER;
  v_updated   INTEGER;
BEGIN
  -- Khoá advisory để tránh 2 session chạy đồng thời (tuỳ chọn)
  PERFORM pg_advisory_xact_lock(923451, 20250914);

  -- Đếm bản ghi trùng (số record dư ra ngoài bản gốc)
  WITH d AS (
    SELECT mabenhnhan, COUNT(*) AS c
    FROM "BenhNhan"
    WHERE mabenhnhan IS NOT NULL
    GROUP BY mabenhnhan
    HAVING COUNT(*) > 1
  )
  SELECT COALESCE(SUM(c-1),0) INTO v_dup_count FROM d;

  IF v_dup_count = 0 THEN
    RAISE NOTICE '✅ Không có mã bệnh nhân trùng – không cần chuẩn hoá.';
    RETURN;
  ELSE
    RAISE NOTICE 'Phát hiện % bản ghi trùng cần chuẩn hoá, tiến hành cập nhật...', v_dup_count;
  END IF;

  WITH dups AS (
    SELECT id, mabenhnhan,
           ROW_NUMBER() OVER (PARTITION BY mabenhnhan ORDER BY id) rn
    FROM "BenhNhan"
    WHERE mabenhnhan IS NOT NULL
  ), to_fix AS (
    SELECT id
    FROM dups
    WHERE rn > 1
  ), max_bn AS (
    SELECT COALESCE(MAX((regexp_replace(mabenhnhan,'^BN(\\d+)$','\\1'))::int),0) AS max_num
    FROM "BenhNhan" WHERE mabenhnhan ~ '^BN\\d+$'
  ), numbered AS (
    SELECT tf.id,
           (SELECT max_num FROM max_bn) + ROW_NUMBER() OVER (ORDER BY tf.id) AS seq
    FROM to_fix tf
  ), upd AS (
    UPDATE "BenhNhan" b
    SET mabenhnhan = 'BN'||LPAD(numbered.seq::text, 5, '0')
    FROM numbered
    WHERE b.id = numbered.id
    RETURNING b.id
  )
  SELECT COUNT(*) INTO v_updated FROM upd;

  RAISE NOTICE '✅ Đã gán mã mới cho % bản ghi trùng.', v_updated;
END $$;

-- Sau khi script này chạy thành công, chạy lại phần tạo unique index:
--
-- DO $$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_benhnhan_mabenhnhan_notnull'
--   ) THEN
--     CREATE UNIQUE INDEX uniq_benhnhan_mabenhnhan_notnull ON "BenhNhan" (mabenhnhan) WHERE mabenhnhan IS NOT NULL;
--   END IF;
-- END $$;

-- Kiểm tra cuối cùng:
-- SELECT mabenhnhan, COUNT(*) FROM "BenhNhan" WHERE mabenhnhan IS NOT NULL GROUP BY mabenhnhan HAVING COUNT(*)>1;
-- (Kết quả mong đợi: 0 hàng)

-- KẾT THÚC SCRIPT CHUẨN HOÁ MÃ BỆNH NHÂN