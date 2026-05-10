-- V062: Waiting-room cleanup log archival
-- Safe to run after V061. Moves old audit rows out of the hot table into an archive table.

BEGIN;

CREATE TABLE IF NOT EXISTS waiting_cleanup_logs_archive (
  id BIGSERIAL PRIMARY KEY,
  source_log_id BIGINT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'admin', 'doctor', 'staff', 'system')),
  trigger_mode TEXT NOT NULL CHECK (trigger_mode IN ('manual', 'auto')),
  threshold_minutes INTEGER NOT NULL DEFAULT 0 CHECK (threshold_minutes >= 0),
  deleted_count INTEGER NOT NULL CHECK (deleted_count >= 0),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waiting_cleanup_logs_archive_tenant_created
  ON waiting_cleanup_logs_archive (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_waiting_cleanup_logs_archive_tenant_archived
  ON waiting_cleanup_logs_archive (tenant_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_waiting_cleanup_logs_archive_tenant_role_created
  ON waiting_cleanup_logs_archive (tenant_id, actor_role, created_at DESC);

ALTER TABLE waiting_cleanup_logs_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waiting_cleanup_logs_archive_select" ON waiting_cleanup_logs_archive;
DROP POLICY IF EXISTS "waiting_cleanup_logs_archive_insert" ON waiting_cleanup_logs_archive;

CREATE POLICY "waiting_cleanup_logs_archive_select" ON waiting_cleanup_logs_archive
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
);

CREATE POLICY "waiting_cleanup_logs_archive_insert" ON waiting_cleanup_logs_archive
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM tenantmembership
    WHERE user_id = auth.uid()
      AND tenant_id = waiting_cleanup_logs_archive.tenant_id
      AND active = true
      AND role IN ('owner', 'admin', 'doctor')
  )
);

CREATE OR REPLACE FUNCTION archive_waiting_cleanup_logs(
  p_retention_days INTEGER DEFAULT 90,
  p_tenant_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_retention_days INTEGER := GREATEST(COALESCE(p_retention_days, 1), 1);
  v_archived BIGINT := 0;
  v_cutoff TIMESTAMPTZ := now() - make_interval(days => v_retention_days);
BEGIN
  WITH deleted AS (
    DELETE FROM waiting_cleanup_logs l
    WHERE l.created_at < v_cutoff
      AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
      AND (p_branch_id IS NULL OR l.branch_id = p_branch_id)
    RETURNING
      l.id,
      l.tenant_id,
      l.branch_id,
      l.actor_user_id,
      l.actor_email,
      l.actor_role,
      l.trigger_mode,
      l.threshold_minutes,
      l.deleted_count,
      l.details,
      l.created_at
  ), archived AS (
    INSERT INTO waiting_cleanup_logs_archive (
      source_log_id,
      tenant_id,
      branch_id,
      actor_user_id,
      actor_email,
      actor_role,
      trigger_mode,
      threshold_minutes,
      deleted_count,
      details,
      created_at
    )
    SELECT
      id,
      tenant_id,
      branch_id,
      actor_user_id,
      actor_email,
      actor_role,
      trigger_mode,
      threshold_minutes,
      deleted_count,
      details,
      created_at
    FROM deleted
    RETURNING 1
  )
  SELECT COUNT(*)::BIGINT INTO v_archived FROM archived;

  RETURN v_archived;
END;
$$;

COMMIT;
