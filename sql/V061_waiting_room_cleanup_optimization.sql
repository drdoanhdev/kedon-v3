-- V061: Waiting-room cleanup optimization follow-up
-- Safe to run after V060. Reduces RPC overhead and tightens log query support.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_waiting_cleanup_logs_tenant_actor_created
  ON waiting_cleanup_logs (tenant_id, actor_role, created_at DESC);

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
  WITH deleted AS (
    DELETE FROM "ChoKham" c
    WHERE c.trangthai = 'đã_xong'
      AND c.done_at IS NOT NULL
      AND c.done_at <= now() - make_interval(mins => v_threshold)
      AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
      AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
    RETURNING c.tenant_id, c.branch_id
  ), grouped AS (
    SELECT tenant_id, branch_id, COUNT(*)::INTEGER AS deleted_count
    FROM deleted
    GROUP BY tenant_id, branch_id
  ), inserted_logs AS (
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
      deleted_count,
      COALESCE(p_details, '{}'::jsonb)
    FROM grouped
    RETURNING deleted_count
  )
  SELECT COALESCE(SUM(deleted_count), 0)
  INTO v_deleted
  FROM deleted;

  RETURN v_deleted;
END;
$$;

COMMIT;
