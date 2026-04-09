-- File: sql/V012_merge_patients.sql

-- Xóa hàm cũ đi để tránh lỗi khi thay đổi tham số
DROP FUNCTION IF EXISTS merge_patients(integer, integer[]);
DROP FUNCTION IF EXISTS merge_patients(integer, integer[], uuid);

-- Tạo lại hàm với logic đúng, tên bảng chính xác, và lọc theo tenant_id
CREATE OR REPLACE FUNCTION merge_patients(
  p_main_patient_id INT,
  p_merged_patient_ids INT[],
  p_tenant_id UUID
)
RETURNS JSONB AS $$
DECLARE
  total_don_thuoc_moved INT := 0;
  total_don_kinh_moved INT := 0;
  total_dien_tien_moved INT := 0;
  total_hen_kham_moved INT := 0;
  total_patients_deleted INT := 0;
  v_main_exists BOOLEAN;
BEGIN
  -- Ensure the main patient is not in the list of patients to be merged
  IF p_main_patient_id = ANY(p_merged_patient_ids) THEN
    RAISE EXCEPTION 'Bệnh nhân chính không thể nằm trong danh sách bệnh nhân cần gộp.';
  END IF;

  -- Verify main patient belongs to this tenant
  SELECT EXISTS(
    SELECT 1 FROM "BenhNhan" WHERE id = p_main_patient_id AND tenant_id = p_tenant_id
  ) INTO v_main_exists;

  IF NOT v_main_exists THEN
    RAISE EXCEPTION 'Bệnh nhân chính không tồn tại hoặc không thuộc phòng khám này.';
  END IF;

  -- 1. Update "DonThuoc" table (only records belonging to this tenant)
  UPDATE "DonThuoc"
  SET benhnhanid = p_main_patient_id
  WHERE benhnhanid = ANY(p_merged_patient_ids)
    AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS total_don_thuoc_moved = ROW_COUNT;

  -- 2. Update "DonKinh" table
  UPDATE "DonKinh"
  SET benhnhanid = p_main_patient_id
  WHERE benhnhanid = ANY(p_merged_patient_ids)
    AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS total_don_kinh_moved = ROW_COUNT;

  -- 3. Update "DienTien" table
  UPDATE "DienTien"
  SET benhnhanid = p_main_patient_id
  WHERE benhnhanid = ANY(p_merged_patient_ids)
    AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS total_dien_tien_moved = ROW_COUNT;

  -- 4. Update "hen_kham_lai" table
  UPDATE hen_kham_lai
  SET benhnhanid = p_main_patient_id
  WHERE benhnhanid = ANY(p_merged_patient_ids)
    AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS total_hen_kham_moved = ROW_COUNT;

  -- 5. Delete the merged patients from "BenhNhan" table (only this tenant)
  DELETE FROM "BenhNhan"
  WHERE id = ANY(p_merged_patient_ids)
    AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS total_patients_deleted = ROW_COUNT;

  -- Return a summary of the operations
  RETURN jsonb_build_object(
    'success', TRUE,
    'mainPatientId', p_main_patient_id,
    'mergedCount', array_length(p_merged_patient_ids, 1),
    'donThuocMoved', total_don_thuoc_moved,
    'donKinhMoved', total_don_kinh_moved,
    'dienTienMoved', total_dien_tien_moved,
    'henKhamMoved', total_hen_kham_moved,
    'patientsDeleted', total_patients_deleted
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Lỗi khi gộp bệnh nhân: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
