-- ====================================================================
-- V088: Cấp phát mã bệnh nhân BN##### theo tenant (SaaS-safe)
-- ====================================================================
-- - Counter atomics per tenant (tránh race MAX+1)
-- - Trigger BEFORE INSERT tự gán mabenhnhan nếu null/empty
-- - Chuẩn hoá mã trùng theo (tenant_id, mabenhnhan) TRƯỚC khi tạo unique index
-- - Backfill BN cũ thiếu mã
-- - Drop unique index global cũ (V013) nếu còn sót; giữ unique theo tenant
-- An toàn chạy lại: dedup/backfill idempotent; CREATE UNIQUE INDEX IF NOT EXISTS.
-- ====================================================================

BEGIN;

-- 1) Counter table
CREATE TABLE IF NOT EXISTS patient_code_counters (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS bật, không có policy cho authenticated → chỉ service_role / SECURITY DEFINER mới ghi được.
ALTER TABLE patient_code_counters ENABLE ROW LEVEL SECURITY;

-- 2) Format helper: BN00001 … BN99999; từ 100000 trở đi không pad (tránh LPAD truncate)
CREATE OR REPLACE FUNCTION format_patient_code(p_num integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_num IS NULL OR p_num < 1 THEN NULL
    WHEN p_num < 100000 THEN 'BN' || lpad(p_num::text, 5, '0')
    ELSE 'BN' || p_num::text
  END;
$$;

-- 3) Atomic allocator
CREATE OR REPLACE FUNCTION allocate_patient_code(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required to allocate patient code';
  END IF;

  INSERT INTO patient_code_counters (tenant_id, last_value, updated_at)
  VALUES (p_tenant_id, 1, now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET last_value = patient_code_counters.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO v_next;

  IF v_next IS NULL OR v_next < 1 THEN
    RAISE EXCEPTION 'Failed to allocate patient code for tenant %', p_tenant_id;
  END IF;

  RETURN format_patient_code(v_next);
END;
$$;

REVOKE ALL ON FUNCTION allocate_patient_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allocate_patient_code(uuid) TO service_role;
-- Trigger chạy SECURITY DEFINER nên không cần grant cho authenticated.

-- 4) BEFORE INSERT trigger — mọi đường insert đều có mã
CREATE OR REPLACE FUNCTION trg_benhnhan_assign_mabenhnhan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'BenhNhan.tenant_id is required';
  END IF;

  IF NEW.mabenhnhan IS NULL OR btrim(NEW.mabenhnhan) = '' THEN
    NEW.mabenhnhan := allocate_patient_code(NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS benhnhan_assign_mabenhnhan ON "BenhNhan";
CREATE TRIGGER benhnhan_assign_mabenhnhan
  BEFORE INSERT ON "BenhNhan"
  FOR EACH ROW
  EXECUTE FUNCTION trg_benhnhan_assign_mabenhnhan();

-- 5) Drop unique index cũ (global / tenant) — CHƯA tạo lại cho đến khi dữ liệu sạch
DROP INDEX IF EXISTS uniq_benhnhan_mabenhnhan_notnull;
DROP INDEX IF EXISTS "idx_benhnhan_mabenhnhan_unique";
DROP INDEX IF EXISTS "BenhNhan_mabenhnhan_key";
DROP INDEX IF EXISTS idx_benhnhan_tenant_mabenhnhan_unique;

-- 6) Seed counter + chuẩn hoá trùng + backfill null/empty — RỒI mới tạo unique
DO $$
DECLARE
  r RECORD;
  v_max integer;
  v_row RECORD;
  v_dup_fixed integer := 0;
  v_null_fixed integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(923451, 20260712);

  FOR r IN
    SELECT DISTINCT tenant_id
    FROM "BenhNhan"
    WHERE tenant_id IS NOT NULL
  LOOP
    -- 6a) Seed counter từ max mã BN\d+ hiện có (trước khi cấp mã mới)
    SELECT COALESCE(MAX(
      CASE
        WHEN mabenhnhan ~ '^BN[0-9]+$'
          THEN (substring(mabenhnhan from 3))::integer
        ELSE 0
      END
    ), 0)
    INTO v_max
    FROM "BenhNhan"
    WHERE tenant_id = r.tenant_id;

    INSERT INTO patient_code_counters (tenant_id, last_value, updated_at)
    VALUES (r.tenant_id, v_max, now())
    ON CONFLICT (tenant_id) DO UPDATE
      SET last_value = GREATEST(patient_code_counters.last_value, EXCLUDED.last_value),
          updated_at = now();

    -- 6b) Chuẩn hoá mã trùng trong tenant: giữ bản ghi id nhỏ nhất, cấp mã mới cho phần dư
    --     (Sáng Mắt đã có case BN07068 trùng → chặn unique index nếu bỏ qua bước này)
    FOR v_row IN
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY tenant_id, mabenhnhan
                 ORDER BY id ASC
               ) AS rn
        FROM "BenhNhan"
        WHERE tenant_id = r.tenant_id
          AND mabenhnhan IS NOT NULL
          AND btrim(mabenhnhan) <> ''
      ) d
      WHERE rn > 1
      ORDER BY id ASC
    LOOP
      UPDATE "BenhNhan"
      SET mabenhnhan = allocate_patient_code(r.tenant_id)
      WHERE id = v_row.id;
      v_dup_fixed := v_dup_fixed + 1;
    END LOOP;

    -- 6c) Backfill mã thiếu / rỗng
    FOR v_row IN
      SELECT id
      FROM "BenhNhan"
      WHERE tenant_id = r.tenant_id
        AND (mabenhnhan IS NULL OR btrim(mabenhnhan) = '')
      ORDER BY id ASC
    LOOP
      UPDATE "BenhNhan"
      SET mabenhnhan = allocate_patient_code(r.tenant_id)
      WHERE id = v_row.id;
      v_null_fixed := v_null_fixed + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'V088: reassigned % duplicate codes, backfilled % empty codes', v_dup_fixed, v_null_fixed;
END $$;

-- 7) Unique theo tenant — chỉ chạy sau khi dữ liệu đã sạch
CREATE UNIQUE INDEX IF NOT EXISTS idx_benhnhan_tenant_mabenhnhan_unique
  ON "BenhNhan" (tenant_id, mabenhnhan)
  WHERE mabenhnhan IS NOT NULL;

COMMIT;
