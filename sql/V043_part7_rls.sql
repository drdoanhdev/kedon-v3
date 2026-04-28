-- V043 Part 7: RLS Policies
-- Copy toàn bộ và chạy trên Supabase Dashboard

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY branches_service_all ON branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY staff_assignments_service_all ON staff_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY branch_transfers_service_all ON branch_transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY patient_transfers_service_all ON patient_transfers FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY branches_tenant_select ON branches FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY staff_assignments_tenant_select ON staff_assignments FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY branch_transfers_tenant_select ON branch_transfers FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY patient_transfers_tenant_select ON patient_transfers FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
