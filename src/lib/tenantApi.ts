/**
 * Tenant-aware Supabase helper for API routes.
 * Cung cấp query builder đã được filter theo tenant_id.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Service role client (full access, dùng ở backend)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

export { supabaseAdmin };

// ===== Types =====

export type TenantRole = 'owner' | 'admin' | 'doctor' | 'staff';

export interface TenantContext {
  userId: string;
  email: string | null;
  tenantId: string;
  role: TenantRole;
  isOwner: boolean;
  supabase: SupabaseClient;
}

// ===== Helpers =====

function getBearer(req: NextApiRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const parts = (Array.isArray(h) ? h[0] : h).split(' ');
  return parts.length >= 2 && parts[0].toLowerCase() === 'bearer'
    ? parts.slice(1).join(' ').trim() || null
    : null;
}

function getTenantId(req: NextApiRequest): string | null {
  const h = req.headers['x-tenant-id'];
  const val = Array.isArray(h) ? h[0] : h;
  if (val?.trim()) return val.trim();
  if (typeof req.query.tenant_id === 'string' && req.query.tenant_id.trim()) {
    return req.query.tenant_id.trim();
  }
  return null;
}

// UUID validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(s: string): boolean {
  return UUID_RE.test(s);
}

// ===== Main guard =====

interface GuardOptions {
  /** Chỉ cho phép owner/admin */
  ownerOnly?: boolean;
  /** Cho phép các role cụ thể */
  allowedRoles?: TenantRole[];
}

/**
 * Xác thực và trả về TenantContext.
 * Trả null nếu không hợp lệ (đã gửi response lỗi rồi).
 */
export async function requireTenant(
  req: NextApiRequest,
  res: NextApiResponse,
  options: GuardOptions = {}
): Promise<TenantContext | null> {
  // 1. Bearer token
  const token = getBearer(req);
  if (!token) {
    res.status(401).json({ message: 'Unauthorized: thiếu token xác thực' });
    return null;
  }

  // 2. Xác thực user
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ message: 'Unauthorized: token không hợp lệ' });
    return null;
  }

  // 3. Tenant ID
  const tenantId = getTenantId(req);
  if (!tenantId) {
    res.status(400).json({ message: 'Thiếu x-tenant-id header' });
    return null;
  }

  if (!isValidUUID(tenantId)) {
    res.status(400).json({ message: 'tenant_id không hợp lệ' });
    return null;
  }

  // 4. Kiểm tra membership
  const { data: membership, error: memErr } = await supabaseAdmin
    .from('tenantmembership')
    .select('role, active')
    .eq('user_id', userData.user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (memErr) {
    res.status(500).json({ message: 'Lỗi kiểm tra quyền: ' + memErr.message });
    return null;
  }

  if (!membership || membership.active === false) {
    res.status(403).json({ message: 'Bạn không phải thành viên của phòng khám này' });
    return null;
  }

  const role = (membership.role || 'staff').toLowerCase() as TenantRole;
  const isOwner = role === 'owner' || role === 'admin';

  // 5. Kiểm tra quyền
  if (options.ownerOnly && !isOwner) {
    res.status(403).json({ message: 'Chỉ chủ phòng khám/admin mới có quyền thực hiện' });
    return null;
  }

  if (options.allowedRoles && !options.allowedRoles.includes(role)) {
    res.status(403).json({ message: `Yêu cầu quyền: ${options.allowedRoles.join(', ')}` });
    return null;
  }

  // 6. Cập nhật last_login_at (non-blocking)
  supabaseAdmin
    .from('tenantmembership')
    .update({ last_login_at: new Date().toISOString() })
    .eq('user_id', userData.user.id)
    .eq('tenant_id', tenantId)
    .then(() => {});

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    tenantId,
    role,
    isOwner,
    supabase: supabaseAdmin,
  };
}

// ===== Convenience: set no-cache headers =====
export function setNoCacheHeaders(res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
