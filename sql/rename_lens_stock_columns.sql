-- Migration: Đổi tên cột muc_ton_toi_thieu → muc_ton_can_co trên tất cả các bảng
-- Đổi tên muc_nhap_goi_y → muc_ton_can_co trên lens_stock
-- Xóa cột muc_ton_toi_thieu trên lens_stock (đã gộp vào muc_ton_can_co)

-- ==========================================
-- 0. DROP CÁC VIEW PHỤ THUỘC
-- ==========================================
DROP VIEW IF EXISTS v_low_stock_alerts;
DROP VIEW IF EXISTS v_lens_stock_summary;

-- ==========================================
-- 1. BẢNG lens_stock
-- ==========================================
-- Drop generated column trang_thai_ton (phụ thuộc muc_ton_toi_thieu)
ALTER TABLE lens_stock DROP COLUMN IF EXISTS trang_thai_ton;

-- Drop cột muc_ton_toi_thieu
ALTER TABLE lens_stock DROP COLUMN IF EXISTS muc_ton_toi_thieu;

-- Đổi tên muc_nhap_goi_y → muc_ton_can_co
ALTER TABLE lens_stock RENAME COLUMN muc_nhap_goi_y TO muc_ton_can_co;

-- Tạo lại generated column trang_thai_ton dùng muc_ton_can_co
ALTER TABLE lens_stock ADD COLUMN trang_thai_ton TEXT GENERATED ALWAYS AS (
  CASE
    WHEN ton_hien_tai <= 0 THEN 'HET'
    WHEN ton_hien_tai < muc_ton_can_co THEN 'SAP_HET'
    ELSE 'DU'
  END
) STORED;

-- ==========================================
-- 2. BẢNG GongKinh
-- ==========================================
ALTER TABLE "GongKinh" RENAME COLUMN muc_ton_toi_thieu TO muc_ton_can_co;

-- ==========================================
-- 3. BẢNG Thuoc
-- ==========================================
ALTER TABLE "Thuoc" RENAME COLUMN muc_ton_toi_thieu TO muc_ton_can_co;

-- ==========================================
-- 4. BẢNG medical_supply
-- ==========================================
ALTER TABLE medical_supply RENAME COLUMN muc_ton_toi_thieu TO muc_ton_can_co;

-- ==========================================
-- 5. TẠO LẠI CÁC VIEW
-- ==========================================
CREATE OR REPLACE VIEW v_lens_stock_summary AS
SELECT
  ls.tenant_id,
  ls.id AS lens_stock_id,
  ht.ten_hang,
  ht.loai_trong,
  ht.kieu_quan_ly,
  ls.sph,
  ls.cyl,
  ls.add_power,
  ls.ton_hien_tai,
  ls.muc_ton_can_co,
  ls.trang_thai_ton,
  CASE
    WHEN ls.ton_hien_tai <= ls.muc_ton_can_co
    THEN GREATEST(ls.muc_ton_can_co - ls.ton_hien_tai, 0)
    ELSE 0
  END AS can_nhap_them
FROM lens_stock ls
JOIN "HangTrong" ht ON ht.id = ls.hang_trong_id
WHERE ht.kieu_quan_ly = 'SAN_KHO';

CREATE OR REPLACE VIEW v_low_stock_alerts AS
-- Tròng kính sắp hết
SELECT
  ls.tenant_id,
  'trong_kinh' AS loai_hang,
  ht.ten_hang AS ten,
  CONCAT(ls.sph, '/', ls.cyl, CASE WHEN ls.add_power IS NOT NULL THEN CONCAT(' ADD:', ls.add_power) ELSE '' END) AS chi_tiet,
  ls.ton_hien_tai AS ton_kho,
  ls.muc_ton_can_co
FROM lens_stock ls
JOIN "HangTrong" ht ON ht.id = ls.hang_trong_id
WHERE ls.ton_hien_tai <= ls.muc_ton_can_co AND ht.kieu_quan_ly = 'SAN_KHO'

UNION ALL

-- Gọng kính sắp hết
SELECT
  gk.tenant_id,
  'gong_kinh' AS loai_hang,
  gk.ten_gong AS ten,
  gk.mau_sac AS chi_tiet,
  COALESCE(gk.ton_kho, 0) AS ton_kho,
  COALESCE(gk.muc_ton_can_co, 2)
FROM "GongKinh" gk
WHERE COALESCE(gk.ton_kho, 0) <= COALESCE(gk.muc_ton_can_co, 2)
  AND (gk.trang_thai IS NULL OR gk.trang_thai = true)

UNION ALL

-- Thuốc sắp hết
SELECT
  t.tenant_id,
  'thuoc' AS loai_hang,
  t.tenthuoc AS ten,
  t.donvitinh AS chi_tiet,
  COALESCE(t.tonkho, 0) AS ton_kho,
  COALESCE(t.muc_ton_can_co, 10)
FROM "Thuoc" t
WHERE COALESCE(t.tonkho, 0) <= COALESCE(t.muc_ton_can_co, 10)

UNION ALL

-- Vật tư y tế sắp hết
SELECT
  ms.tenant_id,
  'vat_tu' AS loai_hang,
  ms.ten_vat_tu AS ten,
  ms.don_vi_tinh AS chi_tiet,
  ms.ton_kho,
  ms.muc_ton_can_co
FROM medical_supply ms
WHERE ms.ton_kho <= ms.muc_ton_can_co AND ms.trang_thai = 'active';
