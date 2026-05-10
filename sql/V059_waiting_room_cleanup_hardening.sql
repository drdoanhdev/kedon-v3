-- V059: Follow-up hardening for waiting-room cleanup after V058
-- Safe to run after V058; only adds/refreshes optimization objects.

BEGIN;

ALTER TABLE "ChoKham"
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cho_kham_tenant_branch_status_done_at
  ON "ChoKham" (tenant_id, branch_id, trangthai, done_at DESC);

CREATE INDEX IF NOT EXISTS idx_cho_kham_tenant_done_at
  ON "ChoKham" (tenant_id, done_at DESC)
  WHERE trangthai = 'đã_xong';

CREATE OR REPLACE FUNCTION cho_kham_sync_done_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trangthai = 'đã_xong' THEN
    NEW.done_at := COALESCE(NEW.done_at, now());
  ELSE
    NEW.done_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cho_kham_sync_done_at ON "ChoKham";
CREATE TRIGGER trg_cho_kham_sync_done_at
  BEFORE INSERT OR UPDATE ON "ChoKham"
  FOR EACH ROW EXECUTE FUNCTION cho_kham_sync_done_at();

-- Backfill done_at for historical completed cases so auto-cleanup works immediately.
UPDATE "ChoKham"
SET done_at = COALESCE(done_at, now())
WHERE trangthai = 'đã_xong' AND done_at IS NULL;

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

CREATE INDEX IF NOT EXISTS idx_waiting_cleanup_logs_tenant_mode_created
  ON waiting_cleanup_logs (tenant_id, trigger_mode, created_at DESC);

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
      AND role IN ('owner', 'admin', 'doctor')
  )
);

COMMIT;
