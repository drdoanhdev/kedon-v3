-- File: sql/merge_patients.sql

-- Xóa hàm cũ đi để tránh lỗi khi thay đổi tham số
DROP FUNCTION IF EXISTS merge_patients(integer, integer[]);

-- Tạo lại hàm với logic đúng và tên bảng chính xác
CREATE OR REPLACE FUNCTION merge_patients(p_main_patient_id INT, p_merged_patient_ids INT[])
RETURNS JSONB AS $$
DECLARE
  total_don_thuoc_moved INT := 0;
  total_don_kinh_moved INT := 0;
  total_dien_tien_moved INT := 0;
  total_patients_deleted INT := 0;
BEGIN
  -- Ensure the main patient is not in the list of patients to be merged
  IF p_main_patient_id = ANY(p_merged_patient_ids) THEN
    RAISE EXCEPTION 'Bệnh nhân chính không thể nằm trong danh sách bệnh nhân cần gộp.';
  END IF;

  -- 1. Update "DonThuoc" table
  UPDATE "DonThuoc"
  SET benhnhanid = p_main_patient_id
  WHERE benhnhanid = ANY(p_merged_patient_ids);
  GET DIAGNOSTICS total_don_thuoc_moved = ROW_COUNT;

  -- 2. Update "DonKinh" table
  UPDATE "DonKinh"
  SET benhnhanid = p_main_patient_id
  WHERE benhnhanid = ANY(p_merged_patient_ids);
  GET DIAGNOSTICS total_don_kinh_moved = ROW_COUNT;

  -- 3. Update "DienTien" table
  UPDATE "DienTien"
  SET benhnhanid = p_main_patient_id
  WHERE benhnhanid = ANY(p_merged_patient_ids);
  GET DIAGNOSTICS total_dien_tien_moved = ROW_COUNT;

  -- 4. Delete the merged patients from "BenhNhan" table
  DELETE FROM "BenhNhan"
  WHERE id = ANY(p_merged_patient_ids);
  GET DIAGNOSTICS total_patients_deleted = ROW_COUNT;

  -- Return a summary of the operations
  RETURN jsonb_build_object(
    'success', TRUE,
    'mainPatientId', p_main_patient_id,
    'mergedCount', array_length(p_merged_patient_ids, 1),
    'donThuocMoved', total_don_thuoc_moved,
    'donKinhMoved', total_don_kinh_moved,
    'dienTienMoved', total_dien_tien_moved,
    'patientsDeleted', total_patients_deleted
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If any error occurs, raise an exception with a detailed message
    RAISE EXCEPTION 'Lỗi khi gộp bệnh nhân: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
