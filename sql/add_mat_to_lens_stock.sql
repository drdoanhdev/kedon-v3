-- Thêm cột mat (mắt trái/phải) cho lens_stock
-- Kính đa tròng cần phân biệt mắt trái (L) và mắt phải (R)
-- Kính đơn tròng mat = NULL (không cần phân biệt)

ALTER TABLE lens_stock ADD COLUMN IF NOT EXISTS mat TEXT CHECK (mat IN ('trai', 'phai'));

-- Xóa unique constraint cũ và tạo mới có mat
ALTER TABLE lens_stock DROP CONSTRAINT IF EXISTS lens_stock_tenant_id_hang_trong_id_sph_cyl_add_power_key;

-- Unique mới: cùng hãng + độ + mắt = 1 dòng
CREATE UNIQUE INDEX IF NOT EXISTS lens_stock_unique_combo
  ON lens_stock(tenant_id, hang_trong_id, sph, cyl, COALESCE(add_power, -999), COALESCE(mat, ''));
