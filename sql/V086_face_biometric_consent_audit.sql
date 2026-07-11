-- V086: Đồng ý (consent) & nhật ký kiểm toán cho dữ liệu sinh trắc học khuôn mặt
-- Tuân thủ Nghị định 13/2023/NĐ-CP: dữ liệu sinh trắc là dữ liệu cá nhân nhạy cảm,
-- cần có sự đồng ý và nhật ký xử lý.

-- ========== face_biometric_consent ==========
CREATE TABLE IF NOT EXISTS face_biometric_consent (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES "BenhNhan"(id) ON DELETE CASCADE,
  consented_by UUID NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by UUID NULL,
  revoked_at TIMESTAMPTZ NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mỗi bệnh nhân 1 bản ghi consent/tenant (revoked_at = NULL nghĩa là đang đồng ý).
CREATE UNIQUE INDEX IF NOT EXISTS uq_face_consent_patient
  ON face_biometric_consent(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_face_consent_active
  ON face_biometric_consent(tenant_id, patient_id)
  WHERE revoked_at IS NULL;

ALTER TABLE face_biometric_consent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS face_consent_select ON face_biometric_consent;
DROP POLICY IF EXISTS face_consent_insert ON face_biometric_consent;
DROP POLICY IF EXISTS face_consent_update ON face_biometric_consent;
DROP POLICY IF EXISTS face_consent_delete ON face_biometric_consent;

CREATE POLICY face_consent_select ON face_biometric_consent FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY face_consent_insert ON face_biometric_consent FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY face_consent_update ON face_biometric_consent FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY face_consent_delete ON face_biometric_consent FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- ========== face_audit_log ==========
CREATE TABLE IF NOT EXISTS face_audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id INTEGER NULL,
  device_id UUID NULL,
  actor UUID NULL,
  action TEXT NOT NULL CHECK (action IN (
    'consent_grant', 'consent_revoke',
    'enroll', 'recognize', 'assign', 'delete', 'reject'
  )),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_audit_tenant_created
  ON face_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_face_audit_patient
  ON face_audit_log(tenant_id, patient_id, created_at DESC)
  WHERE patient_id IS NOT NULL;

ALTER TABLE face_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS face_audit_select ON face_audit_log;

-- Chỉ đọc trong tenant; ghi thực hiện bằng service role (backend).
CREATE POLICY face_audit_select ON face_audit_log FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
