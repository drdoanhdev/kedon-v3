-- =====================================================
-- Bảng webhook_logs: Lưu toàn bộ webhook nhận được để audit
-- Quy trình: Webhook → VALIDATE → Activate
-- =====================================================

-- 1. Bảng log webhook
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                                -- 'casso', 'sepay', 'generic'
  raw_payload JSONB NOT NULL,                          -- Payload gốc từ bên thứ 3
  transfer_code TEXT,                                  -- Mã giao dịch trích xuất được
  amount BIGINT,                                       -- Số tiền giao dịch
  bank_ref TEXT,                                       -- Mã tham chiếu ngân hàng
  validation_status TEXT NOT NULL DEFAULT 'pending'    -- 'pending', 'valid', 'invalid'
    CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  validation_errors TEXT[],                            -- Danh sách lỗi validation (nếu có)
  payment_order_id UUID REFERENCES payment_orders(id), -- Đơn thanh toán liên kết
  processed_at TIMESTAMPTZ,                            -- Thời điểm xử lý xong
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_webhook_logs_transfer_code ON webhook_logs(transfer_code);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_validation_status ON webhook_logs(validation_status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- 2. Thêm cột validated_at vào payment_orders (đánh dấu thời điểm xác thực thành công)
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

-- 2b. Thêm cột sepay_order_id để lưu mã PAY từ SePay (dùng match webhook QR)
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS sepay_order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payment_orders_sepay_order_id ON payment_orders(sepay_order_id) WHERE sepay_order_id IS NOT NULL;

-- 3. RLS cho webhook_logs (chỉ admin đọc, service role ghi)
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Không cho user thường truy cập
CREATE POLICY webhook_logs_no_access ON webhook_logs
  FOR ALL USING (false);

-- Service role (supabaseAdmin) bypass RLS tự động

COMMENT ON TABLE webhook_logs IS 'Log toàn bộ webhook thanh toán. Quy trình: Webhook → VALIDATE → Activate';
COMMENT ON COLUMN webhook_logs.validation_status IS 'pending: chưa xử lý, valid: đã xác thực OK, invalid: xác thực thất bại';
