-- ============================================
-- THÔNG BÁO & TIN NHẮN HỆ THỐNG
-- Tối ưu cho vài trăm người dùng đồng thời
-- Dùng polling (30-60s), không dùng Realtime
-- ============================================

-- ========== BẢNG THÔNG BÁO (admin → user) ==========
CREATE TABLE IF NOT EXISTS thong_bao (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = gửi cho tất cả thành viên tenant
  tieu_de TEXT NOT NULL,
  noi_dung TEXT NOT NULL,
  loai TEXT NOT NULL DEFAULT 'system' CHECK (loai IN ('system', 'admin', 'reminder', 'warning')),
  da_doc BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== BẢNG TIN NHẮN (user ↔ admin trong tenant) ==========
CREATE TABLE IF NOT EXISTS tin_nhan (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  noi_dung TEXT NOT NULL,
  is_from_admin BOOLEAN NOT NULL DEFAULT false,
  parent_id BIGINT REFERENCES tin_nhan(id) ON DELETE SET NULL,  -- reply thread (optional)
  da_doc BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== INDEXES TỐI ƯU CHO POLLING ==========

-- Thông báo: query chính = "lấy thông báo chưa đọc của user trong tenant"
-- Partial index chỉ index row chưa đọc → nhỏ gọn, cực nhanh
CREATE INDEX IF NOT EXISTS idx_thongbao_user_unread
  ON thong_bao(tenant_id, user_id, created_at DESC)
  WHERE da_doc = false;

-- Thông báo: lấy toàn bộ (đã đọc + chưa đọc) phân trang
CREATE INDEX IF NOT EXISTS idx_thongbao_tenant_user_time
  ON thong_bao(tenant_id, user_id, created_at DESC);

-- Thông báo broadcast (user_id IS NULL): gửi cho tất cả
CREATE INDEX IF NOT EXISTS idx_thongbao_broadcast
  ON thong_bao(tenant_id, created_at DESC)
  WHERE user_id IS NULL;

-- Tin nhắn: query chính = "lấy tin nhắn trong tenant, sắp xếp theo thời gian"
CREATE INDEX IF NOT EXISTS idx_tinnhan_tenant_time
  ON tin_nhan(tenant_id, created_at DESC);

-- Tin nhắn: đếm tin chưa đọc cho user (admin xem tin từ user, user xem tin từ admin)
CREATE INDEX IF NOT EXISTS idx_tinnhan_unread
  ON tin_nhan(tenant_id, is_from_admin, created_at DESC)
  WHERE da_doc = false;

-- ========== RLS POLICIES ==========

ALTER TABLE thong_bao ENABLE ROW LEVEL SECURITY;
ALTER TABLE tin_nhan ENABLE ROW LEVEL SECURITY;

-- Thông báo: user chỉ xem thông báo của mình hoặc broadcast
CREATE POLICY "thongbao_select" ON thong_bao FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenantmembership WHERE user_id = auth.uid() AND active = true)
  AND (user_id = auth.uid() OR user_id IS NULL)
);

-- Thông báo: chỉ owner/admin tạo được
CREATE POLICY "thongbao_insert" ON thong_bao FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenantmembership
    WHERE user_id = auth.uid() AND tenant_id = thong_bao.tenant_id
    AND active = true AND role IN ('owner', 'admin')
  )
);

-- Thông báo: user đánh dấu đã đọc thông báo của mình
CREATE POLICY "thongbao_update" ON thong_bao FOR UPDATE USING (
  (user_id = auth.uid() OR user_id IS NULL)
  AND tenant_id IN (SELECT tenant_id FROM tenantmembership WHERE user_id = auth.uid() AND active = true)
);

-- Thông báo: owner/admin xóa
CREATE POLICY "thongbao_delete" ON thong_bao FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM tenantmembership
    WHERE user_id = auth.uid() AND tenant_id = thong_bao.tenant_id
    AND active = true AND role IN ('owner', 'admin')
  )
);

-- Tin nhắn: thành viên tenant đọc được
CREATE POLICY "tinnhan_select" ON tin_nhan FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenantmembership WHERE user_id = auth.uid() AND active = true)
);

-- Tin nhắn: thành viên tenant gửi được
CREATE POLICY "tinnhan_insert" ON tin_nhan FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND tenant_id IN (SELECT tenant_id FROM tenantmembership WHERE user_id = auth.uid() AND active = true)
);

-- Tin nhắn: đánh dấu đã đọc
CREATE POLICY "tinnhan_update" ON tin_nhan FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM tenantmembership WHERE user_id = auth.uid() AND active = true)
);

-- ========== DỌN DẸP TỰ ĐỘNG (chạy bằng pg_cron hoặc gọi thủ công) ==========

-- Xóa thông báo đã đọc > 30 ngày, chưa đọc > 90 ngày
CREATE OR REPLACE FUNCTION cleanup_old_thongbao()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM thong_bao
  WHERE (da_doc = true AND created_at < now() - interval '30 days')
     OR (da_doc = false AND created_at < now() - interval '90 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Xóa tin nhắn cũ > 90 ngày
CREATE OR REPLACE FUNCTION cleanup_old_tinnhan()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM tin_nhan
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========== GHI CHÚ ==========
-- 1. Để chạy tự động hàng ngày, bật extension pg_cron trong Supabase Dashboard:
--    SELECT cron.schedule('cleanup-thongbao', '0 3 * * *', 'SELECT cleanup_old_thongbao()');
--    SELECT cron.schedule('cleanup-tinnhan', '0 3 * * *', 'SELECT cleanup_old_tinnhan()');
-- 2. Hoặc gọi thủ công: SELECT cleanup_old_thongbao(); SELECT cleanup_old_tinnhan();
-- 3. API routes dùng service_role + filter tenant_id trong code (defense in depth)
-- 4. Partial indexes đảm bảo polling cực nhanh (<1ms) ngay cả với hàng nghìn rows
