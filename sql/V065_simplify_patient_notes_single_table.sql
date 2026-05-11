-- V065: Simplify patient notes to a single table (non-destructive)
-- This migration is additive:
-- 1) Create patient_notes_simple as the new single source for notes.
-- 2) Backfill from patient_alerts + patient_contact_tasks.
-- 3) Keep V063/V064 tables intact for safe rollback.

CREATE TABLE IF NOT EXISTS patient_notes_simple (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  benhnhan_id INTEGER NOT NULL REFERENCES "BenhNhan"(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL DEFAULT 'normal_note' CHECK (note_type IN ('important_alert', 'normal_note')),
  title TEXT NULL,
  content TEXT NOT NULL,
  source_legacy_table TEXT NULL,
  source_legacy_id BIGINT NULL,
  deleted_at TIMESTAMPTZ NULL,
  deleted_by UUID NULL,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_notes_simple_lookup
  ON patient_notes_simple (tenant_id, benhnhan_id, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_notes_simple_type
  ON patient_notes_simple (tenant_id, note_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_notes_simple_legacy
  ON patient_notes_simple (tenant_id, source_legacy_table, source_legacy_id);

DO $$
BEGIN
  IF to_regclass('public.patient_alerts') IS NOT NULL THEN
    INSERT INTO patient_notes_simple (
      tenant_id,
      branch_id,
      benhnhan_id,
      note_type,
      title,
      content,
      source_legacy_table,
      source_legacy_id,
      deleted_at,
      deleted_by,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    SELECT
      a.tenant_id,
      a.branch_id,
      a.benhnhan_id,
      CASE WHEN a.severity = 'high' THEN 'important_alert' ELSE 'normal_note' END,
      NULLIF(TRIM(a.title), ''),
      COALESCE(NULLIF(TRIM(a.content), ''), a.title),
      'patient_alerts',
      a.id,
      a.deleted_at,
      a.deleted_by,
      a.created_by,
      a.updated_by,
      a.created_at,
      a.updated_at
    FROM patient_alerts a
    ON CONFLICT (tenant_id, source_legacy_table, source_legacy_id) DO NOTHING;
  END IF;

  IF to_regclass('public.patient_contact_tasks') IS NOT NULL THEN
    INSERT INTO patient_notes_simple (
      tenant_id,
      branch_id,
      benhnhan_id,
      note_type,
      title,
      content,
      source_legacy_table,
      source_legacy_id,
      deleted_at,
      deleted_by,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    SELECT
      t.tenant_id,
      t.branch_id,
      t.benhnhan_id,
      CASE
        WHEN t.status IN ('pending', 'waiting_stock', 'ready_to_call') THEN 'important_alert'
        ELSE 'normal_note'
      END,
      NULLIF(TRIM(t.title), ''),
      TRIM(BOTH E'\n' FROM CONCAT_WS(E'\n',
        NULLIF(TRIM(t.details), ''),
        CASE WHEN t.task_type IS NOT NULL THEN 'Loại: ' || t.task_type ELSE NULL END,
        CASE WHEN t.status IS NOT NULL THEN 'Trạng thái: ' || t.status ELSE NULL END,
        CASE WHEN t.due_at IS NOT NULL THEN 'Hạn liên hệ: ' || to_char(t.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') ELSE NULL END,
        CASE WHEN t.result_note IS NOT NULL AND TRIM(t.result_note) <> '' THEN 'Kết quả: ' || t.result_note ELSE NULL END
      )),
      'patient_contact_tasks',
      t.id,
      t.deleted_at,
      t.deleted_by,
      t.created_by,
      t.updated_by,
      t.created_at,
      t.updated_at
    FROM patient_contact_tasks t
    ON CONFLICT (tenant_id, source_legacy_table, source_legacy_id) DO NOTHING;
  END IF;
END $$;
