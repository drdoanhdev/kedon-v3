/**
 * Guard cho API admin nền tảng (superadmin).
 * Xác thực user + kiểm tra user_roles.role = 'superadmin'.
 * Không yêu cầu tenant context — superadmin quản lý cross-tenant.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, setNoCacheHeaders } from './tenantApi';

export interface SuperAdminContext {
  userId: string;
  email: string | null;
}

function getBearer(req: NextApiRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const parts = (Array.isArray(h) ? h[0] : h).split(' ');
  return parts.length >= 2 && parts[0].toLowerCase() === 'bearer'
    ? parts.slice(1).join(' ').trim() || null
    : null;
}

/**
 * Xác thực superadmin. Trả null nếu không hợp lệ (đã gửi response lỗi).
 */
export async function requireSuperAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<SuperAdminContext | null> {
  setNoCacheHeaders(res);

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

  const userId = userData.user.id;
  const email = userData.user.email ?? null;

  // 3. Kiểm tra role superadmin trong user_roles
  const { data: roleData, error: roleError } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (roleError || !roleData || roleData.role !== 'superadmin') {
    res.status(403).json({ message: 'Forbidden: chỉ superadmin mới có quyền truy cập' });
    return null;
  }

  return { userId, email };
}
