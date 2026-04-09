-- Cho phép thông báo hệ thống toàn cục (superadmin broadcast)
-- tenant_id = NULL → thông báo cho TẤT CẢ phòng khám

-- 1. Cho phép tenant_id nullable
ALTER TABLE thong_bao ALTER COLUMN tenant_id DROP NOT NULL;

-- 2. Index cho thông báo toàn cục
CREATE INDEX IF NOT EXISTS idx_thongbao_global_broadcast
  ON thong_bao(created_at DESC)
  WHERE tenant_id IS NULL AND user_id IS NULL;

-- 3. Cập nhật RLS: cho phép user đọc thông báo global (tenant_id IS NULL)
DROP POLICY IF EXISTS "thongbao_select" ON thong_bao;
CREATE POLICY "thongbao_select" ON thong_bao FOR SELECT USING (
  -- Thông báo global (từ superadmin) hoặc thông báo trong tenant của user
  (tenant_id IS NULL AND user_id IS NULL)
  OR (
    tenant_id IN (SELECT tenant_id FROM tenantmembership WHERE user_id = auth.uid() AND active = true)
    AND (user_id = auth.uid() OR user_id IS NULL)
  )
);

-- 4. Cập nhật RLS: cho phép user đánh dấu đã đọc thông báo global
DROP POLICY IF EXISTS "thongbao_update" ON thong_bao;
CREATE POLICY "thongbao_update" ON thong_bao FOR UPDATE USING (
  -- Thông báo global
  (tenant_id IS NULL AND user_id IS NULL)
  OR (
    (user_id = auth.uid() OR user_id IS NULL)
    AND tenant_id IN (SELECT tenant_id FROM tenantmembership WHERE user_id = auth.uid() AND active = true)
  )
);

-- Lưu ý: INSERT và DELETE cho thông báo global được thực hiện qua supabaseAdmin (service role),
-- nên không cần cập nhật RLS INSERT/DELETE.
