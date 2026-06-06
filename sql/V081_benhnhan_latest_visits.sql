-- V081: Hàm lấy ngày khám gần nhất theo danh sách bệnh nhân (tối ưu load trang Bệnh nhân)
CREATE OR REPLACE FUNCTION benhnhan_latest_visits(
  p_tenant_id uuid,
  p_patient_ids integer[]
)
RETURNS TABLE(benhnhanid integer, ngay_kham_gan_nhat timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT benhnhanid, MAX(last_date) AS ngay_kham_gan_nhat
  FROM (
    SELECT d.benhnhanid, d.ngay_kham AS last_date
    FROM "DonThuoc" d
    WHERE d.tenant_id = p_tenant_id
      AND d.benhnhanid = ANY(p_patient_ids)
      AND d.ngay_kham IS NOT NULL
    UNION ALL
    SELECT k.benhnhanid, k.ngaykham AS last_date
    FROM "DonKinh" k
    WHERE k.tenant_id = p_tenant_id
      AND k.benhnhanid = ANY(p_patient_ids)
      AND k.ngaykham IS NOT NULL
  ) visits
  GROUP BY benhnhanid;
$$;
