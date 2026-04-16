-- V037: Add ngung_kinh_doanh to HangTrong table
-- Allows discontinuing lens brands (entire brand, not individual combinations)

ALTER TABLE "HangTrong" ADD COLUMN IF NOT EXISTS ngung_kinh_doanh BOOLEAN DEFAULT false;

-- Restore previously soft-deleted brands so they appear with ngung_kinh_doanh = true
-- instead of being permanently hidden
UPDATE "HangTrong" SET ngung_kinh_doanh = true, trang_thai = true WHERE trang_thai = false;
