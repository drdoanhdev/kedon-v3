-- ============================================
-- XÓA TÍNH NĂNG NHÓM THUỐC
-- Chạy migration này sau khi deploy code mới
-- ============================================

-- 1. Xóa bảng ThuocNhom (bảng liên kết nhiều-nhiều)
DROP TABLE IF EXISTS "ThuocNhom" CASCADE;

-- 2. Xóa RLS policies trên NhomThuoc
DROP POLICY IF EXISTS "NhomThuoc_select" ON "NhomThuoc";
DROP POLICY IF EXISTS "NhomThuoc_insert" ON "NhomThuoc";
DROP POLICY IF EXISTS "NhomThuoc_update" ON "NhomThuoc";
DROP POLICY IF EXISTS "NhomThuoc_delete" ON "NhomThuoc";

-- 3. Xóa bảng NhomThuoc
DROP TABLE IF EXISTS "NhomThuoc" CASCADE;

-- 4. Xóa cột nhomthuoc khỏi bảng Thuoc (string column lưu danh sách nhóm)
ALTER TABLE "Thuoc" DROP COLUMN IF EXISTS nhomthuoc;
