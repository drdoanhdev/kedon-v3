-- ============================================
-- MULTI-TENANT SAAS MIGRATION
-- Hệ thống phân quyền: Chủ phòng khám (owner) & Nhân viên (staff/doctor)
-- ============================================
-- LƯU Ý: service_role key mặc định BYPASS RLS trong Supabase.
-- API routes dùng service_role + filter tenant_id trong code (defense in depth).
-- RLS policies dưới đây bảo vệ khi client dùng anon key hoặc truy cập trực tiếp.
-- ============================================

-- ========== PHẦN 1: BẢNG QUẢN TRỊ ==========

-- 1. Tạo bảng tenants (phòng khám)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE, -- mã phòng khám duy nhất, vd: PK001
  phone TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  owner_id UUID REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tạo bảng tenantmembership (thành viên phòng khám)
CREATE TABLE IF NOT EXISTS tenantmembership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'doctor', 'staff')),
  active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES auth.users(id),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- Index cho lookup nhanh theo user_id (dùng trong mọi RLS policy)
CREATE INDEX IF NOT EXISTS idx_tenantmembership_user_active
  ON tenantmembership(user_id) WHERE active = true;

-- 3. Tạo bảng user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  default_tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tạo bảng user_roles (nếu chưa có) - Global role cho superadmin
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'doctor', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 5. Tạo bảng tenant_invitations (lời mời tham gia phòng khám)
CREATE TABLE IF NOT EXISTS tenant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'doctor', 'staff')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email, status)
);

-- ========== PHẦN 2: HELPER FUNCTIONS (tạo TRƯỚC khi dùng trong policies) ==========

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenantmembership_updated_at ON tenantmembership;
CREATE TRIGGER update_tenantmembership_updated_at BEFORE UPDATE ON tenantmembership
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Helper: lấy danh sách tenant_ids mà user thuộc về
-- SECURITY DEFINER = chạy với quyền DB owner → tránh recursive RLS trên tenantmembership
CREATE OR REPLACE FUNCTION get_user_tenant_ids(p_user_id UUID)
RETURNS SETOF UUID AS $$
  SELECT tenant_id FROM tenantmembership
  WHERE user_id = p_user_id AND active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: kiểm tra user có quyền owner/admin trong tenant
CREATE OR REPLACE FUNCTION is_tenant_owner(p_user_id UUID, p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM tenantmembership
    WHERE user_id = p_user_id
      AND tenant_id = p_tenant_id
      AND role IN ('owner', 'admin')
      AND active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: kiểm tra user có thuộc tenant (bất kỳ role)
CREATE OR REPLACE FUNCTION is_tenant_member(p_user_id UUID, p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM tenantmembership
    WHERE user_id = p_user_id
      AND tenant_id = p_tenant_id
      AND active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ========== PHẦN 3: THÊM CỘT tenant_id VÀO BẢNG BUSINESS ==========

-- BenhNhan
ALTER TABLE "BenhNhan" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_benhnhan_tenant ON "BenhNhan"(tenant_id);

-- DonThuoc
ALTER TABLE "DonThuoc" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_donthuoc_tenant ON "DonThuoc"(tenant_id);

-- DonKinh
ALTER TABLE "DonKinh" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_donkinh_tenant ON "DonKinh"(tenant_id);

-- Thuoc
ALTER TABLE "Thuoc" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_thuoc_tenant ON "Thuoc"(tenant_id);

-- NhomThuoc
ALTER TABLE "NhomThuoc" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_nhomthuoc_tenant ON "NhomThuoc"(tenant_id);

-- ChoKham
ALTER TABLE "ChoKham" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_chokham_tenant ON "ChoKham"(tenant_id);

-- DienTien
ALTER TABLE "DienTien" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_dientien_tenant ON "DienTien"(tenant_id);

-- DonThuocMau
ALTER TABLE "DonThuocMau" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_donthuocmau_tenant ON "DonThuocMau"(tenant_id);

-- GongKinh
ALTER TABLE "GongKinh" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_gongkinh_tenant ON "GongKinh"(tenant_id);

-- HangTrong
ALTER TABLE "HangTrong" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hangtrong_tenant ON "HangTrong"(tenant_id);

-- PhieuNhapKho
ALTER TABLE "PhieuNhapKho" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_phieunhapkho_tenant ON "PhieuNhapKho"(tenant_id);

-- NhaCungCap
ALTER TABLE "NhaCungCap" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_nhacungcap_tenant ON "NhaCungCap"(tenant_id);

-- ========== PHẦN 4: BẬT RLS TRÊN TẤT CẢ CÁC BẢNG ==========

-- 4a. Bảng quản trị
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenantmembership ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

-- 4b. Bảng business chính (12 bảng có tenant_id)
ALTER TABLE "BenhNhan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DonThuoc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DonKinh" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Thuoc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NhomThuoc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChoKham" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DienTien" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DonThuocMau" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GongKinh" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HangTrong" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhieuNhapKho" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NhaCungCap" ENABLE ROW LEVEL SECURITY;

-- 4c. Bảng con (liên kết qua FK, không có tenant_id trực tiếp)
-- Bọc trong DO block vì bảng có thể chưa tồn tại
DO $$ BEGIN
  EXECUTE 'ALTER TABLE "ChiTietDonThuoc" ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Bảng ChiTietDonThuoc chưa tồn tại, bỏ qua.';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE "ChiTietDonThuocMau" ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Bảng ChiTietDonThuocMau chưa tồn tại, bỏ qua.';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE "NoBenhNhan" ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Bảng NoBenhNhan chưa tồn tại, bỏ qua.';
END $$;

-- 4d. Bảng phụ trợ (face recognition)
-- Chỉ bật nếu bảng tồn tại - bỏ qua lỗi nếu chưa có
DO $$ BEGIN
  EXECUTE 'ALTER TABLE "PendingFaces" ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE face_embeddings ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ========== PHẦN 5: POLICIES CHO BẢNG QUẢN TRỊ ==========

-- 5a. tenants
CREATE POLICY "tenants_select" ON tenants FOR SELECT USING (
  id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "tenants_insert" ON tenants FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
CREATE POLICY "tenants_update" ON tenants FOR UPDATE USING (
  is_tenant_owner(auth.uid(), id)
);
CREATE POLICY "tenants_delete" ON tenants FOR DELETE USING (
  owner_id = auth.uid()
);

-- 5b. tenantmembership
CREATE POLICY "membership_select_own" ON tenantmembership FOR SELECT USING (
  user_id = auth.uid()
  OR is_tenant_owner(auth.uid(), tenant_id)
);
CREATE POLICY "membership_insert" ON tenantmembership FOR INSERT WITH CHECK (
  is_tenant_owner(auth.uid(), tenant_id)
);
CREATE POLICY "membership_update" ON tenantmembership FOR UPDATE USING (
  is_tenant_owner(auth.uid(), tenant_id)
);
CREATE POLICY "membership_delete" ON tenantmembership FOR DELETE USING (
  is_tenant_owner(auth.uid(), tenant_id)
);

-- 5c. user_profiles
CREATE POLICY "profile_all" ON user_profiles FOR ALL USING (
  id = auth.uid()
);

-- 5d. tenant_invitations
CREATE POLICY "invitations_select" ON tenant_invitations FOR SELECT USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
  OR is_tenant_owner(auth.uid(), tenant_id)
);
CREATE POLICY "invitations_insert" ON tenant_invitations FOR INSERT WITH CHECK (
  is_tenant_owner(auth.uid(), tenant_id)
);
CREATE POLICY "invitations_update" ON tenant_invitations FOR UPDATE USING (
  is_tenant_owner(auth.uid(), tenant_id)
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);
CREATE POLICY "invitations_delete" ON tenant_invitations FOR DELETE USING (
  is_tenant_owner(auth.uid(), tenant_id)
);

-- ========== PHẦN 6: POLICIES CHO 12 BẢNG BUSINESS CHÍNH ==========
-- Pattern: thành viên phòng khám xem/sửa dữ liệu của phòng khám mình
-- Dùng SECURITY DEFINER function để tránh recursive RLS

-- 6a. BenhNhan
CREATE POLICY "BenhNhan_select" ON "BenhNhan" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "BenhNhan_insert" ON "BenhNhan" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "BenhNhan_update" ON "BenhNhan" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "BenhNhan_delete" ON "BenhNhan" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6b. DonThuoc
CREATE POLICY "DonThuoc_select" ON "DonThuoc" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DonThuoc_insert" ON "DonThuoc" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DonThuoc_update" ON "DonThuoc" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DonThuoc_delete" ON "DonThuoc" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6c. DonKinh
CREATE POLICY "DonKinh_select" ON "DonKinh" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DonKinh_insert" ON "DonKinh" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DonKinh_update" ON "DonKinh" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DonKinh_delete" ON "DonKinh" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6d. Thuoc
CREATE POLICY "Thuoc_select" ON "Thuoc" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "Thuoc_insert" ON "Thuoc" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "Thuoc_update" ON "Thuoc" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "Thuoc_delete" ON "Thuoc" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6e. NhomThuoc
CREATE POLICY "NhomThuoc_select" ON "NhomThuoc" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "NhomThuoc_insert" ON "NhomThuoc" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "NhomThuoc_update" ON "NhomThuoc" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "NhomThuoc_delete" ON "NhomThuoc" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6f. ChoKham
CREATE POLICY "ChoKham_select" ON "ChoKham" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "ChoKham_insert" ON "ChoKham" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "ChoKham_update" ON "ChoKham" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "ChoKham_delete" ON "ChoKham" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6g. DienTien
CREATE POLICY "DienTien_select" ON "DienTien" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DienTien_insert" ON "DienTien" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DienTien_update" ON "DienTien" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DienTien_delete" ON "DienTien" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6h. DonThuocMau
CREATE POLICY "DonThuocMau_select" ON "DonThuocMau" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DonThuocMau_insert" ON "DonThuocMau" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DonThuocMau_update" ON "DonThuocMau" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "DonThuocMau_delete" ON "DonThuocMau" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6i. GongKinh
CREATE POLICY "GongKinh_select" ON "GongKinh" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "GongKinh_insert" ON "GongKinh" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "GongKinh_update" ON "GongKinh" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "GongKinh_delete" ON "GongKinh" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6j. HangTrong
CREATE POLICY "HangTrong_select" ON "HangTrong" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "HangTrong_insert" ON "HangTrong" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "HangTrong_update" ON "HangTrong" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "HangTrong_delete" ON "HangTrong" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6k. PhieuNhapKho
CREATE POLICY "PhieuNhapKho_select" ON "PhieuNhapKho" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "PhieuNhapKho_insert" ON "PhieuNhapKho" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "PhieuNhapKho_update" ON "PhieuNhapKho" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "PhieuNhapKho_delete" ON "PhieuNhapKho" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- 6l. NhaCungCap
CREATE POLICY "NhaCungCap_select" ON "NhaCungCap" FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "NhaCungCap_insert" ON "NhaCungCap" FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "NhaCungCap_update" ON "NhaCungCap" FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "NhaCungCap_delete" ON "NhaCungCap" FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- ========== PHẦN 7: POLICIES CHO BẢNG CON (không có tenant_id trực tiếp) ==========
-- Kiểm soát qua FK → bảng cha → tenant_id

-- 7a. ChiTietDonThuoc (FK: donthuocid → DonThuoc.id)
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "ChiTietDonThuoc_select" ON "ChiTietDonThuoc" FOR SELECT USING (
    donthuocid IN (SELECT id FROM "DonThuoc" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
  EXECUTE 'CREATE POLICY "ChiTietDonThuoc_insert" ON "ChiTietDonThuoc" FOR INSERT WITH CHECK (
    donthuocid IN (SELECT id FROM "DonThuoc" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
  EXECUTE 'CREATE POLICY "ChiTietDonThuoc_update" ON "ChiTietDonThuoc" FOR UPDATE USING (
    donthuocid IN (SELECT id FROM "DonThuoc" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
  EXECUTE 'CREATE POLICY "ChiTietDonThuoc_delete" ON "ChiTietDonThuoc" FOR DELETE USING (
    donthuocid IN (SELECT id FROM "DonThuoc" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Bảng ChiTietDonThuoc chưa tồn tại, bỏ qua policies.';
END $$;

-- 7b. ChiTietDonThuocMau (FK: donthuocmauid → DonThuocMau.id)
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "ChiTietDonThuocMau_select" ON "ChiTietDonThuocMau" FOR SELECT USING (
    donthuocmauid IN (SELECT id FROM "DonThuocMau" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
  EXECUTE 'CREATE POLICY "ChiTietDonThuocMau_insert" ON "ChiTietDonThuocMau" FOR INSERT WITH CHECK (
    donthuocmauid IN (SELECT id FROM "DonThuocMau" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
  EXECUTE 'CREATE POLICY "ChiTietDonThuocMau_update" ON "ChiTietDonThuocMau" FOR UPDATE USING (
    donthuocmauid IN (SELECT id FROM "DonThuocMau" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
  EXECUTE 'CREATE POLICY "ChiTietDonThuocMau_delete" ON "ChiTietDonThuocMau" FOR DELETE USING (
    donthuocmauid IN (SELECT id FROM "DonThuocMau" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Bảng ChiTietDonThuocMau chưa tồn tại, bỏ qua policies.';
END $$;

-- 7c. NoBenhNhan (FK: benhnhanid → BenhNhan.id, donthuocid → DonThuoc.id)
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "NoBenhNhan_select" ON "NoBenhNhan" FOR SELECT USING (
    benhnhanid IN (SELECT id FROM "BenhNhan" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
  EXECUTE 'CREATE POLICY "NoBenhNhan_insert" ON "NoBenhNhan" FOR INSERT WITH CHECK (
    benhnhanid IN (SELECT id FROM "BenhNhan" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
  EXECUTE 'CREATE POLICY "NoBenhNhan_update" ON "NoBenhNhan" FOR UPDATE USING (
    benhnhanid IN (SELECT id FROM "BenhNhan" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
  EXECUTE 'CREATE POLICY "NoBenhNhan_delete" ON "NoBenhNhan" FOR DELETE USING (
    benhnhanid IN (SELECT id FROM "BenhNhan" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Bảng NoBenhNhan chưa tồn tại, bỏ qua policies.';
END $$;

-- ========== PHẦN 8: POLICIES CHO BẢNG PHỤ TRỢ (face recognition) ==========
-- Các bảng này liên kết với BenhNhan qua patient_id / assigned_to

-- 8a. face_embeddings (FK: patient_id → BenhNhan.id)
DO $$ BEGIN
  -- SELECT
  EXECUTE 'CREATE POLICY "face_embeddings_select" ON face_embeddings FOR SELECT USING (
    patient_id IN (
      SELECT id FROM "BenhNhan" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  )';
  -- INSERT
  EXECUTE 'CREATE POLICY "face_embeddings_insert" ON face_embeddings FOR INSERT WITH CHECK (
    patient_id IN (
      SELECT id FROM "BenhNhan" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  )';
  -- DELETE
  EXECUTE 'CREATE POLICY "face_embeddings_delete" ON face_embeddings FOR DELETE USING (
    patient_id IN (
      SELECT id FROM "BenhNhan" WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  )';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Bảng face_embeddings chưa tồn tại, bỏ qua.';
END $$;

-- 8b. PendingFaces
-- PendingFaces có thể chưa gán patient, cho phép thành viên xem tất cả pending của phòng khám
-- Cần thêm tenant_id vào PendingFaces nếu muốn isolate
DO $$ BEGIN
  -- Thêm cột tenant_id nếu chưa có
  BEGIN
    EXECUTE 'ALTER TABLE "PendingFaces" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pendingfaces_tenant ON "PendingFaces"(tenant_id)';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  -- Policies
  BEGIN
    EXECUTE 'CREATE POLICY "PendingFaces_select" ON "PendingFaces" FOR SELECT USING (
      tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )';
    EXECUTE 'CREATE POLICY "PendingFaces_insert" ON "PendingFaces" FOR INSERT WITH CHECK (
      tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )';
    EXECUTE 'CREATE POLICY "PendingFaces_update" ON "PendingFaces" FOR UPDATE USING (
      tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )';
    EXECUTE 'CREATE POLICY "PendingFaces_delete" ON "PendingFaces" FOR DELETE USING (
      tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

-- 8c. MauThiLuc, MauSoKinh - bảng lookup template (dùng chung, không cần tenant isolation)
-- Nếu muốn mỗi phòng khám tự quản lý mẫu riêng, thêm tenant_id + policy tương tự
-- Hiện tại cho phép tất cả authenticated users đọc/ghi
DO $$ BEGIN
  EXECUTE 'ALTER TABLE "MauThiLuc" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'CREATE POLICY "MauThiLuc_all" ON "MauThiLuc" FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE "MauSoKinh" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'CREATE POLICY "MauSoKinh_all" ON "MauSoKinh" FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ========== PHẦN 9: INDEXES BỔ SUNG CHO PERFORMANCE ==========
-- Các subquery trong RLS policies cần index tốt

-- FK index cho bảng con (dùng trong policy subquery)
DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_chitietdonthuoc_donthuocid ON "ChiTietDonThuoc"(donthuocid)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_nobenhnhan_benhnhanid ON "NoBenhNhan"(benhnhanid)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Composite index cho DonThuoc lookup nhanh
CREATE INDEX IF NOT EXISTS idx_donthuoc_tenant_benhnhan ON "DonThuoc"(tenant_id, benhnhanid);
CREATE INDEX IF NOT EXISTS idx_donkinh_tenant_benhnhan ON "DonKinh"(tenant_id, benhnhanid);

-- Index cho ChoKham query thường dùng
CREATE INDEX IF NOT EXISTS idx_chokham_tenant_date ON "ChoKham"(tenant_id, thoigian);

-- ========== PHẦN 10: GHI CHÚ QUAN TRỌNG ==========
-- 
-- 1. SERVICE_ROLE KEY: Supabase mặc định cho service_role bypass RLS.
--    API routes của chúng ta dùng service_role + filter tenant_id trong code → defense in depth.
--    RLS policies ở đây bảo vệ thêm nếu ai đó truy cập DB bằng anon key.
--
-- 2. DATA MIGRATION: Sau khi chạy script này, dữ liệu cũ có tenant_id = NULL.
--    Cần chạy script migrate để gán tenant_id cho dữ liệu hiện tại:
--    
--    -- Tạo tenant mặc định cho dữ liệu cũ
--    INSERT INTO tenants (id, name, code, owner_id)
--    VALUES ('00000000-0000-0000-0000-000000000001', 'Phòng khám mặc định', 'DEFAULT', '<owner_user_id>');
--    
--    -- Gán tenant_id cho tất cả dữ liệu NULL
--    UPDATE "BenhNhan" SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
--    UPDATE "DonThuoc" SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
--    -- ... tương tự cho các bảng khác
--
-- 3. SAU KHI MIGRATE xong, có thể thêm NOT NULL constraint:
--    ALTER TABLE "BenhNhan" ALTER COLUMN tenant_id SET NOT NULL;
--    -- ... tương tự cho các bảng khác
--
-- 4. PERFORMANCE: Nếu số lượng tenant lớn, cân nhắc dùng
--    SET LOCAL app.current_tenant_id = '...' thay vì subquery mỗi row.
--    Cần custom Supabase middleware cho cách này.
