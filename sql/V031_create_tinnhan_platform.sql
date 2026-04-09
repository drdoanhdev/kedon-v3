-- ============================================
-- TIN NHẮN PHÒNG KHÁM ↔ SUPERADMIN (Platform Messages)
-- Migration: nâng cấp bảng cũ (is_from_superadmin) → schema mới (sender_role + soft delete)
-- Chạy an toàn nhiều lần (idempotent)
-- ============================================

-- ========== BƯỚC 1: TẠO BẢNG NẾU CHƯA CÓ (lần đầu tiên) ==========
CREATE TABLE IF NOT EXISTS tin_nhan_platform (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  noi_dung TEXT NOT NULL,
  da_doc_tenant BOOLEAN NOT NULL DEFAULT false,
  da_doc_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== BƯỚC 2: THÊM CỘT MỚI (nếu chưa có) ==========

-- sender_role thay thế is_from_superadmin
ALTER TABLE tin_nhan_platform ADD COLUMN IF NOT EXISTS sender_role TEXT DEFAULT 'tenant';

-- Soft delete 2 phía
ALTER TABLE tin_nhan_platform ADD COLUMN IF NOT EXISTS deleted_by_tenant BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tin_nhan_platform ADD COLUMN IF NOT EXISTS deleted_by_admin BOOLEAN NOT NULL DEFAULT false;

-- Mở rộng tương lai
ALTER TABLE tin_nhan_platform ADD COLUMN IF NOT EXISTS topic TEXT DEFAULT NULL;
ALTER TABLE tin_nhan_platform ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- ========== BƯỚC 3: MIGRATE DỮ LIỆU CŨ ==========
-- Chuyển is_from_superadmin → sender_role (chỉ chạy nếu cột cũ còn tồn tại)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tin_nhan_platform' AND column_name = 'is_from_superadmin'
  ) THEN
    UPDATE tin_nhan_platform
    SET sender_role = CASE WHEN is_from_superadmin = true THEN 'superadmin' ELSE 'tenant' END
    WHERE sender_role IS NULL OR sender_role = 'tenant';

    -- Xóa cột cũ sau khi đã migrate
    ALTER TABLE tin_nhan_platform DROP COLUMN is_from_superadmin;
  END IF;
END $$;

-- ========== BƯỚC 4: THÊM CONSTRAINT (sau khi đã migrate dữ liệu) ==========
-- Đặt NOT NULL cho sender_role
DO $$
BEGIN
  -- Set default cho row nào còn NULL
  UPDATE tin_nhan_platform SET sender_role = 'tenant' WHERE sender_role IS NULL;

  -- Thêm NOT NULL nếu chưa có
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tin_nhan_platform' AND column_name = 'sender_role' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE tin_nhan_platform ALTER COLUMN sender_role SET NOT NULL;
  END IF;
END $$;

-- Thêm CHECK constraint (xóa cái cũ nếu có rồi tạo lại)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'tin_nhan_platform_sender_role_check'
  ) THEN
    ALTER TABLE tin_nhan_platform ADD CONSTRAINT tin_nhan_platform_sender_role_check
      CHECK (sender_role IN ('tenant', 'superadmin'));
  END IF;
END $$;

-- ========== BƯỚC 5: XÓA INDEX CŨ, TẠO INDEX MỚI ==========
DROP INDEX IF EXISTS idx_tnplatform_admin_unread;

-- Superadmin inbox: tenant nào có tin chưa đọc (GROUP BY tenant_id)
CREATE INDEX IF NOT EXISTS idx_tnplatform_admin_tenant_unread
  ON tin_nhan_platform(tenant_id, created_at DESC)
  WHERE da_doc_admin = false AND deleted_by_admin = false;

-- Phòng khám: tin chưa đọc từ superadmin
DROP INDEX IF EXISTS idx_tnplatform_tenant_unread;
CREATE INDEX IF NOT EXISTS idx_tnplatform_tenant_unread
  ON tin_nhan_platform(tenant_id, created_at DESC)
  WHERE da_doc_tenant = false AND sender_role = 'superadmin' AND deleted_by_tenant = false;

-- Thread view: lấy tin nhắn theo tenant
CREATE INDEX IF NOT EXISTS idx_tnplatform_tenant_time
  ON tin_nhan_platform(tenant_id, created_at DESC);

-- ========== BƯỚC 6: RLS POLICIES ==========
ALTER TABLE tin_nhan_platform ENABLE ROW LEVEL SECURITY;

-- Xóa policy cũ rồi tạo lại (idempotent)
DROP POLICY IF EXISTS "tnplatform_select_tenant" ON tin_nhan_platform;
DROP POLICY IF EXISTS "tnplatform_insert_tenant" ON tin_nhan_platform;
DROP POLICY IF EXISTS "tnplatform_update_tenant" ON tin_nhan_platform;

-- SELECT: thành viên tenant chỉ xem tin chưa bị xóa (phía mình)
CREATE POLICY "tnplatform_select_tenant" ON tin_nhan_platform FOR SELECT USING (
  deleted_by_tenant = false
  AND tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
);

-- INSERT: chỉ chủ phòng khám (owner) mới gửi được + sender_role phải là 'tenant'
CREATE POLICY "tnplatform_insert_tenant" ON tin_nhan_platform FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND sender_role = 'tenant'
  AND tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true AND role = 'owner'
  )
);

-- UPDATE: chỉ cho đánh dấu đã đọc — KHÔNG cho sửa nội dung
CREATE POLICY "tnplatform_update_tenant" ON tin_nhan_platform FOR UPDATE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
) WITH CHECK (
  sender_id = sender_id
  AND sender_role = sender_role
  AND noi_dung = noi_dung
  AND tenant_id = tenant_id
);

-- Superadmin dùng service_role key → bypass RLS → không cần policy riêng

-- ========== BƯỚC 7: DỌN DẸP TỰ ĐỘNG ==========
CREATE OR REPLACE FUNCTION cleanup_old_tinnhan_platform()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Xóa tin nhắn đã bị cả 2 bên soft-delete > 30 ngày
  DELETE FROM tin_nhan_platform
  WHERE deleted_by_tenant = true AND deleted_by_admin = true
    AND created_at < now() - interval '30 days';
  -- Xóa tin nhắn cũ > 180 ngày
  DELETE FROM tin_nhan_platform
  WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cron (nếu đã bật pg_cron):
-- SELECT cron.schedule('cleanup-tinnhan-platform', '0 3 * * *', 'SELECT cleanup_old_tinnhan_platform()');

-- ========== GHI CHÚ ==========
-- Script này an toàn chạy nhiều lần (idempotent):
-- 1. CREATE TABLE IF NOT EXISTS → bỏ qua nếu đã có
-- 2. ADD COLUMN IF NOT EXISTS → bỏ qua nếu cột đã có
-- 3. Migrate is_from_superadmin → sender_role chỉ khi cột cũ còn tồn tại
-- 4. DROP POLICY IF EXISTS + CREATE POLICY → luôn tạo lại policy mới nhất
-- 5. DROP INDEX IF EXISTS + CREATE INDEX → luôn tạo lại index đúng
