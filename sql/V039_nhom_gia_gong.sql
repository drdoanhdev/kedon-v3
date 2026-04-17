-- ====================================================================
-- V039: Nhóm giá gọng kính + hỗ trợ bán theo nhóm giá
-- Cho phép cửa hàng chọn 1 trong 2 mode:
--   - Quản lý theo mẫu (mặc định, giữ nguyên GongKinh)
--   - Quản lý theo nhóm giá (đơn giản, phù hợp cửa hàng nhỏ)
-- ====================================================================

-- 1. Bảng nhóm giá gọng
CREATE TABLE IF NOT EXISTS nhom_gia_gong (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ten_nhom TEXT NOT NULL,              -- VD: "Gọng 200k-500k", "Gọng cao cấp"
  gia_ban_tu BIGINT DEFAULT 0,         -- Giá bán từ (VND)
  gia_ban_den BIGINT DEFAULT 0,        -- Giá bán đến (VND)
  gia_ban_mac_dinh BIGINT DEFAULT 0,   -- Giá bán mặc định khi chọn nhóm này
  gia_nhap_trung_binh BIGINT DEFAULT 0,-- Giá nhập TB (cập nhật khi nhập kho)
  so_luong_ton INTEGER DEFAULT 0,      -- Tồn kho theo nhóm
  mo_ta TEXT,
  trang_thai TEXT DEFAULT 'active' CHECK (trang_thai IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, ten_nhom)
);

CREATE INDEX IF NOT EXISTS idx_nhom_gia_gong_tenant ON nhom_gia_gong(tenant_id);

-- 2. Thêm nhom_gia_gong_id vào GongKinh (gọng cụ thể thuộc nhóm nào)
ALTER TABLE "GongKinh" ADD COLUMN IF NOT EXISTS nhom_gia_gong_id INTEGER REFERENCES nhom_gia_gong(id);

-- 3. Thêm cột mới vào DonKinh
-- nhom_gia_gong_id: khi bán theo nhóm giá (thay vì chọn gọng cụ thể)
-- gia_von_gong: snapshot giá vốn gọng tại thời điểm bán
ALTER TABLE "DonKinh" ADD COLUMN IF NOT EXISTS nhom_gia_gong_id INTEGER REFERENCES nhom_gia_gong(id);
ALTER TABLE "DonKinh" ADD COLUMN IF NOT EXISTS gia_von_gong BIGINT DEFAULT 0;

-- 4. Lịch sử nhập gọng theo nhóm giá (không cần mẫu cụ thể)
CREATE TABLE IF NOT EXISTS nhom_gia_gong_nhap (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nhom_gia_gong_id INTEGER NOT NULL REFERENCES nhom_gia_gong(id) ON DELETE CASCADE,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  don_gia BIGINT DEFAULT 0,           -- Giá nhập/chiếc
  ghi_chu TEXT,
  ngay_nhap TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nhom_gia_gong_nhap_tenant ON nhom_gia_gong_nhap(tenant_id);

-- 5. Trigger: nhập kho nhóm giá → cập nhật tồn + giá nhập TB
CREATE OR REPLACE FUNCTION update_nhom_gia_on_import()
RETURNS TRIGGER AS $$
DECLARE
  v_old_ton INTEGER;
  v_old_gia BIGINT;
BEGIN
  SELECT so_luong_ton, gia_nhap_trung_binh
  INTO v_old_ton, v_old_gia
  FROM nhom_gia_gong WHERE id = NEW.nhom_gia_gong_id;

  v_old_ton := COALESCE(v_old_ton, 0);
  v_old_gia := COALESCE(v_old_gia, 0);

  -- Bình quân gia quyền
  UPDATE nhom_gia_gong
  SET so_luong_ton = v_old_ton + NEW.so_luong,
      gia_nhap_trung_binh = CASE
        WHEN (v_old_ton + NEW.so_luong) > 0
        THEN ((v_old_gia * v_old_ton) + (NEW.don_gia * NEW.so_luong)) / (v_old_ton + NEW.so_luong)
        ELSE NEW.don_gia
      END,
      updated_at = now()
  WHERE id = NEW.nhom_gia_gong_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_nhom_gia_gong_nhap ON nhom_gia_gong_nhap;
CREATE TRIGGER trg_nhom_gia_gong_nhap
  AFTER INSERT ON nhom_gia_gong_nhap
  FOR EACH ROW EXECUTE FUNCTION update_nhom_gia_on_import();

-- 6. RPC: trừ tồn nhóm giá khi bán
CREATE OR REPLACE FUNCTION adjust_nhom_gia_stock(p_nhom_id INT, p_delta INT)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE nhom_gia_gong
  SET so_luong_ton = COALESCE(so_luong_ton, 0) + p_delta,
      updated_at = now()
  WHERE id = p_nhom_id
  RETURNING so_luong_ton;
$$;

-- 7. RLS
ALTER TABLE nhom_gia_gong ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhom_gia_gong_nhap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nhom_gia_gong_select" ON nhom_gia_gong FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "nhom_gia_gong_insert" ON nhom_gia_gong FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "nhom_gia_gong_update" ON nhom_gia_gong FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "nhom_gia_gong_delete" ON nhom_gia_gong FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

CREATE POLICY "nhom_gia_gong_nhap_select" ON nhom_gia_gong_nhap FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "nhom_gia_gong_nhap_insert" ON nhom_gia_gong_nhap FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
