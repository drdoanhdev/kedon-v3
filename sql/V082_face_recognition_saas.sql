-- V082: Face recognition SaaS (edge devices, embeddings, pending faces)

-- ========== face_devices ==========
CREATE TABLE IF NOT EXISTS face_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  device_label TEXT NOT NULL DEFAULT 'Camera cửa vào',
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  pairing_code TEXT NULL,
  pairing_expires_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending_pair', 'active', 'revoked')),
  last_seen_at TIMESTAMPTZ NULL,
  last_ip TEXT NULL,
  agent_version TEXT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_devices_tenant ON face_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_face_devices_pairing ON face_devices(pairing_code)
  WHERE pairing_code IS NOT NULL AND status = 'pending_pair';
CREATE UNIQUE INDEX IF NOT EXISTS uq_face_devices_token_prefix ON face_devices(token_prefix);

ALTER TABLE face_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS face_devices_select ON face_devices;
DROP POLICY IF EXISTS face_devices_insert ON face_devices;
DROP POLICY IF EXISTS face_devices_update ON face_devices;
DROP POLICY IF EXISTS face_devices_delete ON face_devices;

CREATE POLICY face_devices_select ON face_devices FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY face_devices_insert ON face_devices FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY face_devices_update ON face_devices FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY face_devices_delete ON face_devices FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- ========== face_embeddings (consolidated) ==========
CREATE TABLE IF NOT EXISTS face_embeddings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES "BenhNhan"(id) ON DELETE CASCADE,
  embedding REAL[] NOT NULL,
  model TEXT NOT NULL DEFAULT 'insightface_arcface',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE face_embeddings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE face_embeddings ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT 'insightface_arcface';

CREATE UNIQUE INDEX IF NOT EXISTS uq_face_embeddings_patient ON face_embeddings(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_face_embeddings_tenant_updated ON face_embeddings(tenant_id, updated_at DESC);

-- Backfill tenant_id from BenhNhan where missing
UPDATE face_embeddings fe
SET tenant_id = bn.tenant_id
FROM "BenhNhan" bn
WHERE fe.patient_id = bn.id AND fe.tenant_id IS NULL;

-- Migrate from legacy insightface_embeddings if present
DO $$ BEGIN
  INSERT INTO face_embeddings (tenant_id, patient_id, embedding, model, created_at, updated_at)
  SELECT bn.tenant_id, ie.patient_id, ie.embedding, 'insightface_arcface', COALESCE(ie.created_at, now()), now()
  FROM insightface_embeddings ie
  JOIN "BenhNhan" bn ON bn.id = ie.patient_id
  ON CONFLICT (tenant_id, patient_id) DO UPDATE
    SET embedding = EXCLUDED.embedding, updated_at = now();
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'insightface_embeddings not found, skip migration';
END $$;

ALTER TABLE face_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS face_embeddings_select ON face_embeddings;
DROP POLICY IF EXISTS face_embeddings_insert ON face_embeddings;
DROP POLICY IF EXISTS face_embeddings_update ON face_embeddings;
DROP POLICY IF EXISTS face_embeddings_delete ON face_embeddings;

CREATE POLICY face_embeddings_select ON face_embeddings FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY face_embeddings_insert ON face_embeddings FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    AND patient_id IN (SELECT id FROM "BenhNhan" WHERE tenant_id = face_embeddings.tenant_id)
);
CREATE POLICY face_embeddings_update ON face_embeddings FOR UPDATE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY face_embeddings_delete ON face_embeddings FOR DELETE USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- ========== PendingFaces enhancements ==========
CREATE TABLE IF NOT EXISTS "PendingFaces" (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  device_id UUID NULL REFERENCES face_devices(id) ON DELETE SET NULL,
  embedding REAL[] NULL,
  snapshot_url TEXT NULL,
  quality_score REAL NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'rejected')),
  assigned_to INTEGER NULL REFERENCES "BenhNhan"(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NULL,
  reject_reason TEXT NULL,
  rejected_at TIMESTAMPTZ NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "PendingFaces" ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE "PendingFaces" ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE "PendingFaces" ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES face_devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pendingfaces_tenant_status ON "PendingFaces"(tenant_id, status, detected_at DESC);
