-- ============================================
-- BẢNG XUẤT KHO THUỐC THEO ĐƠN THUỐC
-- Ghi nhận mỗi lần kê đơn thuốc → trừ tồn kho
-- Tương tự lens_export_sale cho tròng kính
-- ============================================

-- 1. Bảng xuất kho thuốc theo đơn
CREATE TABLE IF NOT EXISTS thuoc_xuat_don (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  don_thuoc_id INTEGER NOT NULL REFERENCES "DonThuoc"(id) ON DELETE CASCADE,
  thuoc_id INTEGER NOT NULL REFERENCES "Thuoc"(id) ON DELETE CASCADE,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_thuoc_xuat_don_tenant ON thuoc_xuat_don(tenant_id);
CREATE INDEX IF NOT EXISTS idx_thuoc_xuat_don_don ON thuoc_xuat_don(don_thuoc_id);
CREATE INDEX IF NOT EXISTS idx_thuoc_xuat_don_thuoc ON thuoc_xuat_don(thuoc_id);

-- 3. RLS
ALTER TABLE thuoc_xuat_don ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thuoc_xuat_don_select" ON thuoc_xuat_don FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "thuoc_xuat_don_insert" ON thuoc_xuat_don FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "thuoc_xuat_don_delete" ON thuoc_xuat_don FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 4. Trigger: Tự động trừ tồn kho khi xuất thuốc theo đơn
CREATE OR REPLACE FUNCTION fn_thuoc_xuat_don_update_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "Thuoc"
  SET tonkho = COALESCE(tonkho, 0) - NEW.so_luong
  WHERE id = NEW.thuoc_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_thuoc_xuat_don_update_stock ON thuoc_xuat_don;
CREATE TRIGGER trg_thuoc_xuat_don_update_stock
  AFTER INSERT ON thuoc_xuat_don
  FOR EACH ROW EXECUTE FUNCTION fn_thuoc_xuat_don_update_stock();
