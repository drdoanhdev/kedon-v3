-- Bảng ghi chú/hướng dẫn hệ thống — mỗi tenant có nội dung riêng
-- Chỉ owner/admin được sửa, tất cả thành viên được xem
CREATE TABLE IF NOT EXISTS "GhiChuHeThong" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL DEFAULT 'huong-dan',      -- phân biệt các trang ghi chú
  title TEXT NOT NULL DEFAULT 'Hướng dẫn sử dụng',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_ghichuht_tenant ON "GhiChuHeThong"(tenant_id);
