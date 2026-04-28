-- V043 Part 6: Function tạo branch mặc định
-- Dùng cú pháp quote đơn (không dùng $$ hay $body$) để tránh lỗi Supabase Dashboard

CREATE OR REPLACE FUNCTION create_default_branch_for_tenant(p_tenant_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS '
DECLARE
  v_branch_id UUID;
  v_tenant_name TEXT;
BEGIN
  SELECT id INTO v_branch_id FROM branches WHERE tenant_id = p_tenant_id AND is_main = TRUE;
  IF v_branch_id IS NOT NULL THEN
    RETURN v_branch_id;
  END IF;

  SELECT name INTO v_tenant_name FROM tenants WHERE id = p_tenant_id;

  INSERT INTO branches (tenant_id, ten_chi_nhanh, is_main, status)
  VALUES (p_tenant_id, COALESCE(v_tenant_name, ''Chi nhánh chính''), TRUE, ''active'')
  RETURNING id INTO v_branch_id;

  UPDATE "BenhNhan" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE "DonThuoc" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE "DonKinh" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE lens_stock SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE "Thuoc" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
  UPDATE "GongKinh" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;

  INSERT INTO staff_assignments (tenant_id, user_id, branch_id, is_primary)
  SELECT p_tenant_id, user_id, v_branch_id, TRUE
  FROM tenantmembership
  WHERE tenant_id = p_tenant_id AND active = TRUE
  ON CONFLICT DO NOTHING;

  RETURN v_branch_id;
END;
';
