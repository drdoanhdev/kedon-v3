-- V046: Security advisor fixes
-- 1) Ensure RLS is enabled on hen_kham_lai
-- 2) Convert risky SECURITY DEFINER views to security invoker

ALTER TABLE IF EXISTS public.hen_kham_lai ENABLE ROW LEVEL SECURITY;

DO $body$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'v_lens_order_summary'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_lens_order_summary SET (security_invoker = true)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'v_low_stock_alerts'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_low_stock_alerts SET (security_invoker = true)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'v_lens_stock_summary'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_lens_stock_summary SET (security_invoker = true)';
  END IF;
END;
$body$;
