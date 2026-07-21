-- V092: Drop tính năng nhóm giá gọng (chưa dùng production)
-- Gỡ bảng/cột/RPC/constraint liên quan nhom_gia_gong.

BEGIN;

-- 1) Xóa dữ liệu phụ thuộc trước khi đổi CHECK / drop bảng
DELETE FROM stock_movement WHERE loai_hang = 'nhom_gia_gong';
DELETE FROM branch_price_overrides WHERE item_type = 'nhom_gia_gong';

-- 2) Drop trigger + RPC nhóm giá
DROP TRIGGER IF EXISTS trg_nhom_gia_gong_nhap ON nhom_gia_gong_nhap;
DROP FUNCTION IF EXISTS update_nhom_gia_on_import();
DROP FUNCTION IF EXISTS adjust_nhom_gia_stock(INT, INT);
DROP FUNCTION IF EXISTS adjust_nhom_gia_stock(INT, INT, TEXT, INT);

-- 3) Drop FK columns
ALTER TABLE "DonKinh" DROP COLUMN IF EXISTS nhom_gia_gong_id;
ALTER TABLE "GongKinh" DROP COLUMN IF EXISTS nhom_gia_gong_id;

-- 4) Drop tables (nhap trước vì FK → nhom_gia_gong)
DROP TABLE IF EXISTS nhom_gia_gong_nhap;
DROP TABLE IF EXISTS nhom_gia_gong;

-- 5) Siết CHECK constraint: bỏ nhom_gia_gong khỏi stock_movement
ALTER TABLE stock_movement DROP CONSTRAINT IF EXISTS stock_movement_loai_hang_check;
ALTER TABLE stock_movement
  ADD CONSTRAINT stock_movement_loai_hang_check
  CHECK (loai_hang IN ('thuoc', 'trong', 'gong'));

-- 6) Siết CHECK constraint: bỏ nhom_gia_gong khỏi branch_price_overrides
ALTER TABLE branch_price_overrides DROP CONSTRAINT IF EXISTS branch_price_overrides_item_type_check;
ALTER TABLE branch_price_overrides
  ADD CONSTRAINT branch_price_overrides_item_type_check
  CHECK (item_type IN ('thuoc', 'hang_trong', 'gong_kinh'));

-- 7) Cập nhật RPC sổ kho / kiểm kê — bỏ nhánh nhom_gia_gong
CREATE OR REPLACE FUNCTION record_stock_movement(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_loai_hang TEXT,
  p_stock_ref_id INTEGER,
  p_loai_giao_dich TEXT,
  p_so_luong INTEGER,
  p_don_gia_nhap BIGINT DEFAULT NULL,
  p_gia_von_snapshot BIGINT DEFAULT NULL,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id INTEGER DEFAULT NULL,
  p_so_lo TEXT DEFAULT NULL,
  p_han_su_dung DATE DEFAULT NULL,
  p_ly_do TEXT DEFAULT NULL,
  p_ghi_chu TEXT DEFAULT NULL,
  p_nguoi_thuc_hien UUID DEFAULT NULL,
  p_allow_negative BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(movement_id BIGINT, ton_truoc INTEGER, ton_sau INTEGER, gia_von_bq BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ton_truoc INTEGER;
  v_gia_von_truoc BIGINT;
  v_ton_sau INTEGER;
  v_gia_von_sau BIGINT;
  v_gia_von_snapshot BIGINT;
  v_movement_id BIGINT;
BEGIN
  IF p_loai_giao_dich NOT IN ('nhap', 'xuat_ban', 'xuat_huy', 'kiem_ke', 'dieu_chuyen_in', 'dieu_chuyen_out', 'hoan_tra') THEN
    RAISE EXCEPTION 'loai_giao_dich không hợp lệ: %', p_loai_giao_dich;
  END IF;

  IF p_loai_hang = 'thuoc' THEN
    SELECT COALESCE(tonkho, 0), COALESCE(gianhap, 0) INTO v_ton_truoc, v_gia_von_truoc
    FROM "Thuoc" WHERE id = p_stock_ref_id AND tenant_id = p_tenant_id FOR UPDATE;
  ELSIF p_loai_hang = 'trong' THEN
    SELECT COALESCE(ton_hien_tai, 0), COALESCE(gia_nhap_bq, 0) INTO v_ton_truoc, v_gia_von_truoc
    FROM lens_stock WHERE id = p_stock_ref_id AND tenant_id = p_tenant_id FOR UPDATE;
  ELSIF p_loai_hang = 'gong' THEN
    SELECT COALESCE(ton_kho, 0), COALESCE(gia_nhap, 0) INTO v_ton_truoc, v_gia_von_truoc
    FROM "GongKinh" WHERE id = p_stock_ref_id AND tenant_id = p_tenant_id FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'loai_hang không hợp lệ: %', p_loai_hang;
  END IF;

  IF v_ton_truoc IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy %(id=%) thuộc tenant', p_loai_hang, p_stock_ref_id;
  END IF;

  IF p_loai_giao_dich = 'nhap' AND p_don_gia_nhap IS NOT NULL AND p_don_gia_nhap > 0 AND p_so_luong > 0 THEN
    IF v_ton_truoc <= 0 OR v_gia_von_truoc <= 0 THEN
      v_gia_von_sau := p_don_gia_nhap;
    ELSE
      v_gia_von_sau := ROUND(
        (v_ton_truoc * v_gia_von_truoc + p_so_luong * p_don_gia_nhap)::NUMERIC
        / NULLIF(v_ton_truoc + p_so_luong, 0)
      );
    END IF;
  ELSE
    v_gia_von_sau := v_gia_von_truoc;
  END IF;

  v_ton_sau := v_ton_truoc + p_so_luong;

  IF v_ton_sau < 0 AND NOT p_allow_negative THEN
    RAISE EXCEPTION 'Tồn kho không đủ (hiện có %, cần xuất %)', v_ton_truoc, (-p_so_luong);
  END IF;

  IF p_loai_giao_dich = 'xuat_ban' AND p_gia_von_snapshot IS NULL THEN
    v_gia_von_snapshot := v_gia_von_truoc;
  ELSE
    v_gia_von_snapshot := p_gia_von_snapshot;
  END IF;

  IF p_loai_hang = 'thuoc' THEN
    UPDATE "Thuoc" SET tonkho = v_ton_sau, gianhap = v_gia_von_sau WHERE id = p_stock_ref_id;
  ELSIF p_loai_hang = 'trong' THEN
    UPDATE lens_stock SET ton_hien_tai = v_ton_sau, gia_nhap_bq = v_gia_von_sau, updated_at = now() WHERE id = p_stock_ref_id;
  ELSIF p_loai_hang = 'gong' THEN
    UPDATE "GongKinh" SET ton_kho = v_ton_sau, gia_nhap = v_gia_von_sau WHERE id = p_stock_ref_id;
  END IF;

  INSERT INTO stock_movement (
    tenant_id, branch_id, loai_hang, stock_ref_id, loai_giao_dich, so_luong,
    ton_truoc, ton_sau, don_gia_nhap, gia_von_snapshot, gia_von_bq_sau, ref_type, ref_id,
    so_lo, han_su_dung, ly_do, ghi_chu, nguoi_thuc_hien
  ) VALUES (
    p_tenant_id, p_branch_id, p_loai_hang, p_stock_ref_id, p_loai_giao_dich, p_so_luong,
    v_ton_truoc, v_ton_sau, p_don_gia_nhap, v_gia_von_snapshot, v_gia_von_sau, p_ref_type, p_ref_id,
    p_so_lo, p_han_su_dung, p_ly_do, p_ghi_chu, p_nguoi_thuc_hien
  ) RETURNING id INTO v_movement_id;

  RETURN QUERY SELECT v_movement_id, v_ton_truoc, v_ton_sau, v_gia_von_sau;
END;
$$;

CREATE OR REPLACE FUNCTION record_stocktake(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_loai_hang TEXT,
  p_stock_ref_id INTEGER,
  p_ton_thuc_te INTEGER,
  p_ghi_chu TEXT DEFAULT NULL,
  p_nguoi_thuc_hien UUID DEFAULT NULL
)
RETURNS TABLE(movement_id BIGINT, ton_truoc INTEGER, ton_sau INTEGER, gia_von_bq BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ton_hien_tai INTEGER;
  v_delta INTEGER;
BEGIN
  IF p_loai_hang = 'thuoc' THEN
    SELECT COALESCE(tonkho, 0) INTO v_ton_hien_tai FROM "Thuoc" WHERE id = p_stock_ref_id AND tenant_id = p_tenant_id;
  ELSIF p_loai_hang = 'trong' THEN
    SELECT COALESCE(ton_hien_tai, 0) INTO v_ton_hien_tai FROM lens_stock WHERE id = p_stock_ref_id AND tenant_id = p_tenant_id;
  ELSIF p_loai_hang = 'gong' THEN
    SELECT COALESCE(ton_kho, 0) INTO v_ton_hien_tai FROM "GongKinh" WHERE id = p_stock_ref_id AND tenant_id = p_tenant_id;
  ELSE
    RAISE EXCEPTION 'loai_hang không hợp lệ: %', p_loai_hang;
  END IF;

  IF v_ton_hien_tai IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy %(id=%) thuộc tenant', p_loai_hang, p_stock_ref_id;
  END IF;

  v_delta := p_ton_thuc_te - v_ton_hien_tai;

  IF v_delta = 0 THEN
    RETURN QUERY SELECT * FROM record_stock_movement(
      p_tenant_id, p_branch_id, p_loai_hang, p_stock_ref_id, 'kiem_ke', 0,
      NULL, NULL, 'stocktake', NULL, NULL, NULL, NULL, p_ghi_chu, p_nguoi_thuc_hien, TRUE
    );
  END IF;

  RETURN QUERY SELECT * FROM record_stock_movement(
    p_tenant_id, p_branch_id, p_loai_hang, p_stock_ref_id, 'kiem_ke', v_delta,
    NULL, NULL, 'stocktake', NULL, NULL, NULL, NULL, p_ghi_chu, p_nguoi_thuc_hien, TRUE
  );
END;
$$;

COMMIT;
