-- Fix unique constraints cho multi-tenant
-- Vấn đề: UNIQUE(ten_hang) là global, 2 tenant khác nhau không thể dùng cùng tên
-- Fix: đổi thành UNIQUE(tenant_id, ten_hang)

-- 1. HangTrong: ten_hang phải unique theo tenant
ALTER TABLE "HangTrong" DROP CONSTRAINT IF EXISTS "hangtrong_ten_hang_key";
ALTER TABLE "HangTrong" DROP CONSTRAINT IF EXISTS "HangTrong_ten_hang_key";
ALTER TABLE "HangTrong" ADD CONSTRAINT "hangtrong_tenant_ten_hang_key" UNIQUE (tenant_id, ten_hang);

-- 2. GongKinh: ten_gong phải unique theo tenant
ALTER TABLE "GongKinh" DROP CONSTRAINT IF EXISTS "gongkinh_ten_gong_key";
ALTER TABLE "GongKinh" DROP CONSTRAINT IF EXISTS "GongKinh_ten_gong_key";
ALTER TABLE "GongKinh" ADD CONSTRAINT "gongkinh_tenant_ten_gong_key" UNIQUE (tenant_id, ten_gong);

-- 3. BenhNhan: mabenhnhan phải unique theo tenant (BN001 rất dễ trùng giữa các phòng khám)
DROP INDEX IF EXISTS "idx_benhnhan_mabenhnhan_unique";
DROP INDEX IF EXISTS "BenhNhan_mabenhnhan_key";
CREATE UNIQUE INDEX "idx_benhnhan_tenant_mabenhnhan_unique"
  ON "BenhNhan" (tenant_id, mabenhnhan)
  WHERE mabenhnhan IS NOT NULL;
