-- ====================================================================
-- ĐỐI SOÁT TỒN KHO & LÃI (GĐ6)
-- Chạy các query dưới đây (SELECT-only, an toàn) để kiểm tra tính đúng đắn
-- của hệ thống xuất-nhập-tồn sau khi triển khai V087_stock_ledger_and_cleanup.sql.
-- Mọi kết quả trả về hàng (thay vì rỗng) đều là dấu hiệu CẦN KIỂM TRA LẠI.
-- ====================================================================

-- ---------------------------------------------------------------------
-- 1) ĐỐI SOÁT TỒN KHO: tồn hiện tại trên bảng danh mục phải bằng
--    tổng các giao dịch trong stock_movement (nguồn sự thật).
-- ---------------------------------------------------------------------

-- 1.1 Thuốc
SELECT
  t.id, t.tenthuoc, t.tonkho AS ton_tren_danh_muc,
  COALESCE(SUM(sm.so_luong), 0) AS ton_theo_so_kho,
  t.tonkho - COALESCE(SUM(sm.so_luong), 0) AS lech
FROM "Thuoc" t
LEFT JOIN stock_movement sm ON sm.loai_hang = 'thuoc' AND sm.stock_ref_id = t.id
GROUP BY t.id, t.tenthuoc, t.tonkho
HAVING t.tonkho - COALESCE(SUM(sm.so_luong), 0) <> 0
ORDER BY ABS(t.tonkho - COALESCE(SUM(sm.so_luong), 0)) DESC;

-- 1.2 Tròng kính (lens_stock)
SELECT
  ls.id, ht.ten_hang, ls.sph, ls.cyl, ls.add_power,
  ls.ton_hien_tai AS ton_tren_danh_muc,
  COALESCE(SUM(sm.so_luong), 0) AS ton_theo_so_kho,
  ls.ton_hien_tai - COALESCE(SUM(sm.so_luong), 0) AS lech
FROM lens_stock ls
JOIN "HangTrong" ht ON ht.id = ls.hang_trong_id
LEFT JOIN stock_movement sm ON sm.loai_hang = 'trong' AND sm.stock_ref_id = ls.id
GROUP BY ls.id, ht.ten_hang, ls.sph, ls.cyl, ls.add_power, ls.ton_hien_tai
HAVING ls.ton_hien_tai - COALESCE(SUM(sm.so_luong), 0) <> 0
ORDER BY ABS(ls.ton_hien_tai - COALESCE(SUM(sm.so_luong), 0)) DESC;

-- 1.3 Gọng kính
SELECT
  gk.id, gk.ten_gong, gk.ton_kho AS ton_tren_danh_muc,
  COALESCE(SUM(sm.so_luong), 0) AS ton_theo_so_kho,
  gk.ton_kho - COALESCE(SUM(sm.so_luong), 0) AS lech
FROM "GongKinh" gk
LEFT JOIN stock_movement sm ON sm.loai_hang = 'gong' AND sm.stock_ref_id = gk.id
GROUP BY gk.id, gk.ten_gong, gk.ton_kho
HAVING gk.ton_kho - COALESCE(SUM(sm.so_luong), 0) <> 0
ORDER BY ABS(gk.ton_kho - COALESCE(SUM(sm.so_luong), 0)) DESC;

-- 1.4 Nhóm giá gọng
SELECT
  ngg.id, ngg.ten_nhom, ngg.so_luong_ton AS ton_tren_danh_muc,
  COALESCE(SUM(sm.so_luong), 0) AS ton_theo_so_kho,
  ngg.so_luong_ton - COALESCE(SUM(sm.so_luong), 0) AS lech
FROM nhom_gia_gong ngg
LEFT JOIN stock_movement sm ON sm.loai_hang = 'nhom_gia_gong' AND sm.stock_ref_id = ngg.id
GROUP BY ngg.id, ngg.ten_nhom, ngg.so_luong_ton
HAVING ngg.so_luong_ton - COALESCE(SUM(sm.so_luong), 0) <> 0
ORDER BY ABS(ngg.so_luong_ton - COALESCE(SUM(sm.so_luong), 0)) DESC;

-- ---------------------------------------------------------------------
-- 2) TỒN KHO ÂM (nên rất hiếm sau khi p_allow_negative=FALSE cho hủy/kiểm kê;
--    xuất bán vẫn có thể âm tạm thời nếu bán trước khi nhập kịp — cần theo dõi).
-- ---------------------------------------------------------------------
SELECT 'thuoc' AS loai, id, tenthuoc AS ten, tonkho AS ton FROM "Thuoc" WHERE tonkho < 0
UNION ALL
SELECT 'trong', ls.id, ht.ten_hang || ' ' || ls.sph || '/' || ls.cyl, ls.ton_hien_tai
FROM lens_stock ls JOIN "HangTrong" ht ON ht.id = ls.hang_trong_id WHERE ls.ton_hien_tai < 0
UNION ALL
SELECT 'gong', id, ten_gong, ton_kho FROM "GongKinh" WHERE ton_kho < 0
UNION ALL
SELECT 'nhom_gia_gong', id, ten_nhom, so_luong_ton FROM nhom_gia_gong WHERE so_luong_ton < 0;

-- ---------------------------------------------------------------------
-- 3) TÍNH LIÊN TỤC CỦA SỔ KHO: với từng mặt hàng, ton_sau của giao dịch N
--    phải bằng ton_truoc của giao dịch N+1 (không có khoảng hở/ghi đè ngoài RPC).
-- ---------------------------------------------------------------------
WITH ordered AS (
  SELECT
    loai_hang, stock_ref_id, id, ton_truoc, ton_sau, created_at,
    LEAD(ton_truoc) OVER (PARTITION BY loai_hang, stock_ref_id ORDER BY created_at, id) AS next_ton_truoc,
    LEAD(id) OVER (PARTITION BY loai_hang, stock_ref_id ORDER BY created_at, id) AS next_id
  FROM stock_movement
)
SELECT * FROM ordered
WHERE next_id IS NOT NULL AND ton_sau <> next_ton_truoc;

-- ---------------------------------------------------------------------
-- 4) LÃI ĐƠN THUỐC: so sánh lãi tính từ snapshot (don_gia_von) với lãi tính
--    từ giá vốn HIỆN TẠI của danh mục — chênh lệch lớn nghĩa là giá nhập đã
--    đổi sau khi kê đơn (bình thường), nhưng nếu don_gia_von NULL toàn bộ thì
--    đơn thuốc cũ (trước V049) chưa có snapshot, báo cáo sẽ fallback về giá hiện tại.
SELECT
  ctd.donthuocid,
  COUNT(*) AS so_dong,
  SUM(CASE WHEN ctd.don_gia_von IS NULL THEN 1 ELSE 0 END) AS so_dong_thieu_snapshot
FROM "ChiTietDonThuoc" ctd
GROUP BY ctd.donthuocid
HAVING SUM(CASE WHEN ctd.don_gia_von IS NULL THEN 1 ELSE 0 END) > 0
ORDER BY ctd.donthuocid DESC
LIMIT 200;

-- ---------------------------------------------------------------------
-- 5) LÃI ĐƠN KÍNH: đơn có gianhap_trong/gianhap_gong = 0 nhưng giatrong/giagong > 0
--    (có thể do chưa xử lý kho được / hàng DAT_KHI_CO_KHACH / nhóm giá chưa có gia_nhap_trung_binh)
-- ---------------------------------------------------------------------
SELECT id, ngaykham, giatrong, giagong, gianhap_trong, gianhap_gong, lai
FROM "DonKinh"
WHERE (giatrong > 0 AND COALESCE(gianhap_trong, 0) = 0)
   OR (giagong > 0 AND COALESCE(gianhap_gong, 0) = 0)
ORDER BY ngaykham DESC
LIMIT 200;

-- ---------------------------------------------------------------------
-- 6) KIỂM TRA HOÀN KHO KHI SỬA/XÓA ĐƠN KÍNH: mỗi đơn kính bị sửa/xóa sẽ ghi
--    hoan_tra với ref_type='don_kinh_reversal' và ref_id=don_kinh_id (xem
--    reverseInventory() trong don-kinh/index.ts và benh-nhan/index.ts).
--    Giao dịch xuất bán gốc lại có ref_id = id dòng lens_export_sale/frame_export
--    (không phải don_kinh_id trực tiếp) nên phải JOIN qua bảng chi tiết để so khớp.
-- ---------------------------------------------------------------------
WITH xuat_goc AS (
  SELECT 'trong' AS loai_hang, les.don_kinh_id, sm.so_luong
  FROM stock_movement sm
  JOIN lens_export_sale les ON les.id = sm.ref_id AND sm.ref_type = 'lens_export_sale'
  WHERE sm.loai_giao_dich = 'xuat_ban'
  UNION ALL
  SELECT 'gong', fe.don_kinh_id, sm.so_luong
  FROM stock_movement sm
  JOIN frame_export fe ON fe.id = sm.ref_id AND sm.ref_type = 'frame_export'
  WHERE sm.loai_giao_dich = 'xuat_ban'
),
hoan_tra AS (
  SELECT loai_hang, ref_id AS don_kinh_id, so_luong
  FROM stock_movement
  WHERE loai_giao_dich = 'hoan_tra' AND ref_type = 'don_kinh_reversal'
)
SELECT
  COALESCE(x.don_kinh_id, h.don_kinh_id) AS don_kinh_id,
  COALESCE(x.loai_hang, h.loai_hang) AS loai_hang,
  COALESCE(SUM(x.so_luong), 0) AS tong_xuat,
  COALESCE(SUM(h.so_luong), 0) AS tong_hoan,
  COALESCE(SUM(x.so_luong), 0) + COALESCE(SUM(h.so_luong), 0) AS net
FROM xuat_goc x
FULL OUTER JOIN hoan_tra h ON h.don_kinh_id = x.don_kinh_id AND h.loai_hang = x.loai_hang
GROUP BY COALESCE(x.don_kinh_id, h.don_kinh_id), COALESCE(x.loai_hang, h.loai_hang)
HAVING COALESCE(SUM(x.so_luong), 0) + COALESCE(SUM(h.so_luong), 0) <> 0
   AND COALESCE(SUM(h.so_luong), 0) <> 0 -- chỉ xét đơn ĐÃ có hoàn kho (đơn chưa sửa/xóa thì net xuất luôn <0, không phải bất thường)
ORDER BY ABS(COALESCE(SUM(x.so_luong), 0) + COALESCE(SUM(h.so_luong), 0)) DESC
LIMIT 200;

-- ---------------------------------------------------------------------
-- 7) TỔNG QUAN GIÁ TRỊ TỒN KHO HIỆN TẠI (theo giá vốn bình quân)
-- ---------------------------------------------------------------------
SELECT
  (SELECT COALESCE(SUM(tonkho * gianhap), 0) FROM "Thuoc" WHERE tonkho > 0) AS gia_tri_ton_thuoc,
  (SELECT COALESCE(SUM(ton_hien_tai * gia_nhap_bq), 0) FROM lens_stock WHERE ton_hien_tai > 0) AS gia_tri_ton_trong,
  (SELECT COALESCE(SUM(ton_kho * gia_nhap), 0) FROM "GongKinh" WHERE ton_kho > 0) AS gia_tri_ton_gong,
  (SELECT COALESCE(SUM(so_luong_ton * gia_nhap_trung_binh), 0) FROM nhom_gia_gong WHERE so_luong_ton > 0) AS gia_tri_ton_nhom_gia_gong;
