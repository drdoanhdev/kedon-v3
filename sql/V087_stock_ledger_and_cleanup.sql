-- ====================================================================
-- V087: SỔ KHO THỐNG NHẤT (stock_movement) + DỌN SẠCH DỮ LIỆU XUẤT NHẬP TỒN CŨ
-- ====================================================================
-- Mục tiêu (theo yêu cầu cải tiến xuất nhập tồn thuốc/tròng kính/gọng):
--   1) Xóa toàn bộ dữ liệu giao dịch & tồn kho cũ (không cần giữ lại),
--      CHỈ giữ lại danh mục sản phẩm (Thuoc, HangTrong, lens_stock, GongKinh, nhom_gia_gong...)
--      và id của chúng. Giá bán/giá nhập trên danh mục KHÔNG bị xóa (không phải giao dịch).
--   2) Tạo 1 sổ kho duy nhất (stock_movement) làm nguồn sự thật cho báo cáo/đối soát,
--      được ghi tự động bởi các trigger hiện có (không cần đổi code tầng API đang hoạt động).
--   3) Snapshot giá vốn tại thời điểm xuất bán (gia_von_snapshot) để tính lãi không đổi
--      theo lịch sử, dù giá nhập hiện tại có thay đổi.
--   4) Bổ sung RPC atomic cho THUỐC (đang thiếu, chỉ có ở tròng/gọng) + RPC kiểm kê.
-- Tương thích ngược: giữ nguyên cấu trúc & API của các bảng thuoc_nhap_kho, thuoc_huy,
--   thuoc_xuat_don, lens_import, lens_export_sale, lens_export_damaged, frame_import,
--   frame_export, nhom_gia_gong_nhap — chỉ thay "thân" hàm trigger để chúng cập nhật
--   tồn kho qua RPC atomic + ghi thêm vào stock_movement.
-- ====================================================================

BEGIN;

-- ====================================================================
-- PHẦN 0: DỌN SẠCH DỮ LIỆU GIAO DỊCH & TỒN KHO CŨ
-- (giữ nguyên danh mục sản phẩm + id, giữ nguyên giá bán/giá nhập danh mục)
-- ====================================================================
TRUNCATE TABLE
  thuoc_nhap_kho,
  thuoc_huy,
  thuoc_xuat_don,
  lens_import,
  lens_export_sale,
  lens_export_damaged,
  lens_order,
  frame_import,
  frame_export,
  nhom_gia_gong_nhap,
  import_receipt_detail,
  import_receipt,
  price_history,
  pricing_suggestions
RESTART IDENTITY;

-- Reset tồn kho hiện tại về 0 (giữ nguyên id + giá bán/giá nhập danh mục)
UPDATE "Thuoc" SET tonkho = 0;
UPDATE lens_stock SET ton_dau_ky = 0, ton_hien_tai = 0;
UPDATE "GongKinh" SET ton_kho = 0;
UPDATE nhom_gia_gong SET so_luong_ton = 0;
UPDATE medical_supply SET ton_kho = 0;

-- ====================================================================
-- PHẦN 1: CỘT GIÁ VỐN BÌNH QUÂN CHO TRÒNG KÍNH (chưa có, thuốc/gọng/nhóm giá đã có)
-- ====================================================================
ALTER TABLE lens_stock ADD COLUMN IF NOT EXISTS gia_nhap_bq BIGINT NOT NULL DEFAULT 0;

-- Cột snapshot giá vốn tại thời điểm xuất bán (để lãi lịch sử không đổi)
ALTER TABLE thuoc_xuat_don ADD COLUMN IF NOT EXISTS gia_von_snapshot BIGINT;
ALTER TABLE lens_export_sale ADD COLUMN IF NOT EXISTS gia_von_snapshot BIGINT;
ALTER TABLE frame_export ADD COLUMN IF NOT EXISTS gia_von_snapshot BIGINT;

-- ====================================================================
-- PHẦN 2: SỔ KHO THỐNG NHẤT (stock_movement) — nguồn sự thật cho báo cáo/đối soát
-- ====================================================================
CREATE TABLE IF NOT EXISTS stock_movement (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  loai_hang TEXT NOT NULL CHECK (loai_hang IN ('thuoc', 'trong', 'gong', 'nhom_gia_gong')),
  stock_ref_id INTEGER NOT NULL,
  loai_giao_dich TEXT NOT NULL CHECK (loai_giao_dich IN (
    'nhap', 'xuat_ban', 'xuat_huy', 'kiem_ke', 'dieu_chuyen_in', 'dieu_chuyen_out', 'hoan_tra'
  )),
  so_luong INTEGER NOT NULL, -- delta thực tế đã áp dụng (dương = nhập/hoàn, âm = xuất)
  ton_truoc INTEGER NOT NULL,
  ton_sau INTEGER NOT NULL,
  don_gia_nhap BIGINT,
  gia_von_snapshot BIGINT,
  gia_von_bq_sau BIGINT,
  ref_type TEXT,      -- 'thuoc_nhap_kho' | 'thuoc_xuat_don' | 'don_kinh' | 'don_thuoc' | ...
  ref_id INTEGER,
  so_lo TEXT,
  han_su_dung DATE,
  ly_do TEXT,
  ghi_chu TEXT,
  nguoi_thuc_hien UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movement_tenant ON stock_movement(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movement_item ON stock_movement(tenant_id, loai_hang, stock_ref_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movement_ref ON stock_movement(ref_type, ref_id);

ALTER TABLE stock_movement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_movement_select ON stock_movement;
CREATE POLICY stock_movement_select ON stock_movement FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
DROP POLICY IF EXISTS stock_movement_service_all ON stock_movement;
CREATE POLICY stock_movement_service_all ON stock_movement FOR ALL USING (true) WITH CHECK (true);

-- ====================================================================
-- PHẦN 3: HÀM ATOMIC DUY NHẤT CẬP NHẬT TỒN KHO + GHI SỔ KHO
-- Dùng SELECT ... FOR UPDATE để tránh race-condition khi nhiều request cùng lúc.
-- ====================================================================
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
  ELSIF p_loai_hang = 'nhom_gia_gong' THEN
    SELECT COALESCE(so_luong_ton, 0), COALESCE(gia_nhap_trung_binh, 0) INTO v_ton_truoc, v_gia_von_truoc
    FROM nhom_gia_gong WHERE id = p_stock_ref_id AND tenant_id = p_tenant_id FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'loai_hang không hợp lệ: %', p_loai_hang;
  END IF;

  IF v_ton_truoc IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy %(id=%) thuộc tenant', p_loai_hang, p_stock_ref_id;
  END IF;

  -- Giá vốn bình quân di động: chỉ tái tính khi NHẬP có đơn giá > 0
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

  -- Snapshot giá vốn khi xuất bán = giá vốn TRƯỚC thời điểm xuất (không đổi theo lịch sử)
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
  ELSIF p_loai_hang = 'nhom_gia_gong' THEN
    UPDATE nhom_gia_gong SET so_luong_ton = v_ton_sau, gia_nhap_trung_binh = v_gia_von_sau, updated_at = now() WHERE id = p_stock_ref_id;
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

-- ====================================================================
-- PHẦN 4: RPC KIỂM KÊ (thay cho hack sửa tồn đầu kỳ)
-- Nhập số đếm thực tế → tự tính delta và ghi 1 giao dịch 'kiem_ke'
-- ====================================================================
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
  ELSIF p_loai_hang = 'nhom_gia_gong' THEN
    SELECT COALESCE(so_luong_ton, 0) INTO v_ton_hien_tai FROM nhom_gia_gong WHERE id = p_stock_ref_id AND tenant_id = p_tenant_id;
  ELSE
    RAISE EXCEPTION 'loai_hang không hợp lệ: %', p_loai_hang;
  END IF;

  IF v_ton_hien_tai IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy %(id=%) thuộc tenant', p_loai_hang, p_stock_ref_id;
  END IF;

  v_delta := p_ton_thuc_te - v_ton_hien_tai;

  IF v_delta = 0 THEN
    -- Không lệch, vẫn ghi nhận 1 dòng kiểm kê để có mốc đối soát (so_luong=0)
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

-- ====================================================================
-- PHẦN 5: RPC ATOMIC CHO THUỐC (bù lỗ hổng — tròng/gọng đã có adjust_lens_stock/adjust_frame_stock)
-- Dùng cho hoàn kho (sửa/xóa đơn thuốc) và các trường hợp cần cộng/trừ trực tiếp.
-- ====================================================================
CREATE OR REPLACE FUNCTION adjust_thuoc_stock(
  p_thuoc_id INTEGER,
  p_delta INTEGER,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_result RECORD;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM "Thuoc" WHERE id = p_thuoc_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy thuốc id=%', p_thuoc_id;
  END IF;

  SELECT * INTO v_result FROM record_stock_movement(
    v_tenant_id, NULL, 'thuoc', p_thuoc_id,
    CASE WHEN p_delta >= 0 THEN 'hoan_tra' ELSE 'xuat_ban' END,
    p_delta, NULL, NULL, p_ref_type, p_ref_id, NULL, NULL, NULL, NULL, NULL, TRUE
  );
  RETURN v_result.ton_sau;
END;
$$;

-- ====================================================================
-- PHẦN 6: THAY THÂN CÁC TRIGGER HIỆN CÓ ĐỂ DÙNG RPC ATOMIC + GHI SỔ KHO
-- (Không đổi tên bảng/trigger/API hiện có → không cần sửa code tầng ứng dụng
--  cho các luồng nhập/hủy/xuất đã hoạt động qua các bảng chi tiết này)
-- ====================================================================

-- 6.1 Nhập kho thuốc (thuoc_nhap_kho) — giữ nguyên logic cảnh báo tăng giá của V055
CREATE OR REPLACE FUNCTION fn_thuoc_nhap_update_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_old_von    BIGINT;
  v_old_ban    BIGINT;
  v_result     RECORD;
  v_threshold  NUMERIC;
  v_enabled    BOOLEAN;
  v_mode       TEXT;
  v_round      BIGINT;
  v_increase   NUMERIC;
  v_suggested  BIGINT;
BEGIN
  SELECT COALESCE(gianhap, 0), COALESCE(giaban, 0) INTO v_old_von, v_old_ban
  FROM "Thuoc" WHERE id = NEW.thuoc_id;

  SELECT * INTO v_result FROM record_stock_movement(
    NEW.tenant_id, NEW.branch_id, 'thuoc', NEW.thuoc_id, 'nhap', NEW.so_luong,
    NEW.don_gia, NULL, 'thuoc_nhap_kho', NEW.id, NEW.so_lo, NEW.han_su_dung,
    NULL, NEW.ghi_chu, NEW.nguoi_nhap, TRUE
  );

  -- Log thay đổi giá vốn (giữ hành vi V055)
  IF v_result.gia_von_bq IS DISTINCT FROM v_old_von THEN
    INSERT INTO price_history(
      tenant_id, item_type, item_id, kind, old_price, new_price,
      source, reason, ref_nhap_id, changed_by
    ) VALUES (
      NEW.tenant_id, 'thuoc', NEW.thuoc_id, 'von', v_old_von, v_result.gia_von_bq,
      'auto_import', 'Bình quân gia quyền sau phiếu nhập #' || NEW.id, NEW.id, NEW.nguoi_nhap
    );
  END IF;

  -- Cảnh báo tăng giá vượt ngưỡng (giữ hành vi V055)
  SELECT threshold_cost_increase_pct, enabled_for_thuoc, margin_keep_mode, round_to
    INTO v_threshold, v_enabled, v_mode, v_round
  FROM pricing_alert_config WHERE tenant_id = NEW.tenant_id;

  IF v_threshold IS NULL THEN
    v_threshold := 20.00; v_enabled := TRUE; v_mode := 'percent'; v_round := 1000;
  END IF;

  IF v_enabled AND v_old_von > 0 AND v_result.gia_von_bq > v_old_von AND NEW.don_gia > 0 THEN
    v_increase := ((v_result.gia_von_bq - v_old_von)::NUMERIC * 100.0) / v_old_von;
    IF v_increase >= v_threshold THEN
      IF v_old_ban <= 0 THEN
        v_suggested := v_result.gia_von_bq;
      ELSIF v_mode = 'absolute' THEN
        v_suggested := v_result.gia_von_bq + GREATEST(v_old_ban - v_old_von, 0);
      ELSE
        v_suggested := ROUND(v_result.gia_von_bq::NUMERIC * v_old_ban / NULLIF(v_old_von, 0))::BIGINT;
      END IF;
      v_suggested := fn_round_price_up(v_suggested, v_round);

      UPDATE pricing_suggestions
         SET status = 'superseded', reviewed_at = now()
       WHERE tenant_id = NEW.tenant_id AND item_type = 'thuoc' AND item_id = NEW.thuoc_id AND status = 'pending';

      INSERT INTO pricing_suggestions(
        tenant_id, item_type, item_id, trigger_nhap_id,
        old_cost, new_cost, cost_increase_pct,
        current_sell_price, suggested_sell_price, status
      ) VALUES (
        NEW.tenant_id, 'thuoc', NEW.thuoc_id, NEW.id,
        v_old_von, v_result.gia_von_bq, ROUND(v_increase, 2),
        v_old_ban, v_suggested, 'pending'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_thuoc_nhap_update_stock ON thuoc_nhap_kho;
CREATE TRIGGER trg_thuoc_nhap_update_stock
  AFTER INSERT ON thuoc_nhap_kho
  FOR EACH ROW EXECUTE FUNCTION fn_thuoc_nhap_update_stock();

-- 6.2 Hủy thuốc (thuoc_huy)
CREATE OR REPLACE FUNCTION fn_thuoc_huy_update_stock()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM record_stock_movement(
    NEW.tenant_id, NEW.branch_id, 'thuoc', NEW.thuoc_id, 'xuat_huy', -NEW.so_luong,
    NULL, NULL, 'thuoc_huy', NEW.id, NULL, NULL, NEW.ly_do, NEW.ghi_chu, NEW.nguoi_huy, FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_thuoc_huy_update_stock ON thuoc_huy;
CREATE TRIGGER trg_thuoc_huy_update_stock
  AFTER INSERT ON thuoc_huy
  FOR EACH ROW EXECUTE FUNCTION fn_thuoc_huy_update_stock();

-- 6.3 Xuất bán thuốc theo đơn (thuoc_xuat_don) — snapshot giá vốn vào chính dòng này
CREATE OR REPLACE FUNCTION fn_thuoc_xuat_don_update_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_result RECORD;
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM "DonThuoc" WHERE id = NEW.don_thuoc_id;

  SELECT * INTO v_result FROM record_stock_movement(
    COALESCE(v_tenant_id, NEW.tenant_id), NULL, 'thuoc', NEW.thuoc_id, 'xuat_ban', -NEW.so_luong,
    NULL, NULL, 'thuoc_xuat_don', NEW.id, NULL, NULL, NULL, NULL, NULL, TRUE
  );

  UPDATE thuoc_xuat_don SET gia_von_snapshot = v_result.gia_von_bq WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_thuoc_xuat_don_update_stock ON thuoc_xuat_don;
CREATE TRIGGER trg_thuoc_xuat_don_update_stock
  AFTER INSERT ON thuoc_xuat_don
  FOR EACH ROW EXECUTE FUNCTION fn_thuoc_xuat_don_update_stock();

-- 6.4 Nhập kho tròng kính (lens_import)
CREATE OR REPLACE FUNCTION update_lens_stock_on_import()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM record_stock_movement(
    NEW.tenant_id, NEW.branch_id, 'trong', NEW.lens_stock_id, 'nhap', NEW.so_luong,
    NEW.don_gia, NULL, 'lens_import', NEW.id, NULL, NULL, NULL, NEW.ghi_chu, NULL, TRUE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lens_import_update_stock ON lens_import;
CREATE TRIGGER trg_lens_import_update_stock
  AFTER INSERT ON lens_import
  FOR EACH ROW EXECUTE FUNCTION update_lens_stock_on_import();

-- 6.5 Xuất bán tròng kính (lens_export_sale) — snapshot giá vốn
CREATE OR REPLACE FUNCTION update_lens_stock_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM record_stock_movement(
    NEW.tenant_id, NEW.branch_id, 'trong', NEW.lens_stock_id, 'xuat_ban', -NEW.so_luong,
    NULL, NULL, 'lens_export_sale', NEW.id, NULL, NULL, NULL, NULL, NULL, TRUE
  );
  UPDATE lens_export_sale SET gia_von_snapshot = v_result.gia_von_bq WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lens_sale_update_stock ON lens_export_sale;
CREATE TRIGGER trg_lens_sale_update_stock
  AFTER INSERT ON lens_export_sale
  FOR EACH ROW EXECUTE FUNCTION update_lens_stock_on_sale();

-- 6.6 Xuất hỏng tròng kính (lens_export_damaged)
CREATE OR REPLACE FUNCTION update_lens_stock_on_damaged()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM record_stock_movement(
    NEW.tenant_id, NEW.branch_id, 'trong', NEW.lens_stock_id, 'xuat_huy', -NEW.so_luong,
    NULL, NULL, 'lens_export_damaged', NEW.id, NULL, NULL, NEW.ly_do, NEW.ghi_chu, NULL, FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lens_damaged_update_stock ON lens_export_damaged;
CREATE TRIGGER trg_lens_damaged_update_stock
  AFTER INSERT ON lens_export_damaged
  FOR EACH ROW EXECUTE FUNCTION update_lens_stock_on_damaged();

-- 6.7 Nhập kho gọng kính (frame_import) — nay có tính giá vốn bình quân (trước đây KHÔNG có)
CREATE OR REPLACE FUNCTION update_frame_stock_on_import()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM record_stock_movement(
    NEW.tenant_id, NEW.branch_id, 'gong', NEW.gong_kinh_id, 'nhap', NEW.so_luong,
    NEW.don_gia, NULL, 'frame_import', NEW.id, NULL, NULL, NULL, NEW.ghi_chu, NULL, TRUE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_frame_import_update_stock ON frame_import;
CREATE TRIGGER trg_frame_import_update_stock
  AFTER INSERT ON frame_import
  FOR EACH ROW EXECUTE FUNCTION update_frame_stock_on_import();

-- 6.8 Xuất gọng kính (frame_export) — snapshot giá vốn
CREATE OR REPLACE FUNCTION update_frame_stock_on_export()
RETURNS TRIGGER AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM record_stock_movement(
    NEW.tenant_id, NEW.branch_id, 'gong', NEW.gong_kinh_id, 'xuat_ban', -NEW.so_luong,
    NULL, NULL, 'frame_export', NEW.id, NULL, NULL, NULL, NULL, NULL, TRUE
  );
  UPDATE frame_export SET gia_von_snapshot = v_result.gia_von_bq WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_frame_export_update_stock ON frame_export;
CREATE TRIGGER trg_frame_export_update_stock
  AFTER INSERT ON frame_export
  FOR EACH ROW EXECUTE FUNCTION update_frame_stock_on_export();

-- 6.9 Nhập kho theo nhóm giá gọng (nhom_gia_gong_nhap)
CREATE OR REPLACE FUNCTION update_nhom_gia_on_import()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM record_stock_movement(
    NEW.tenant_id, NULL, 'nhom_gia_gong', NEW.nhom_gia_gong_id, 'nhap', NEW.so_luong,
    NEW.don_gia, NULL, 'nhom_gia_gong_nhap', NEW.id, NULL, NULL, NULL, NEW.ghi_chu, NULL, TRUE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_nhom_gia_gong_nhap ON nhom_gia_gong_nhap;
CREATE TRIGGER trg_nhom_gia_gong_nhap
  AFTER INSERT ON nhom_gia_gong_nhap
  FOR EACH ROW EXECUTE FUNCTION update_nhom_gia_on_import();

-- ====================================================================
-- PHẦN 7: BỌC LẠI CÁC RPC "adjust_*" (giữ nguyên chữ ký cũ để không phải sửa code
-- gọi ở don-kinh/index.ts) — nay đi qua record_stock_movement để có sổ kho + atomic.
-- QUAN TRỌNG: phải DROP bản cũ (2 tham số, từ V038/V039) trước khi tạo bản mới
-- (4 tham số) — nếu không Postgres sẽ giữ CẢ HAI hàm (overload theo chữ ký),
-- khiến các lệnh gọi cũ (2 tham số) vẫn chạy vào bản KHÔNG ghi sổ kho.
-- ====================================================================
DROP FUNCTION IF EXISTS adjust_lens_stock(INT, INT);
DROP FUNCTION IF EXISTS adjust_frame_stock(INT, INT);
DROP FUNCTION IF EXISTS adjust_nhom_gia_stock(INT, INT);

CREATE OR REPLACE FUNCTION adjust_lens_stock(
  p_lens_stock_id INT,
  p_delta INT,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id INT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_branch_id UUID;
  v_result RECORD;
BEGIN
  SELECT tenant_id, branch_id INTO v_tenant_id, v_branch_id FROM lens_stock WHERE id = p_lens_stock_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy lens_stock id=%', p_lens_stock_id;
  END IF;
  SELECT * INTO v_result FROM record_stock_movement(
    v_tenant_id, v_branch_id, 'trong', p_lens_stock_id,
    CASE WHEN p_delta >= 0 THEN 'hoan_tra' ELSE 'xuat_ban' END,
    p_delta, NULL, NULL, p_ref_type, p_ref_id, NULL, NULL, NULL, NULL, NULL, TRUE
  );
  RETURN v_result.ton_sau;
END;
$$;

CREATE OR REPLACE FUNCTION adjust_frame_stock(
  p_gong_kinh_id INT,
  p_delta INT,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id INT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_branch_id UUID;
  v_result RECORD;
BEGIN
  SELECT tenant_id, branch_id INTO v_tenant_id, v_branch_id FROM "GongKinh" WHERE id = p_gong_kinh_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy GongKinh id=%', p_gong_kinh_id;
  END IF;
  SELECT * INTO v_result FROM record_stock_movement(
    v_tenant_id, v_branch_id, 'gong', p_gong_kinh_id,
    CASE WHEN p_delta >= 0 THEN 'hoan_tra' ELSE 'xuat_ban' END,
    p_delta, NULL, NULL, p_ref_type, p_ref_id, NULL, NULL, NULL, NULL, NULL, TRUE
  );
  RETURN v_result.ton_sau;
END;
$$;

CREATE OR REPLACE FUNCTION adjust_nhom_gia_stock(
  p_nhom_id INT,
  p_delta INT,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id INT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_result RECORD;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM nhom_gia_gong WHERE id = p_nhom_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy nhom_gia_gong id=%', p_nhom_id;
  END IF;
  SELECT * INTO v_result FROM record_stock_movement(
    v_tenant_id, NULL, 'nhom_gia_gong', p_nhom_id,
    CASE WHEN p_delta >= 0 THEN 'hoan_tra' ELSE 'xuat_ban' END,
    p_delta, NULL, NULL, p_ref_type, p_ref_id, NULL, NULL, NULL, NULL, NULL, TRUE
  );
  RETURN v_result.ton_sau;
END;
$$;

-- PHẦN 8 (sửa lệch tên cột muc_ton_toi_thieu → muc_ton_can_co) không cần xử lý ở DB:
-- cột "muc_ton_toi_thieu" đã được RENAME hẳn thành "muc_ton_can_co" từ trước
-- (xem rename_lens_stock_columns.sql), nên các API còn query "muc_ton_toi_thieu"
-- (branches/inventory-overview.ts) đang lỗi cột không tồn tại. Sửa tại tầng API
-- (xem src/pages/api/branches/inventory-overview.ts) thay vì thêm lại cột cũ ở DB.

COMMIT;
