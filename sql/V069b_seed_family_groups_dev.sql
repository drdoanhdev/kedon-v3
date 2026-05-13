-- V069b: Seed sample family — CHỈ CHẠY TRÊN DEV (Optigo).
-- Yêu cầu: tồn tại tenant + 4 bệnh nhân (BenhNhan.id) trong cùng tenant.
-- Cách dùng:
--   psql ... -v tenant='00000000-0000-0000-0000-000000000000' \
--            -v p1=1001 -v p2=1002 -v p3=1003 -v p4=1004 \
--            -f sql/V069b_seed_family_groups_dev.sql
-- Hoặc sửa các giá trị mặc định dưới đây trước khi chạy.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_tenant UUID := COALESCE(NULLIF(current_setting('myvars.tenant', true), ''), NULL)::UUID;
  v_p1 INT := COALESCE(NULLIF(current_setting('myvars.p1', true), '')::INT, NULL);
  v_p2 INT := COALESCE(NULLIF(current_setting('myvars.p2', true), '')::INT, NULL);
  v_p3 INT := COALESCE(NULLIF(current_setting('myvars.p3', true), '')::INT, NULL);
  v_p4 INT := COALESCE(NULLIF(current_setting('myvars.p4', true), '')::INT, NULL);
  v_group_id UUID;
BEGIN
  -- Fallback: lấy tenant đầu tiên có ≥ 4 bệnh nhân
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant
    FROM "BenhNhan"
    GROUP BY tenant_id
    HAVING COUNT(*) >= 4
    ORDER BY COUNT(*) DESC
    LIMIT 1;
  END IF;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Bỏ qua seed: không có tenant nào có >= 4 bệnh nhân.';
    RETURN;
  END IF;

  -- Lấy 4 bệnh nhân đầu của tenant nếu chưa truyền tham số
  IF v_p1 IS NULL OR v_p2 IS NULL OR v_p3 IS NULL OR v_p4 IS NULL THEN
    SELECT id INTO v_p1 FROM "BenhNhan" WHERE tenant_id = v_tenant ORDER BY id ASC LIMIT 1;
    SELECT id INTO v_p2 FROM "BenhNhan" WHERE tenant_id = v_tenant AND id <> v_p1 ORDER BY id ASC LIMIT 1;
    SELECT id INTO v_p3 FROM "BenhNhan" WHERE tenant_id = v_tenant AND id NOT IN (v_p1, v_p2) ORDER BY id ASC LIMIT 1;
    SELECT id INTO v_p4 FROM "BenhNhan" WHERE tenant_id = v_tenant AND id NOT IN (v_p1, v_p2, v_p3) ORDER BY id ASC LIMIT 1;
  END IF;

  -- Kiểm tra bệnh nhân nào đã thuộc family rồi thì bỏ qua (UNIQUE)
  IF EXISTS (
    SELECT 1 FROM family_members WHERE benhnhan_id IN (v_p1, v_p2, v_p3, v_p4)
  ) THEN
    RAISE NOTICE 'Bỏ qua seed: 1+ bệnh nhân đã có family.';
    RETURN;
  END IF;

  INSERT INTO family_groups (tenant_id, name, phone, note)
  VALUES (v_tenant, 'Gia đình anh Hùng (seed dev)', '0912345678', 'Sample seed V069b')
  RETURNING id INTO v_group_id;

  INSERT INTO family_members (tenant_id, family_group_id, benhnhan_id, role, is_primary) VALUES
    (v_tenant, v_group_id, v_p1, 'father', TRUE),
    (v_tenant, v_group_id, v_p2, 'mother', FALSE),
    (v_tenant, v_group_id, v_p3, 'child',  FALSE),
    (v_tenant, v_group_id, v_p4, 'child',  FALSE);

  RAISE NOTICE '✅ Seed thành công family_group=% với 4 thành viên', v_group_id;
END $$;
