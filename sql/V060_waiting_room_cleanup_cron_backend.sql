-- V060: Waiting-room cleanup cron backend
-- Safe to run after V059. Introduces DB cleanup RPC used by manual and cron jobs.

BEGIN;

ALTER TABLE waiting_cleanup_logs
  DROP CONSTRAINT IF EXISTS waiting_cleanup_logs_actor_role_check;

ALTER TABLE waiting_cleanup_logs
  ADD CONSTRAINT waiting_cleanup_logs_actor_role_check
  CHECK (actor_role IN ('owner', 'admin', 'doctor', 'staff', 'system'));

CREATE OR REPLACE FUNCTION cleanup_waiting_room_done_cases(
  p_threshold_minutes INTEGER DEFAULT 30,
  p_tenant_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_trigger_mode TEXT DEFAULT 'auto',
  p_actor_role TEXT DEFAULT 'system',
  p_actor_user_id UUID DEFAULT NULL,
  p_actor_email TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_threshold INTEGER := GREATEST(COALESCE(p_threshold_minutes, 0), 0);
  v_deleted BIGINT := 0;
BEGIN
  CREATE TEMP TABLE tmp_waiting_cleanup_deleted_rows (
    tenant_id UUID NOT NULL,
    branch_id UUID
  ) ON COMMIT DROP;

  WITH deleted AS (
    DELETE FROM "ChoKham" c
    WHERE c.trangthai = 'đã_xong'
      AND c.done_at IS NOT NULL
      AND c.done_at <= now() - make_interval(mins => v_threshold)
      AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
      AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
    RETURNING c.tenant_id, c.branch_id
  )
  INSERT INTO tmp_waiting_cleanup_deleted_rows (tenant_id, branch_id)
  SELECT tenant_id, branch_id
  FROM deleted;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    INSERT INTO waiting_cleanup_logs (
      tenant_id,
      branch_id,
      actor_user_id,
      actor_email,
      actor_role,
      trigger_mode,
      threshold_minutes,
      deleted_count,
      details
    )
    SELECT
      tenant_id,
      branch_id,
      p_actor_user_id,
      p_actor_email,
      p_actor_role,
      p_trigger_mode,
      v_threshold,
      COUNT(*)::INTEGER,
      COALESCE(p_details, '{}'::jsonb)
    FROM tmp_waiting_cleanup_deleted_rows
    GROUP BY tenant_id, branch_id;
  END IF;

  RETURN v_deleted;
END;
$$;

COMMIT;
