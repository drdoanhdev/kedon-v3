-- ============================================
-- MESSAGING AUTOMATION (Zalo OA + SMS)
-- Tự động chăm sóc khách hàng theo kịch bản
-- - Mỗi tenant kết nối kênh riêng (token mã hóa AES-256-GCM ở app)
-- - Worker poll bảng message_jobs để gửi tin
-- ============================================

-- ============================================================================
-- 1) clinic_messaging_channels: cấu hình kênh gửi tin theo tenant
-- ============================================================================
CREATE TABLE IF NOT EXISTS clinic_messaging_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('zalo_oa', 'sms_http')),

  -- Định danh nhà cung cấp (Zalo OA: oa_id; SMS: tài khoản brandname)
  external_id     TEXT,
  display_name    TEXT,
  avatar_url      TEXT,

  -- Token / secret đã được mã hóa (AES-256-GCM ở tầng app trước khi lưu)
  -- Định dạng: { "iv": "...", "tag": "...", "data": "..." }
  credentials     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Vòng đời token
  expires_at      TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,

  -- Trạng thái kết nối
  status          TEXT NOT NULL DEFAULT 'connected'
                  CHECK (status IN ('connected', 'expired', 'disconnected', 'error')),
  last_error      TEXT,

  -- Cấu hình gửi
  auto_send       BOOLEAN NOT NULL DEFAULT false,
  daily_limit     INTEGER NOT NULL DEFAULT 500,
  monthly_limit   INTEGER NOT NULL DEFAULT 10000,
  rate_per_minute INTEGER NOT NULL DEFAULT 30,

  -- Audit
  connected_by    UUID REFERENCES auth.users(id),
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_messaging_channels_tenant
  ON clinic_messaging_channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messaging_channels_status
  ON clinic_messaging_channels(status, expires_at);

ALTER TABLE clinic_messaging_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messaging_channels_select" ON clinic_messaging_channels;
DROP POLICY IF EXISTS "messaging_channels_modify" ON clinic_messaging_channels;

-- Mọi truy vấn đi qua service_role (API guard) nên policy đơn giản: thành viên tenant đọc được
CREATE POLICY "messaging_channels_select" ON clinic_messaging_channels FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
);

-- Chỉ owner/admin được sửa cấu hình kết nối
CREATE POLICY "messaging_channels_modify" ON clinic_messaging_channels FOR ALL USING (
  EXISTS (
    SELECT 1 FROM tenantmembership
    WHERE user_id = auth.uid() AND tenant_id = clinic_messaging_channels.tenant_id
      AND active = true AND role IN ('owner', 'admin')
  )
);


-- ============================================================================
-- 2) message_workflows: kịch bản tự động (per tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_workflows (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  -- Sự kiện kích hoạt:
  --  appointment_confirm: ngay khi tạo lịch hẹn
  --  appointment_reminder: trước giờ hẹn N phút
  --  followup_after_visit: sau khám/khám xong N phút
  trigger_event   TEXT NOT NULL CHECK (trigger_event IN
    ('appointment_confirm','appointment_reminder','followup_after_visit')),

  -- Độ lệch thời gian so với mốc trigger (phút)
  -- - appointment_confirm: thường = 0
  -- - appointment_reminder: âm (vd -1440 = trước 24h)
  -- - followup_after_visit: dương (vd 4320 = 3 ngày sau)
  offset_minutes  INTEGER NOT NULL DEFAULT 0,

  channel         TEXT NOT NULL CHECK (channel IN ('zalo_oa', 'sms_http')),
  template_text   TEXT NOT NULL,
  -- Nếu Zalo template ZNS có template_id, lưu ở đây
  zns_template_id TEXT,

  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_workflows_tenant
  ON message_workflows(tenant_id, enabled, trigger_event);

ALTER TABLE message_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_workflows_select" ON message_workflows;
DROP POLICY IF EXISTS "message_workflows_modify" ON message_workflows;

CREATE POLICY "message_workflows_select" ON message_workflows FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
);

CREATE POLICY "message_workflows_modify" ON message_workflows FOR ALL USING (
  EXISTS (
    SELECT 1 FROM tenantmembership
    WHERE user_id = auth.uid() AND tenant_id = message_workflows.tenant_id
      AND active = true AND role IN ('owner', 'admin')
  )
);


-- ============================================================================
-- 3) message_jobs: hàng đợi tin nhắn cần gửi
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_jobs (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID,

  -- Liên kết nguồn gốc
  workflow_id     BIGINT REFERENCES message_workflows(id) ON DELETE SET NULL,
  appointment_id  BIGINT,
  patient_id      INTEGER,

  -- Người nhận
  recipient_phone TEXT NOT NULL,
  recipient_name  TEXT,

  -- Nội dung đã render (snapshot template + biến đã thay)
  channel         TEXT NOT NULL CHECK (channel IN ('zalo_oa', 'sms_http')),
  message_text    TEXT NOT NULL,
  zns_template_id TEXT,
  zns_params      JSONB,

  -- Lập lịch & retry
  run_at          TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','sent','failed','cancelled','skipped')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  next_retry_at   TIMESTAMPTZ,
  locked_at       TIMESTAMPTZ,
  locked_by       TEXT,

  -- Kết quả
  provider_message_id TEXT,
  error_message   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

-- Index polling: lấy job pending tới hạn (rất nhỏ vì partial)
CREATE INDEX IF NOT EXISTS idx_message_jobs_due
  ON message_jobs(run_at)
  WHERE status = 'pending';

-- Index theo tenant
CREATE INDEX IF NOT EXISTS idx_message_jobs_tenant_status
  ON message_jobs(tenant_id, status, run_at DESC);

-- Index theo appointment (để cancel khi hủy hẹn)
CREATE INDEX IF NOT EXISTS idx_message_jobs_appointment
  ON message_jobs(appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE message_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_jobs_select" ON message_jobs;
DROP POLICY IF EXISTS "message_jobs_modify" ON message_jobs;

CREATE POLICY "message_jobs_select" ON message_jobs FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
);

CREATE POLICY "message_jobs_modify" ON message_jobs FOR ALL USING (
  EXISTS (
    SELECT 1 FROM tenantmembership
    WHERE user_id = auth.uid() AND tenant_id = message_jobs.tenant_id
      AND active = true AND role IN ('owner', 'admin')
  )
);


-- ============================================================================
-- 4) message_logs: lưu vết gửi tin (giảm tải bảng jobs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_logs (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id          BIGINT REFERENCES message_jobs(id) ON DELETE SET NULL,

  channel         TEXT NOT NULL,
  recipient_phone TEXT,
  status          TEXT NOT NULL,                 -- sent / failed
  request_meta    JSONB,
  response_meta   JSONB,
  error_message   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_logs_tenant_time
  ON message_logs(tenant_id, created_at DESC);

ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_logs_select" ON message_logs;

CREATE POLICY "message_logs_select" ON message_logs FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id FROM tenantmembership
    WHERE user_id = auth.uid() AND active = true
  )
);


-- ============================================================================
-- 5) Trigger updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION messaging_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messaging_channels_updated ON clinic_messaging_channels;
CREATE TRIGGER trg_messaging_channels_updated
  BEFORE UPDATE ON clinic_messaging_channels
  FOR EACH ROW EXECUTE FUNCTION messaging_set_updated_at();

DROP TRIGGER IF EXISTS trg_message_workflows_updated ON message_workflows;
CREATE TRIGGER trg_message_workflows_updated
  BEFORE UPDATE ON message_workflows
  FOR EACH ROW EXECUTE FUNCTION messaging_set_updated_at();

DROP TRIGGER IF EXISTS trg_message_jobs_updated ON message_jobs;
CREATE TRIGGER trg_message_jobs_updated
  BEFORE UPDATE ON message_jobs
  FOR EACH ROW EXECUTE FUNCTION messaging_set_updated_at();


-- ============================================================================
-- 6) Cleanup function (gọi định kỳ qua pg_cron hoặc cron worker)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_message_jobs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Xóa job đã sent/cancelled/skipped > 30 ngày
  DELETE FROM message_jobs
  WHERE status IN ('sent','cancelled','skipped')
    AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Xóa log > 90 ngày
  DELETE FROM message_logs
  WHERE created_at < now() - interval '90 days';

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GHI CHÚ
-- - File này idempotent (CREATE IF NOT EXISTS / DROP POLICY IF EXISTS).
-- - credentials lưu ciphertext mã hóa AES-256-GCM (xem src/lib/messaging/crypto.ts).
-- - Worker dùng service_role key, polling theo idx_message_jobs_due.
-- - Khi hủy lịch hẹn, app tự cập nhật message_jobs.status='cancelled'.
-- ============================================================================
