-- ====================================================================
-- V038: Atomic stock adjustment functions
-- Tránh race condition khi nhiều request cùng cập nhật tồn kho
-- ====================================================================

-- Điều chỉnh lens_stock.ton_hien_tai một cách atomic
-- p_delta > 0: cộng (hoàn kho), p_delta < 0: trừ (xuất kho)
CREATE OR REPLACE FUNCTION adjust_lens_stock(p_lens_stock_id INT, p_delta INT)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE lens_stock
  SET ton_hien_tai = ton_hien_tai + p_delta,
      updated_at = now()
  WHERE id = p_lens_stock_id
  RETURNING ton_hien_tai;
$$;

-- Điều chỉnh GongKinh.ton_kho một cách atomic
-- p_delta > 0: cộng (hoàn kho), p_delta < 0: trừ (xuất kho)
CREATE OR REPLACE FUNCTION adjust_frame_stock(p_gong_kinh_id INT, p_delta INT)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE "GongKinh"
  SET ton_kho = COALESCE(ton_kho, 0) + p_delta
  WHERE id = p_gong_kinh_id
  RETURNING ton_kho;
$$;
