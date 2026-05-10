-- V058: Add done_at for ChoKham and audit logs for waiting-room cleanup

BEGIN;

ALTER TABLE "ChoKham"
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

-- Backfill done_at for historical completed cases so auto-cleanup can work immediately.
UPDATE "ChoKham"
SET done_at = COALESCE(done_at, now())
WHERE trangthai = 'đã_xong';

CREATE TABLE IF NOT EXISTS waiting_cleanup_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'admin', 'doctor', 'staff')),
  trigger_mode TEXT NOT NULL CHECK (trigger_mode IN ('manual', 'auto')),
  threshold_minutes INTEGER NOT NULL DEFAULT 0 CHECK (threshold_minutes >= 0),
  deleted_count INTEGER NOT NULL CHECK (deleted_count >= 0),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waiting_cleanup_logs_tenant_created
  ON waiting_cleanup_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_waiting_cleanup_logs_tenant_branch_created
  ON waiting_cleanup_logs (tenant_id, branch_id, created_at DESC);

ALTER TABLE waiting_cleanup_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waiting_cleanup_logs_select" ON waiting_cleanup_logs;
DROP POLICY IF EXISTS "waiting_cleanup_logs_insert" ON waiting_cleanup_logs;

CREATE POLICY "waiting_cleanup_logs_select" ON waiting_cleanup_logs
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
);

CREATE POLICY "waiting_cleanup_logs_insert" ON waiting_cleanup_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM tenantmembership
    WHERE user_id = auth.uid()
      AND tenant_id = waiting_cleanup_logs.tenant_id
      AND active = true
      AND role IN ('owner', 'admin', 'doctor', 'staff')
  )
);

COMMIT;
