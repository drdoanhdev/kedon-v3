-- ============================================
-- HỆ THỐNG QUẢN LÝ XUẤT NHẬP TỒN
-- Thuốc, Vật tư, Gọng kính, Tròng kính, Nhà cung cấp
-- ============================================
-- Thiết kế theo pattern multi-tenant (tenant_id)
-- Tương thích với bảng hiện có: Thuoc, GongKinh, HangTrong, NhaCungCap
-- ============================================

-- ====================================================================
-- PHẦN 1: MỞ RỘNG BẢNG NHÀ CUNG CẤP (NhaCungCap)
-- ====================================================================
-- Bảng NhaCungCap đã tồn tại, thêm trường liên kết loại hàng
ALTER TABLE "NhaCungCap" ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE "NhaCungCap" ADD COLUMN IF NOT EXISTS ma_so_thue TEXT;
ALTER TABLE "NhaCungCap" ADD COLUMN IF NOT EXISTS nguoi_lien_he TEXT;
ALTER TABLE "NhaCungCap" ADD COLUMN IF NOT EXISTS loai_hang TEXT[] DEFAULT '{}';
  -- loai_hang: ['thuoc', 'vat_tu', 'gong_kinh', 'trong_kinh']
ALTER TABLE "NhaCungCap" ADD COLUMN IF NOT EXISTS trang_thai TEXT DEFAULT 'active'
  CHECK (trang_thai IN ('active', 'inactive'));

-- ====================================================================
-- PHẦN 2: DANH MỤC TRÒNG KÍNH (lens_catalog)
-- Mở rộng từ HangTrong, thêm kiểu quản lý tồn kho
-- ====================================================================
-- Giữ nguyên bảng HangTrong hiện tại, thêm các trường mới
ALTER TABLE "HangTrong" ADD COLUMN IF NOT EXISTS loai_trong TEXT DEFAULT 'don_trong'
  CHECK (loai_trong IN ('don_trong', 'loan', 'da_trong'));
ALTER TABLE "HangTrong" ADD COLUMN IF NOT EXISTS kieu_quan_ly TEXT DEFAULT 'SAN_KHO'
  CHECK (kieu_quan_ly IN ('SAN_KHO', 'DAT_KHI_CO_KHACH'));
ALTER TABLE "HangTrong" ADD COLUMN IF NOT EXISTS nha_cung_cap_id INTEGER REFERENCES "NhaCungCap"(id);

-- ====================================================================
-- PHẦN 3: KHO TRÒNG KÍNH THEO ĐỘ (lens_stock)
-- Mỗi dòng = 1 tổ hợp (loại tròng, SPH, CYL, ADD)
-- ====================================================================
CREATE TABLE IF NOT EXISTS lens_stock (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  hang_trong_id INTEGER NOT NULL REFERENCES "HangTrong"(id) ON DELETE CASCADE,
  sph DECIMAL(6,2) NOT NULL,         -- Độ cầu: -20.00 đến +20.00
  cyl DECIMAL(6,2) NOT NULL DEFAULT 0, -- Độ loạn: 0 nếu không loạn
  add_power DECIMAL(6,2),            -- Độ cộng: NULL nếu không đa tròng
  ton_dau_ky INTEGER NOT NULL DEFAULT 0,
  ton_hien_tai INTEGER NOT NULL DEFAULT 0,
  muc_ton_toi_thieu INTEGER NOT NULL DEFAULT 2,
  muc_nhap_goi_y INTEGER NOT NULL DEFAULT 10,
  trang_thai_ton TEXT GENERATED ALWAYS AS (
    CASE
      WHEN ton_hien_tai <= 0 THEN 'HET'
      WHEN ton_hien_tai <= muc_ton_toi_thieu THEN 'SAP_HET'
      ELSE 'DU'
    END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, hang_trong_id, sph, cyl, add_power)
);

CREATE INDEX IF NOT EXISTS idx_lens_stock_tenant ON lens_stock(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lens_stock_hang_trong ON lens_stock(hang_trong_id);
CREATE INDEX IF NOT EXISTS idx_lens_stock_trang_thai ON lens_stock(trang_thai_ton) WHERE trang_thai_ton IN ('HET', 'SAP_HET');

-- ====================================================================
-- PHẦN 4: NHẬP KHO TRÒNG KÍNH (lens_import)
-- ====================================================================
CREATE TABLE IF NOT EXISTS lens_import (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lens_stock_id INTEGER NOT NULL REFERENCES lens_stock(id) ON DELETE CASCADE,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  don_gia BIGINT DEFAULT 0,          -- Giá nhập/miếng (VND)
  nha_cung_cap_id INTEGER REFERENCES "NhaCungCap"(id),
  ghi_chu TEXT,
  ngay_nhap TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_import_tenant ON lens_import(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lens_import_stock ON lens_import(lens_stock_id);

-- ====================================================================
-- PHẦN 5: XUẤT BÁN TRÒNG KÍNH (lens_export_sale)
-- Gắn với đơn kính, chỉ áp dụng cho tròng SAN_KHO
-- ====================================================================
CREATE TABLE IF NOT EXISTS lens_export_sale (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lens_stock_id INTEGER NOT NULL REFERENCES lens_stock(id) ON DELETE CASCADE,
  don_kinh_id INTEGER REFERENCES "DonKinh"(id) ON DELETE SET NULL,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  mat TEXT CHECK (mat IN ('trai', 'phai')),
  ngay_xuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_export_sale_tenant ON lens_export_sale(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lens_export_sale_stock ON lens_export_sale(lens_stock_id);

-- ====================================================================
-- PHẦN 6: XUẤT HỎNG TRÒNG KÍNH (lens_export_damaged)
-- Cắt vỡ, lỗi kỹ thuật, hỏng
-- ====================================================================
CREATE TABLE IF NOT EXISTS lens_export_damaged (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lens_stock_id INTEGER NOT NULL REFERENCES lens_stock(id) ON DELETE CASCADE,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  ly_do TEXT NOT NULL,                -- 'cat_vo', 'loi_gia_cong', 'hong_khac'
  ghi_chu TEXT,
  ngay_hong TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_export_damaged_tenant ON lens_export_damaged(tenant_id);

-- ====================================================================
-- PHẦN 7: TRÒNG CẦN ĐẶT (lens_order)
-- Tự động tạo khi kê đơn kính cho tròng DAT_KHI_CO_KHACH
-- ====================================================================
CREATE TABLE IF NOT EXISTS lens_order (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  don_kinh_id INTEGER NOT NULL REFERENCES "DonKinh"(id) ON DELETE CASCADE,
  hang_trong_id INTEGER NOT NULL REFERENCES "HangTrong"(id),
  so_luong_mieng INTEGER NOT NULL DEFAULT 1,
  sph DECIMAL(6,2) NOT NULL,
  cyl DECIMAL(6,2) NOT NULL DEFAULT 0,
  add_power DECIMAL(6,2),
  mat TEXT CHECK (mat IN ('trai', 'phai')),
  nha_cung_cap_id INTEGER REFERENCES "NhaCungCap"(id),
  trang_thai TEXT NOT NULL DEFAULT 'cho_dat'
    CHECK (trang_thai IN ('cho_dat', 'da_dat', 'da_nhan', 'huy')),
  ngay_dat TIMESTAMPTZ,              -- Ngày đặt cho NCC
  ngay_nhan TIMESTAMPTZ,             -- Ngày nhận tròng
  ghi_chu TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_order_tenant ON lens_order(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lens_order_don_kinh ON lens_order(don_kinh_id);
CREATE INDEX IF NOT EXISTS idx_lens_order_trang_thai ON lens_order(trang_thai) WHERE trang_thai IN ('cho_dat', 'da_dat');

-- ====================================================================
-- PHẦN 8: MỞ RỘNG GỌNG KÍNH (GongKinh) - QUẢN LÝ TỒN KHO
-- ====================================================================
ALTER TABLE "GongKinh" ADD COLUMN IF NOT EXISTS ma_gong TEXT;
ALTER TABLE "GongKinh" ADD COLUMN IF NOT EXISTS mau_sac TEXT;
ALTER TABLE "GongKinh" ADD COLUMN IF NOT EXISTS kich_co TEXT;          -- VD: '52-18-140'
ALTER TABLE "GongKinh" ADD COLUMN IF NOT EXISTS nha_cung_cap_id INTEGER REFERENCES "NhaCungCap"(id);
ALTER TABLE "GongKinh" ADD COLUMN IF NOT EXISTS ton_kho INTEGER DEFAULT 0;
ALTER TABLE "GongKinh" ADD COLUMN IF NOT EXISTS muc_ton_toi_thieu INTEGER DEFAULT 2;

-- ====================================================================
-- PHẦN 9: LỊCH SỬ NHẬP GỌNG KÍNH (frame_import)
-- ====================================================================
CREATE TABLE IF NOT EXISTS frame_import (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  gong_kinh_id INTEGER NOT NULL REFERENCES "GongKinh"(id) ON DELETE CASCADE,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  don_gia BIGINT DEFAULT 0,
  nha_cung_cap_id INTEGER REFERENCES "NhaCungCap"(id),
  ghi_chu TEXT,
  ngay_nhap TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frame_import_tenant ON frame_import(tenant_id);

-- ====================================================================
-- PHẦN 10: XUẤT GỌNG KÍNH (frame_export)
-- Gắn với đơn kính
-- ====================================================================
CREATE TABLE IF NOT EXISTS frame_export (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  gong_kinh_id INTEGER NOT NULL REFERENCES "GongKinh"(id) ON DELETE CASCADE,
  don_kinh_id INTEGER REFERENCES "DonKinh"(id) ON DELETE SET NULL,
  so_luong INTEGER NOT NULL DEFAULT 1 CHECK (so_luong > 0),
  ngay_xuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frame_export_tenant ON frame_export(tenant_id);

-- ====================================================================
-- PHẦN 11: MỞ RỘNG THUỐC (Thuoc) - LIÊN KẾT NHÀ CUNG CẤP
-- Bảng Thuoc đã có trường tonkho, gianhap, giaban
-- ====================================================================
ALTER TABLE "Thuoc" ADD COLUMN IF NOT EXISTS nha_cung_cap_id INTEGER REFERENCES "NhaCungCap"(id);
ALTER TABLE "Thuoc" ADD COLUMN IF NOT EXISTS muc_ton_toi_thieu INTEGER DEFAULT 10;

-- ====================================================================
-- PHẦN 12: DANH MỤC VẬT TƯ (medical_supply)
-- Vật tư y tế: băng gạc, kim tiêm, thuốc nhỏ mắt mẫu, v.v.
-- ====================================================================
CREATE TABLE IF NOT EXISTS medical_supply (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ma_vat_tu TEXT,
  ten_vat_tu TEXT NOT NULL,
  don_vi_tinh TEXT DEFAULT 'cái',     -- cái, hộp, gói, ống
  gia_nhap BIGINT DEFAULT 0,
  gia_ban BIGINT DEFAULT 0,
  ton_kho INTEGER NOT NULL DEFAULT 0,
  muc_ton_toi_thieu INTEGER DEFAULT 5,
  nha_cung_cap_id INTEGER REFERENCES "NhaCungCap"(id),
  mo_ta TEXT,
  trang_thai TEXT DEFAULT 'active' CHECK (trang_thai IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_supply_tenant ON medical_supply(tenant_id);

-- ====================================================================
-- PHẦN 13: NHẬP KHO VẬT TƯ (supply_import)
-- ====================================================================
CREATE TABLE IF NOT EXISTS supply_import (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  medical_supply_id INTEGER NOT NULL REFERENCES medical_supply(id) ON DELETE CASCADE,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  don_gia BIGINT DEFAULT 0,
  nha_cung_cap_id INTEGER REFERENCES "NhaCungCap"(id),
  ghi_chu TEXT,
  ngay_nhap TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_import_tenant ON supply_import(tenant_id);

-- ====================================================================
-- PHẦN 14: XUẤT VẬT TƯ (supply_export)
-- ====================================================================
CREATE TABLE IF NOT EXISTS supply_export (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  medical_supply_id INTEGER NOT NULL REFERENCES medical_supply(id) ON DELETE CASCADE,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  ly_do TEXT DEFAULT 'su_dung',       -- su_dung, hong, het_han
  ghi_chu TEXT,
  ngay_xuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_export_tenant ON supply_export(tenant_id);

-- ====================================================================
-- PHẦN 15: PHIẾU NHẬP KHO TỔNG HỢP (import_receipt)
-- 1 phiếu nhập có thể chứa nhiều loại hàng (thuốc, tròng, gọng, vật tư)
-- ====================================================================
CREATE TABLE IF NOT EXISTS import_receipt (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ma_phieu TEXT,                      -- Mã phiếu nhập: PN-20260311-001
  nha_cung_cap_id INTEGER REFERENCES "NhaCungCap"(id),
  tong_tien BIGINT DEFAULT 0,
  ghi_chu TEXT,
  ngay_nhap TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_receipt_tenant ON import_receipt(tenant_id);

-- Chi tiết phiếu nhập:
CREATE TABLE IF NOT EXISTS import_receipt_detail (
  id SERIAL PRIMARY KEY,
  import_receipt_id INTEGER NOT NULL REFERENCES import_receipt(id) ON DELETE CASCADE,
  loai_hang TEXT NOT NULL CHECK (loai_hang IN ('thuoc', 'trong_kinh', 'gong_kinh', 'vat_tu')),
  -- Liên kết tùy loại hàng (chỉ 1 trong 4 có giá trị)
  thuoc_id INTEGER REFERENCES "Thuoc"(id),
  lens_stock_id INTEGER REFERENCES lens_stock(id),
  gong_kinh_id INTEGER REFERENCES "GongKinh"(id),
  medical_supply_id INTEGER REFERENCES medical_supply(id),
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  don_gia BIGINT DEFAULT 0,
  thanh_tien BIGINT GENERATED ALWAYS AS (so_luong * don_gia) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_receipt_detail_receipt ON import_receipt_detail(import_receipt_id);

-- ====================================================================
-- PHẦN 16: RLS POLICIES
-- ====================================================================
ALTER TABLE lens_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_export_sale ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_export_damaged ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE frame_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE frame_export ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_export ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_receipt_detail ENABLE ROW LEVEL SECURITY;

-- SELECT policies (tất cả member trong tenant đều xem được)
CREATE POLICY "lens_stock_select" ON lens_stock FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_import_select" ON lens_import FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_export_sale_select" ON lens_export_sale FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_export_damaged_select" ON lens_export_damaged FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_order_select" ON lens_order FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "frame_import_select" ON frame_import FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "frame_export_select" ON frame_export FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "medical_supply_select" ON medical_supply FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "supply_import_select" ON supply_import FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "supply_export_select" ON supply_export FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "import_receipt_select" ON import_receipt FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "import_receipt_detail_select" ON import_receipt_detail FOR SELECT USING (
  import_receipt_id IN (SELECT id FROM import_receipt WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
);

-- INSERT policies
CREATE POLICY "lens_stock_insert" ON lens_stock FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_import_insert" ON lens_import FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_export_sale_insert" ON lens_export_sale FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_export_damaged_insert" ON lens_export_damaged FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_order_insert" ON lens_order FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "frame_import_insert" ON frame_import FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "frame_export_insert" ON frame_export FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "medical_supply_insert" ON medical_supply FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "supply_import_insert" ON supply_import FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "supply_export_insert" ON supply_export FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "import_receipt_insert" ON import_receipt FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- UPDATE policies (owner/admin)
CREATE POLICY "lens_stock_update" ON lens_stock FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_order_update" ON lens_order FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "medical_supply_update" ON medical_supply FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- DELETE policies
CREATE POLICY "lens_stock_delete" ON lens_stock FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "lens_order_delete" ON lens_order FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "medical_supply_delete" ON medical_supply FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- ====================================================================
-- PHẦN 17: TRIGGER CẬP NHẬT TỒN KHO TỰ ĐỘNG
-- ====================================================================

-- Trigger: Khi nhập kho tròng → cập nhật tồn kho
CREATE OR REPLACE FUNCTION update_lens_stock_on_import()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lens_stock
  SET ton_hien_tai = ton_hien_tai + NEW.so_luong,
      updated_at = now()
  WHERE id = NEW.lens_stock_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lens_import_update_stock ON lens_import;
CREATE TRIGGER trg_lens_import_update_stock
  AFTER INSERT ON lens_import
  FOR EACH ROW EXECUTE FUNCTION update_lens_stock_on_import();

-- Trigger: Khi xuất bán tròng → trừ tồn kho
CREATE OR REPLACE FUNCTION update_lens_stock_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lens_stock
  SET ton_hien_tai = ton_hien_tai - NEW.so_luong,
      updated_at = now()
  WHERE id = NEW.lens_stock_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lens_sale_update_stock ON lens_export_sale;
CREATE TRIGGER trg_lens_sale_update_stock
  AFTER INSERT ON lens_export_sale
  FOR EACH ROW EXECUTE FUNCTION update_lens_stock_on_sale();

-- Trigger: Khi xuất hỏng tròng → trừ tồn kho
CREATE OR REPLACE FUNCTION update_lens_stock_on_damaged()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lens_stock
  SET ton_hien_tai = ton_hien_tai - NEW.so_luong,
      updated_at = now()
  WHERE id = NEW.lens_stock_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lens_damaged_update_stock ON lens_export_damaged;
CREATE TRIGGER trg_lens_damaged_update_stock
  AFTER INSERT ON lens_export_damaged
  FOR EACH ROW EXECUTE FUNCTION update_lens_stock_on_damaged();

-- Trigger: Khi nhập kho gọng → cập nhật tồn kho
CREATE OR REPLACE FUNCTION update_frame_stock_on_import()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "GongKinh"
  SET ton_kho = COALESCE(ton_kho, 0) + NEW.so_luong
  WHERE id = NEW.gong_kinh_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_frame_import_update_stock ON frame_import;
CREATE TRIGGER trg_frame_import_update_stock
  AFTER INSERT ON frame_import
  FOR EACH ROW EXECUTE FUNCTION update_frame_stock_on_import();

-- Trigger: Khi xuất gọng → trừ tồn kho
CREATE OR REPLACE FUNCTION update_frame_stock_on_export()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "GongKinh"
  SET ton_kho = COALESCE(ton_kho, 0) - NEW.so_luong
  WHERE id = NEW.gong_kinh_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_frame_export_update_stock ON frame_export;
CREATE TRIGGER trg_frame_export_update_stock
  AFTER INSERT ON frame_export
  FOR EACH ROW EXECUTE FUNCTION update_frame_stock_on_export();

-- Trigger: Khi nhập kho vật tư → cập nhật tồn kho
CREATE OR REPLACE FUNCTION update_supply_stock_on_import()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE medical_supply
  SET ton_kho = ton_kho + NEW.so_luong,
      updated_at = now()
  WHERE id = NEW.medical_supply_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_supply_import_update_stock ON supply_import;
CREATE TRIGGER trg_supply_import_update_stock
  AFTER INSERT ON supply_import
  FOR EACH ROW EXECUTE FUNCTION update_supply_stock_on_import();

-- Trigger: Khi xuất vật tư → trừ tồn kho
CREATE OR REPLACE FUNCTION update_supply_stock_on_export()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE medical_supply
  SET ton_kho = ton_kho - NEW.so_luong,
      updated_at = now()
  WHERE id = NEW.medical_supply_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_supply_export_update_stock ON supply_export;
CREATE TRIGGER trg_supply_export_update_stock
  AFTER INSERT ON supply_export
  FOR EACH ROW EXECUTE FUNCTION update_supply_stock_on_export();

-- ====================================================================
-- PHẦN 18: VIEW BÁO CÁO TỒN KHO
-- ====================================================================

-- View tổng hợp tồn kho tròng kính
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
  ls.muc_ton_toi_thieu,
  ls.muc_nhap_goi_y,
  ls.trang_thai_ton,
  CASE
    WHEN ls.ton_hien_tai <= ls.muc_ton_toi_thieu
    THEN GREATEST(ls.muc_nhap_goi_y - ls.ton_hien_tai, 0)
    ELSE 0
  END AS can_nhap_them
FROM lens_stock ls
JOIN "HangTrong" ht ON ht.id = ls.hang_trong_id
WHERE ht.kieu_quan_ly = 'SAN_KHO';

-- View tổng hợp tròng cần đặt
CREATE OR REPLACE VIEW v_lens_order_summary AS
SELECT
  lo.tenant_id,
  ht.ten_hang,
  lo.sph,
  lo.cyl,
  lo.add_power,
  lo.mat,
  lo.trang_thai,
  COUNT(*) AS so_don,
  SUM(lo.so_luong_mieng) AS tong_mieng
FROM lens_order lo
JOIN "HangTrong" ht ON ht.id = lo.hang_trong_id
WHERE lo.trang_thai IN ('cho_dat', 'da_dat')
GROUP BY lo.tenant_id, ht.ten_hang, lo.sph, lo.cyl, lo.add_power, lo.mat, lo.trang_thai;

-- View cảnh báo tồn kho thấp (tất cả loại hàng)
CREATE OR REPLACE VIEW v_low_stock_alerts AS
-- Tròng kính sắp hết
SELECT
  ls.tenant_id,
  'trong_kinh' AS loai_hang,
  ht.ten_hang AS ten,
  CONCAT(ls.sph, '/', ls.cyl, CASE WHEN ls.add_power IS NOT NULL THEN CONCAT(' ADD:', ls.add_power) ELSE '' END) AS chi_tiet,
  ls.ton_hien_tai AS ton_kho,
  ls.muc_ton_toi_thieu
FROM lens_stock ls
JOIN "HangTrong" ht ON ht.id = ls.hang_trong_id
WHERE ls.ton_hien_tai <= ls.muc_ton_toi_thieu AND ht.kieu_quan_ly = 'SAN_KHO'

UNION ALL

-- Gọng kính sắp hết
SELECT
  gk.tenant_id,
  'gong_kinh',
  gk.ten_gong,
  COALESCE(gk.mau_sac, ''),
  COALESCE(gk.ton_kho, 0),
  COALESCE(gk.muc_ton_toi_thieu, 2)
FROM "GongKinh" gk
WHERE COALESCE(gk.ton_kho, 0) <= COALESCE(gk.muc_ton_toi_thieu, 2)

UNION ALL

-- Thuốc sắp hết
SELECT
  t.tenant_id,
  'thuoc',
  t.tenthuoc,
  COALESCE(t.donvitinh, ''),
  COALESCE(t.tonkho, 0),
  COALESCE(t.muc_ton_toi_thieu, 10)
FROM "Thuoc" t
WHERE COALESCE(t.tonkho, 0) <= COALESCE(t.muc_ton_toi_thieu, 10)

UNION ALL

-- Vật tư sắp hết
SELECT
  ms.tenant_id,
  'vat_tu',
  ms.ten_vat_tu,
  COALESCE(ms.don_vi_tinh, ''),
  ms.ton_kho,
  ms.muc_ton_toi_thieu
FROM medical_supply ms
WHERE ms.ton_kho <= ms.muc_ton_toi_thieu AND ms.trang_thai = 'active';
