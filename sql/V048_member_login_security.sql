-- V048: Member login security policy (single device / IP / working hours)

ALTER TABLE tenantmembership
  ADD COLUMN IF NOT EXISTS login_security JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS locked_device_id TEXT,
  ADD COLUMN IF NOT EXISTS locked_device_label TEXT,
  ADD COLUMN IF NOT EXISTS locked_device_at TIMESTAMPTZ;

COMMENT ON COLUMN tenantmembership.login_security IS
  'Per-member login security policy: enabled, single_device_only, enforce_store_network, allowed_ips, enforce_working_hours, allowed_weekdays, start_time, end_time, timezone';

COMMENT ON COLUMN tenantmembership.locked_device_id IS
  'Bound device id when single_device_only is enabled.';

COMMENT ON COLUMN tenantmembership.locked_device_label IS
  'Human readable label from client device.';

COMMENT ON COLUMN tenantmembership.locked_device_at IS
  'Timestamp when device was bound.';
