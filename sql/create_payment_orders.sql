-- Bảng theo dõi đơn thanh toán (payment orders)
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro', 'enterprise')),
  amount BIGINT NOT NULL, -- VND
  months INTEGER NOT NULL DEFAULT 1,
  transfer_code TEXT NOT NULL UNIQUE, -- Nội dung chuyển khoản duy nhất, VD: KD A1B2C3
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  paid_at TIMESTAMPTZ,
  bank_ref TEXT, -- Mã giao dịch ngân hàng (từ webhook)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_tenant ON payment_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_transfer_code ON payment_orders(transfer_code);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status) WHERE status = 'pending';

-- RLS
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_orders_select" ON payment_orders FOR SELECT USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);
CREATE POLICY "payment_orders_insert" ON payment_orders FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_payment_orders_updated_at ON payment_orders;
CREATE TRIGGER update_payment_orders_updated_at BEFORE UPDATE ON payment_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
