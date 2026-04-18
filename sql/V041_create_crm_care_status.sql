-- CRM workflow trạng thái chăm sóc bệnh nhân cho dashboard
CREATE TABLE IF NOT EXISTS crm_care_status (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  benhnhan_id INTEGER NOT NULL REFERENCES "BenhNhan"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'chua_lien_he'
    CHECK (status IN ('chua_lien_he', 'da_goi', 'hen_goi_lai', 'da_chot_lich')),
  note TEXT,
  next_call_at TIMESTAMPTZ,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, benhnhan_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_care_status_tenant ON crm_care_status(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_care_status_status ON crm_care_status(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_care_status_next_call ON crm_care_status(tenant_id, next_call_at) WHERE next_call_at IS NOT NULL;
