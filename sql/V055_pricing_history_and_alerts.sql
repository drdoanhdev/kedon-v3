-- V055: Pricing history, alert config, and suggestions
-- Goals:
--   1) Auto recompute weighted-average cost on every drug import receipt
--   2) Log every price change (cost & sell) into price_history
--   3) Auto raise pricing_suggestions when import cost spikes above tenant-configured threshold
--   4) Tenant-level config for alert threshold and margin-keep policy
--
-- Scope: Currently only "thuoc". Schema supports "hang_trong" for future opt-in.

BEGIN;

-- ============================================================
-- 1) price_history: full audit trail of price changes
-- ============================================================
CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('thuoc', 'hang_trong')),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  kind TEXT NOT NULL CHECK (kind IN ('ban', 'von')),
  old_price BIGINT,
  new_price BIGINT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('auto_import', 'manual', 'suggestion_applied', 'backfill')),
  reason TEXT,
  ref_nhap_id BIGINT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_item
  ON price_history(tenant_id, item_type, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_kind
  ON price_history(tenant_id, kind, created_at DESC);

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_history_service_all ON price_history;
CREATE POLICY price_history_service_all ON price_history
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS price_history_tenant_select ON price_history;
CREATE POLICY price_history_tenant_select ON price_history
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- ============================================================
-- 2) pricing_alert_config: per-tenant thresholds
-- ============================================================
CREATE TABLE IF NOT EXISTS pricing_alert_config (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  threshold_cost_increase_pct NUMERIC(6, 2) NOT NULL DEFAULT 20.00
    CHECK (threshold_cost_increase_pct >= 0 AND threshold_cost_increase_pct <= 1000),
  enabled_for_thuoc BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_for_hang_trong BOOLEAN NOT NULL DEFAULT FALSE,
  margin_keep_mode TEXT NOT NULL DEFAULT 'percent'
    CHECK (margin_keep_mode IN ('percent', 'absolute')),
  round_to BIGINT NOT NULL DEFAULT 1000 CHECK (round_to > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pricing_alert_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_alert_config_service_all ON pricing_alert_config;
CREATE POLICY pricing_alert_config_service_all ON pricing_alert_config
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pricing_alert_config_tenant_select ON pricing_alert_config;
CREATE POLICY pricing_alert_config_tenant_select ON pricing_alert_config
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- ============================================================
-- 3) pricing_suggestions: pending sell-price increase proposals
-- ============================================================
CREATE TABLE IF NOT EXISTS pricing_suggestions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('thuoc', 'hang_trong')),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  trigger_nhap_id BIGINT,
  old_cost BIGINT NOT NULL,
  new_cost BIGINT NOT NULL,
  cost_increase_pct NUMERIC(8, 2) NOT NULL,
  current_sell_price BIGINT NOT NULL,
  suggested_sell_price BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'dismissed', 'superseded')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_pending
  ON pricing_suggestions(tenant_id, status, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_item
  ON pricing_suggestions(tenant_id, item_type, item_id, created_at DESC);

ALTER TABLE pricing_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_suggestions_service_all ON pricing_suggestions;
CREATE POLICY pricing_suggestions_service_all ON pricing_suggestions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pricing_suggestions_tenant_select ON pricing_suggestions;
CREATE POLICY pricing_suggestions_tenant_select ON pricing_suggestions
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- ============================================================
-- 4) Helper: round price up to a step (e.g. 1000 VND)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_round_price_up(p_value BIGINT, p_step BIGINT)
RETURNS BIGINT AS $$
BEGIN
  IF p_step IS NULL OR p_step <= 1 THEN
    RETURN p_value;
  END IF;
  RETURN CEIL(p_value::numeric / p_step)::BIGINT * p_step;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 5) Upgrade fn_thuoc_nhap_update_stock:
--    a) add to tonkho (existing behavior)
--    b) recompute weighted-average gianhap
--    c) log price_history (kind='von', source='auto_import')
--    d) raise pricing_suggestions when above tenant threshold
-- ============================================================
CREATE OR REPLACE FUNCTION fn_thuoc_nhap_update_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_old_ton    BIGINT;
  v_old_von    BIGINT;
  v_old_ban    BIGINT;
  v_new_von    BIGINT;
  v_threshold  NUMERIC;
  v_enabled    BOOLEAN;
  v_mode       TEXT;
  v_round      BIGINT;
  v_increase   NUMERIC;
  v_suggested  BIGINT;
BEGIN
  -- (a) Read current state
  SELECT COALESCE(tonkho, 0), COALESCE(gianhap, 0), COALESCE(giaban, 0)
    INTO v_old_ton, v_old_von, v_old_ban
  FROM "Thuoc" WHERE id = NEW.thuoc_id;

  -- (b) Compute new weighted-average cost
  IF NEW.don_gia IS NULL OR NEW.don_gia <= 0 THEN
    v_new_von := v_old_von;  -- skip cost update if no price provided
  ELSIF v_old_ton <= 0 OR v_old_von <= 0 THEN
    v_new_von := NEW.don_gia::BIGINT;
  ELSE
    v_new_von := ROUND(
      (v_old_ton * v_old_von + NEW.so_luong * NEW.don_gia)::NUMERIC
      / NULLIF(v_old_ton + NEW.so_luong, 0)
    )::BIGINT;
  END IF;

  -- (c) Update Thuoc: stock + cost
  UPDATE "Thuoc"
     SET tonkho  = COALESCE(tonkho, 0) + NEW.so_luong,
         gianhap = v_new_von
   WHERE id = NEW.thuoc_id;

  -- (d) Log cost change if any
  IF v_new_von IS DISTINCT FROM v_old_von THEN
    INSERT INTO price_history(
      tenant_id, item_type, item_id, kind, old_price, new_price,
      source, reason, ref_nhap_id, changed_by
    ) VALUES (
      NEW.tenant_id, 'thuoc', NEW.thuoc_id, 'von', v_old_von, v_new_von,
      'auto_import',
      'Bình quân gia quyền sau phiếu nhập #' || NEW.id,
      NEW.id, NEW.nguoi_nhap
    );
  END IF;

  -- (e) Check alert threshold and raise suggestion
  SELECT threshold_cost_increase_pct, enabled_for_thuoc, margin_keep_mode, round_to
    INTO v_threshold, v_enabled, v_mode, v_round
  FROM pricing_alert_config WHERE tenant_id = NEW.tenant_id;

  IF v_threshold IS NULL THEN
    v_threshold := 20.00; v_enabled := TRUE; v_mode := 'percent'; v_round := 1000;
  END IF;

  IF v_enabled
     AND v_old_von > 0
     AND v_new_von > v_old_von
     AND NEW.don_gia > 0 THEN
    v_increase := ((v_new_von - v_old_von)::NUMERIC * 100.0) / v_old_von;
    IF v_increase >= v_threshold THEN
      -- Compute suggested sell price
      IF v_old_ban <= 0 THEN
        v_suggested := v_new_von; -- fallback
      ELSIF v_mode = 'absolute' THEN
        v_suggested := v_new_von + GREATEST(v_old_ban - v_old_von, 0);
      ELSE
        v_suggested := ROUND(v_new_von::NUMERIC * v_old_ban / NULLIF(v_old_von, 0))::BIGINT;
      END IF;
      v_suggested := fn_round_price_up(v_suggested, v_round);

      -- Supersede previous pending suggestions for this item
      UPDATE pricing_suggestions
         SET status = 'superseded', reviewed_at = now()
       WHERE tenant_id = NEW.tenant_id
         AND item_type = 'thuoc'
         AND item_id = NEW.thuoc_id
         AND status = 'pending';

      INSERT INTO pricing_suggestions(
        tenant_id, item_type, item_id, trigger_nhap_id,
        old_cost, new_cost, cost_increase_pct,
        current_sell_price, suggested_sell_price, status
      ) VALUES (
        NEW.tenant_id, 'thuoc', NEW.thuoc_id, NEW.id,
        v_old_von, v_new_von, ROUND(v_increase, 2),
        v_old_ban, v_suggested, 'pending'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists from V032; re-bind to be safe
DROP TRIGGER IF EXISTS trg_thuoc_nhap_update_stock ON thuoc_nhap_kho;
CREATE TRIGGER trg_thuoc_nhap_update_stock
  AFTER INSERT ON thuoc_nhap_kho
  FOR EACH ROW EXECUTE FUNCTION fn_thuoc_nhap_update_stock();

COMMIT;
