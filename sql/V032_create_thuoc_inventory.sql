-- ============================================
-- QUẢN LÝ KHO THUỐC - Migration Script
-- ============================================

-- 1. Thêm cột mức tồn tối thiểu vào bảng Thuoc (nếu chưa có)
ALTER TABLE "Thuoc" ADD COLUMN IF NOT EXISTS muc_ton_toi_thieu INTEGER DEFAULT 10;

-- 2. Bảng nhập kho thuốc
CREATE TABLE IF NOT EXISTS thuoc_nhap_kho (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  thuoc_id INTEGER NOT NULL REFERENCES "Thuoc"(id) ON DELETE CASCADE,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  don_gia NUMERIC(12, 0) DEFAULT 0,
  thanh_tien NUMERIC(12, 0) DEFAULT 0,
  nha_cung_cap TEXT,
  so_lo TEXT,
  han_su_dung DATE,
  ghi_chu TEXT,
  nguoi_nhap UUID,
  ngay_nhap TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bảng hủy thuốc (hết hạn, hư hỏng, mất)
CREATE TABLE IF NOT EXISTS thuoc_huy (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  thuoc_id INTEGER NOT NULL REFERENCES "Thuoc"(id) ON DELETE CASCADE,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  ly_do TEXT NOT NULL DEFAULT 'het_han', -- het_han, hu_hong, mat, khac
  ghi_chu TEXT,
  nguoi_huy UUID,
  ngay_huy TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS Policies
ALTER TABLE thuoc_nhap_kho ENABLE ROW LEVEL SECURITY;
ALTER TABLE thuoc_huy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thuoc_nhap_kho_tenant" ON thuoc_nhap_kho
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY "thuoc_huy_tenant" ON thuoc_huy
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- 5. Trigger: Tự động cộng tồn kho khi nhập
CREATE OR REPLACE FUNCTION fn_thuoc_nhap_update_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "Thuoc"
  SET tonkho = COALESCE(tonkho, 0) + NEW.so_luong
  WHERE id = NEW.thuoc_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_thuoc_nhap_update_stock ON thuoc_nhap_kho;
CREATE TRIGGER trg_thuoc_nhap_update_stock
  AFTER INSERT ON thuoc_nhap_kho
  FOR EACH ROW EXECUTE FUNCTION fn_thuoc_nhap_update_stock();

-- 6. Trigger: Tự động trừ tồn kho khi hủy
CREATE OR REPLACE FUNCTION fn_thuoc_huy_update_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "Thuoc"
  SET tonkho = GREATEST(COALESCE(tonkho, 0) - NEW.so_luong, 0)
  WHERE id = NEW.thuoc_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_thuoc_huy_update_stock ON thuoc_huy;
CREATE TRIGGER trg_thuoc_huy_update_stock
  AFTER INSERT ON thuoc_huy
  FOR EACH ROW EXECUTE FUNCTION fn_thuoc_huy_update_stock();

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_thuoc_nhap_kho_tenant ON thuoc_nhap_kho(tenant_id);
CREATE INDEX IF NOT EXISTS idx_thuoc_nhap_kho_thuoc ON thuoc_nhap_kho(thuoc_id);
CREATE INDEX IF NOT EXISTS idx_thuoc_nhap_kho_ngay ON thuoc_nhap_kho(ngay_nhap);
CREATE INDEX IF NOT EXISTS idx_thuoc_huy_tenant ON thuoc_huy(tenant_id);
CREATE INDEX IF NOT EXISTS idx_thuoc_huy_thuoc ON thuoc_huy(thuoc_id);
CREATE INDEX IF NOT EXISTS idx_thuoc_huy_ngay ON thuoc_huy(ngay_huy);
