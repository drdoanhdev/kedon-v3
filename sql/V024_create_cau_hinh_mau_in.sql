-- ============================================
-- CẤU HÌNH MẪU IN (Print Template Config)
-- Mỗi tenant có 1 bản cấu hình duy nhất
-- Đơn kính và đơn thuốc có cài đặt tách bạch
-- ============================================

CREATE TABLE IF NOT EXISTS cau_hinh_mau_in (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Thông tin cửa hàng
  ten_cua_hang TEXT DEFAULT '',
  dia_chi TEXT DEFAULT '',
  dien_thoai TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  -- Toggle hiển thị các trường trên phiếu in ĐƠN KÍNH
  hien_thi_logo BOOLEAN DEFAULT true,
  hien_thi_chan_doan BOOLEAN DEFAULT true,
  hien_thi_sokinh_cu BOOLEAN DEFAULT false,
  hien_thi_thiluc BOOLEAN DEFAULT true,
  hien_thi_pd BOOLEAN DEFAULT true,
  hien_thi_gong BOOLEAN DEFAULT true,
  hien_thi_trong BOOLEAN DEFAULT true,
  hien_thi_gia BOOLEAN DEFAULT false,
  hien_thi_ghi_chu BOOLEAN DEFAULT true,
  -- Ghi chú cuối phiếu đơn kính
  ghi_chu_cuoi TEXT DEFAULT '',
  -- Toggle hiển thị các trường trên phiếu in ĐƠN THUỐC
  hien_thi_logo_thuoc BOOLEAN DEFAULT true,
  hien_thi_chan_doan_thuoc BOOLEAN DEFAULT true,
  hien_thi_gia_thuoc BOOLEAN DEFAULT false,
  hien_thi_ghi_chu_thuoc BOOLEAN DEFAULT true,
  -- Ghi chú cuối phiếu đơn thuốc
  ghi_chu_cuoi_thuoc TEXT DEFAULT '',
  -- Người ký & chữ ký (dùng chung)
  chuc_danh_nguoi_ky TEXT DEFAULT '',
  ho_ten_nguoi_ky TEXT DEFAULT '',
  chu_ky_url TEXT DEFAULT '',
  -- Toggle hiển thị người ký & ngày khám
  hien_thi_nguoi_ky BOOLEAN DEFAULT true,
  hien_thi_nguoi_ky_thuoc BOOLEAN DEFAULT true,
  hien_thi_ngay_kham BOOLEAN DEFAULT true,
  hien_thi_ngay_kham_thuoc BOOLEAN DEFAULT true,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 1 config per tenant
  UNIQUE(tenant_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_cauhinh_mauin_tenant ON cau_hinh_mau_in(tenant_id);

-- RLS
ALTER TABLE cau_hinh_mau_in ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cauhinh_mauin_select" ON cau_hinh_mau_in;
DROP POLICY IF EXISTS "cauhinh_mauin_insert" ON cau_hinh_mau_in;
DROP POLICY IF EXISTS "cauhinh_mauin_update" ON cau_hinh_mau_in;

CREATE POLICY "cauhinh_mauin_select" ON cau_hinh_mau_in FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
);

CREATE POLICY "cauhinh_mauin_insert" ON cau_hinh_mau_in FOR INSERT WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "cauhinh_mauin_update" ON cau_hinh_mau_in FOR UPDATE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true AND role IN ('owner', 'admin')
  )
);
