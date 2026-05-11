-- V064: Soft delete + history for patient alerts/contact tasks

ALTER TABLE patient_alerts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

ALTER TABLE patient_contact_tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

CREATE INDEX IF NOT EXISTS idx_patient_alerts_deleted
  ON patient_alerts (tenant_id, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_contact_tasks_deleted
  ON patient_contact_tasks (tenant_id, deleted_at, created_at DESC);

CREATE TABLE IF NOT EXISTS patient_alerts_history (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  alert_id BIGINT NOT NULL REFERENCES patient_alerts(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
  note TEXT NULL,
  before_data JSONB NULL,
  after_data JSONB NULL,
  changed_by UUID NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_alerts_history_lookup
  ON patient_alerts_history (tenant_id, alert_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS patient_contact_tasks_history (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  task_id BIGINT NOT NULL REFERENCES patient_contact_tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
  note TEXT NULL,
  before_data JSONB NULL,
  after_data JSONB NULL,
  changed_by UUID NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_contact_tasks_history_lookup
  ON patient_contact_tasks_history (tenant_id, task_id, changed_at DESC);
