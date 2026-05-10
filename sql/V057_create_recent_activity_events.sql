-- V057: Recent activity events for FAB Activity Hub sync across devices
-- Adds tenant/branch-aware activity stream table with RLS and dedupe key.

BEGIN;

CREATE TABLE IF NOT EXISTS recent_activity_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  client_event_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'search_hit',
    'quick_history_open',
    'open_rx_drug',
    'open_rx_glasses',
    'open_profile',
    'add_waiting'
  )),
  source TEXT,
  event_at TIMESTAMPTZ NOT NULL,
  patient_id INTEGER NOT NULL REFERENCES "BenhNhan"(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  patient_address TEXT,
  patient_birth_year TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(client_event_id) <= 100),
  CHECK (source IS NULL OR char_length(source) <= 80),
  CHECK (char_length(patient_name) <= 200),
  CHECK (patient_phone IS NULL OR char_length(patient_phone) <= 40),
  CHECK (patient_address IS NULL OR char_length(patient_address) <= 255),
  CHECK (patient_birth_year IS NULL OR char_length(patient_birth_year) <= 20),
  UNIQUE (tenant_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS idx_recent_activity_tenant_time
  ON recent_activity_events(tenant_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_recent_activity_tenant_branch_time
  ON recent_activity_events(tenant_id, branch_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_recent_activity_tenant_patient
  ON recent_activity_events(tenant_id, patient_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_recent_activity_tenant_updated
  ON recent_activity_events(tenant_id, updated_at DESC);

ALTER TABLE recent_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recent_activity_select" ON recent_activity_events;
DROP POLICY IF EXISTS "recent_activity_modify" ON recent_activity_events;

CREATE POLICY "recent_activity_select" ON recent_activity_events FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
);

CREATE POLICY "recent_activity_modify" ON recent_activity_events FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM tenantmembership
    WHERE user_id = auth.uid()
      AND tenant_id = recent_activity_events.tenant_id
      AND active = true
      AND role IN ('owner', 'admin', 'doctor', 'staff')
  )
);

CREATE OR REPLACE FUNCTION recent_activity_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_recent_activity_events(
  p_days INTEGER DEFAULT 30,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_deleted BIGINT := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    DELETE FROM recent_activity_events
    WHERE event_at < (now() - make_interval(days => GREATEST(p_days, 1)));
  ELSE
    DELETE FROM recent_activity_events
    WHERE tenant_id = p_tenant_id
      AND event_at < (now() - make_interval(days => GREATEST(p_days, 1)));
  END IF;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recent_activity_updated_at ON recent_activity_events;
CREATE TRIGGER trg_recent_activity_updated_at
  BEFORE UPDATE ON recent_activity_events
  FOR EACH ROW EXECUTE FUNCTION recent_activity_set_updated_at();

COMMIT;
