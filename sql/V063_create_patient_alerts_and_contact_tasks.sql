-- V063: Patient alerts and contact tasks (Method 2)

CREATE TABLE IF NOT EXISTS patient_alerts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  benhnhan_id INTEGER NOT NULL REFERENCES "BenhNhan"(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('high', 'medium', 'low')),
  category TEXT NOT NULL DEFAULT 'clinical' CHECK (category IN ('allergy', 'clinical', 'behavior', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_alerts_tenant_patient
  ON patient_alerts (tenant_id, benhnhan_id);

CREATE INDEX IF NOT EXISTS idx_patient_alerts_active
  ON patient_alerts (tenant_id, is_active, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS patient_contact_tasks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  benhnhan_id INTEGER NOT NULL REFERENCES "BenhNhan"(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL DEFAULT 'other' CHECK (task_type IN ('out_of_stock', 'back_in_stock', 'pickup_reminder', 'special_order', 'other')),
  title TEXT NOT NULL,
  details TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'waiting_stock', 'ready_to_call', 'completed', 'cancelled')),
  due_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  result_note TEXT NULL,
  assigned_to UUID NULL,
  notified_at TIMESTAMPTZ NULL,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_contact_tasks_tenant_patient
  ON patient_contact_tasks (tenant_id, benhnhan_id);

CREATE INDEX IF NOT EXISTS idx_patient_contact_tasks_status_due
  ON patient_contact_tasks (tenant_id, status, due_at);
