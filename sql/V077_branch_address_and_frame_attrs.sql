-- ============================================================
-- V077: Them dia chi day du cho chi nhanh + hang san xuat cho gong kinh
-- Bo sung metadata dung chung cho nghiep vu chi nhanh va danh muc gong
-- ============================================================

-- Branch: dia chi day du (giu nguyen cot dia_chi cu cho UI khac)
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS dia_chi_full TEXT;

COMMENT ON COLUMN branches.dia_chi_full IS
  'Dia chi day du cua chi nhanh (VD: "Gao Bac, Ho Tung Mau, An Thi, Hung Yen")';

-- GongKinh: hang san xuat (chat_lieu da co san)
ALTER TABLE "GongKinh"
  ADD COLUMN IF NOT EXISTS hang_san_xuat TEXT;

COMMENT ON COLUMN "GongKinh".hang_san_xuat IS
  'Ten hang san xuat gong (VD: Shieido, Ray-Ban, Versace)';
