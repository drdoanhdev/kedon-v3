-- Thêm cột trial vào bảng tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ DEFAULT now();
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 90;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_max_prescriptions INTEGER DEFAULT 1000;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'basic', 'pro', 'enterprise'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
