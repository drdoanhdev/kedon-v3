-- =============================================
-- Enforce tenant status in RLS function
-- Tenant bị tạm ngưng hoặc ngưng hoạt động sẽ không truy cập được dữ liệu
-- =============================================

-- Cập nhật function get_user_tenant_ids để kiểm tra tenants.status = 'active'
CREATE OR REPLACE FUNCTION get_user_tenant_ids(p_user_id UUID)
RETURNS SETOF UUID AS $$
  SELECT tm.tenant_id 
  FROM tenantmembership tm
  JOIN tenants t ON tm.tenant_id = t.id
  WHERE tm.user_id = p_user_id 
    AND tm.active = true
    AND t.status = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER;
