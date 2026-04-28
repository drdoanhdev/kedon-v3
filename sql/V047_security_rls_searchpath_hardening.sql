-- V047: Security hardening follow-up
-- 1) Enable/fix RLS on public tables flagged by advisor
-- 2) Restrict permissive service policies to service_role only
-- 3) Set deterministic search_path for public functions

-- ============================================================
-- 1) RLS fixes for tables flagged as ERROR
-- ============================================================

ALTER TABLE IF EXISTS public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crm_care_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ChiTietNhapKho" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."GhiChuHeThong" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- user_roles: users can only read their own global role row
DROP POLICY IF EXISTS user_roles_select_self ON public.user_roles;
CREATE POLICY user_roles_select_self
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid());

-- subscription_plans: public read for active plans, write via service_role only
DROP POLICY IF EXISTS subscription_plans_public_select ON public.subscription_plans;
CREATE POLICY subscription_plans_public_select
ON public.subscription_plans
FOR SELECT
USING (is_active = true);

-- crm_care_status: tenant-scoped access
DROP POLICY IF EXISTS crm_care_status_select ON public.crm_care_status;
DROP POLICY IF EXISTS crm_care_status_insert ON public.crm_care_status;
DROP POLICY IF EXISTS crm_care_status_update ON public.crm_care_status;
DROP POLICY IF EXISTS crm_care_status_delete ON public.crm_care_status;

CREATE POLICY crm_care_status_select
ON public.crm_care_status
FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY crm_care_status_insert
ON public.crm_care_status
FOR INSERT
WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY crm_care_status_update
ON public.crm_care_status
FOR UPDATE
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY crm_care_status_delete
ON public.crm_care_status
FOR DELETE
USING (is_tenant_owner(auth.uid(), tenant_id));

-- GhiChuHeThong: all members read, owner/admin mutate
DROP POLICY IF EXISTS ghichuht_select ON public."GhiChuHeThong";
DROP POLICY IF EXISTS ghichuht_insert ON public."GhiChuHeThong";
DROP POLICY IF EXISTS ghichuht_update ON public."GhiChuHeThong";
DROP POLICY IF EXISTS ghichuht_delete ON public."GhiChuHeThong";

CREATE POLICY ghichuht_select
ON public."GhiChuHeThong"
FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY ghichuht_insert
ON public."GhiChuHeThong"
FOR INSERT
WITH CHECK (is_tenant_owner(auth.uid(), tenant_id));

CREATE POLICY ghichuht_update
ON public."GhiChuHeThong"
FOR UPDATE
USING (is_tenant_owner(auth.uid(), tenant_id));

CREATE POLICY ghichuht_delete
ON public."GhiChuHeThong"
FOR DELETE
USING (is_tenant_owner(auth.uid(), tenant_id));

-- ChiTietNhapKho: tenant scope derived from PhieuNhapKho.tenant_id
DROP POLICY IF EXISTS chitietnhapkho_select ON public."ChiTietNhapKho";
DROP POLICY IF EXISTS chitietnhapkho_insert ON public."ChiTietNhapKho";
DROP POLICY IF EXISTS chitietnhapkho_update ON public."ChiTietNhapKho";
DROP POLICY IF EXISTS chitietnhapkho_delete ON public."ChiTietNhapKho";

CREATE POLICY chitietnhapkho_select
ON public."ChiTietNhapKho"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public."PhieuNhapKho" p
    WHERE p.id = "ChiTietNhapKho".phieunhapkhoid
      AND is_tenant_member(auth.uid(), p.tenant_id)
  )
);

CREATE POLICY chitietnhapkho_insert
ON public."ChiTietNhapKho"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."PhieuNhapKho" p
    WHERE p.id = "ChiTietNhapKho".phieunhapkhoid
      AND is_tenant_owner(auth.uid(), p.tenant_id)
  )
);

CREATE POLICY chitietnhapkho_update
ON public."ChiTietNhapKho"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public."PhieuNhapKho" p
    WHERE p.id = "ChiTietNhapKho".phieunhapkhoid
      AND is_tenant_owner(auth.uid(), p.tenant_id)
  )
);

CREATE POLICY chitietnhapkho_delete
ON public."ChiTietNhapKho"
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public."PhieuNhapKho" p
    WHERE p.id = "ChiTietNhapKho".phieunhapkhoid
      AND is_tenant_owner(auth.uid(), p.tenant_id)
  )
);

-- ============================================================
-- 2) Restrict service policies to service_role only
-- ============================================================

DROP POLICY IF EXISTS branches_service_all ON public.branches;
DROP POLICY IF EXISTS staff_assignments_service_all ON public.staff_assignments;
DROP POLICY IF EXISTS branch_transfers_service_all ON public.branch_transfers;
DROP POLICY IF EXISTS patient_transfers_service_all ON public.patient_transfers;

CREATE POLICY branches_service_all
ON public.branches
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY staff_assignments_service_all
ON public.staff_assignments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY branch_transfers_service_all
ON public.branch_transfers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY patient_transfers_service_all
ON public.patient_transfers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================
-- 3) Fix mutable search_path on public functions
-- ============================================================

DO $body$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.fn);
  END LOOP;
END;
$body$;
