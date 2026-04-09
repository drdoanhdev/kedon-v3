-- Thêm cột PD/2 (khoảng cách đồng tử) cho mắt phải và mắt trái
ALTER TABLE "DonKinh"
  ADD COLUMN IF NOT EXISTS pd_mp TEXT,
  ADD COLUMN IF NOT EXISTS pd_mt TEXT;
