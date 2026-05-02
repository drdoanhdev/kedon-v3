-- V056: Lens ordering upgrade — add brand column + supplier Zalo deep-link
-- Goals:
--   1) Reinterpret HangTrong.ten_hang as "Loại tròng" (lens model/spec).
--      Add NEW column HangTrong.hang for actual manufacturer brand
--      (e.g. "Essilor", "Hoya", "Zeiss") so orders can be grouped/filtered.
--   2) Add NhaCungCap.zalo_phone for one-click Zalo deep-link from
--      the "Tròng cần đặt" tab.
--   3) Index for grouping orders by brand.
--
-- This migration is purely additive; no data rename or destructive change.

BEGIN;

-- 1) HangTrong: add brand column
ALTER TABLE "HangTrong"
  ADD COLUMN IF NOT EXISTS hang TEXT;

CREATE INDEX IF NOT EXISTS idx_hangtrong_tenant_hang
  ON "HangTrong"(tenant_id, hang);

COMMENT ON COLUMN "HangTrong".ten_hang IS 'Loại/dòng tròng (model name) — VD: Crizal Sapphire UV';
COMMENT ON COLUMN "HangTrong".hang     IS 'Hãng tròng / nhà sản xuất (brand) — VD: Essilor, Hoya, Zeiss';

-- 2) NhaCungCap: add Zalo phone (separate from main phone) for deep-link
ALTER TABLE "NhaCungCap"
  ADD COLUMN IF NOT EXISTS zalo_phone TEXT;

COMMENT ON COLUMN "NhaCungCap".zalo_phone IS 'Số điện thoại Zalo dùng cho deep-link https://zalo.me/<phone> khi đặt hàng';

COMMIT;
