/**
 * RBAC permission helpers (V054).
 *
 * Đọc tập permission của user từ bảng `tenant_role_permissions` (DB),
 * fallback về `ROLE_PERMISSIONS` hardcode trong featureConfig nếu DB
 * chưa được seed (giai đoạn chuyển tiếp).
 *
 * Pattern dùng:
 *   const ctx = await requireTenant(req, res);
 *   if (!ctx) return;
 *   if (!(await requirePermission(ctx, res, 'manage_categories'))) return;
 */
import type { NextApiResponse } from 'next';
import { supabaseAdmin, type TenantContext } from './tenantApi';
import { getPermissionsForRole, type Permission } from './featureConfig';

interface CachedPermSet {
  permissions: Set<string>;
  source: 'db' | 'fallback';
  expiry: number;
}

const PERM_CACHE_TTL = 60_000; // 60s — đủ để chịu vài chục request, đủ ngắn để
                                // user thấy thay đổi sau khi admin chỉnh quyền.
const permCache = new Map<string, CachedPermSet>(); // key = userId:tenantId

function cacheKey(userId: string, tenantId: string): string {
  return `${userId}:${tenantId}`;
}

/**
 * Xóa cache permission của 1 user trong 1 tenant. Gọi sau khi admin
 * thay đổi role/permission để hiệu lực ngay (không phải đợi TTL).
 */
export function invalidateUserPermissionCache(userId: string, tenantId: string): void {
  permCache.delete(cacheKey(userId, tenantId));
}

/**
 * Xóa cache cho toàn bộ thành viên 1 tenant. Dùng khi đổi tập permission
 * của 1 role (ảnh hưởng nhiều user).
 */
export function invalidateTenantPermissionCache(tenantId: string): void {
  for (const key of permCache.keys()) {
    if (key.endsWith(`:${tenantId}`)) {
      permCache.delete(key);
    }
  }
}

/**
 * Lấy tập permission của user tại tenant. Có cache.
 * - Ưu tiên đọc từ tenant_role_permissions (RBAC table-driven).
 * - Fallback: nếu user chưa có role_id (DB chưa migrate đủ) hoặc query
 *   thất bại → dùng ROLE_PERMISSIONS hardcoded theo `ctx.role`.
 */
export async function getUserPermissions(ctx: TenantContext): Promise<{
  permissions: Set<string>;
  source: 'db' | 'fallback';
}> {
  const key = cacheKey(ctx.userId, ctx.tenantId);
  const now = Date.now();
  const cached = permCache.get(key);
  if (cached && cached.expiry > now) {
    return { permissions: cached.permissions, source: cached.source };
  }

  // Đọc từ DB qua role_id của membership.
  // Lưu ý: schema V054 đảm bảo role_id đã được backfill cho mọi membership cũ.
  const { data, error } = await supabaseAdmin
    .from('tenantmembership')
    .select('role_id, role, tenant_roles!inner(tenant_role_permissions(permission_code))')
    .eq('user_id', ctx.userId)
    .eq('tenant_id', ctx.tenantId)
    .eq('active', true)
    .maybeSingle();

  let permissions = new Set<string>();
  let source: 'db' | 'fallback' = 'db';

  if (!error && data && (data as any).tenant_roles) {
    const trpRows = (data as any).tenant_roles?.tenant_role_permissions;
    if (Array.isArray(trpRows) && trpRows.length > 0) {
      for (const row of trpRows) {
        if (row?.permission_code) permissions.add(row.permission_code);
      }
    }
  }

  if (permissions.size === 0) {
    // Fallback an toàn: chưa migrate đủ hoặc role_id null → dùng matrix cũ.
    source = 'fallback';
    const fallback = getPermissionsForRole(ctx.role);
    permissions = new Set<string>(fallback);
  }

  permCache.set(key, {
    permissions,
    source,
    expiry: now + PERM_CACHE_TTL,
  });

  return { permissions, source };
}

/**
 * Trả TRUE nếu user có quyền `permission`. KHÔNG ghi response.
 */
export async function userHasPermission(
  ctx: TenantContext,
  permission: Permission | string
): Promise<boolean> {
  const { permissions } = await getUserPermissions(ctx);
  return permissions.has(permission);
}

/**
 * Guard cho API route. Trả TRUE nếu OK; FALSE thì đã `res.status(403).json(...)` rồi.
 *
 * Chấp nhận 1 hoặc nhiều permission:
 *   - 1 permission: phải có quyền đó.
 *   - mảng permission: phải có ÍT NHẤT 1 (OR semantics) — phù hợp với
 *     `requireFeature(ctx, res, feature, permission)` cũ.
 */
export async function requirePermission(
  ctx: TenantContext,
  res: NextApiResponse,
  permission: Permission | Permission[] | string | string[]
): Promise<boolean> {
  const required = Array.isArray(permission) ? permission : [permission];
  if (required.length === 0) return true;

  const { permissions } = await getUserPermissions(ctx);
  const ok = required.some((p) => permissions.has(p));
  if (ok) return true;

  res.status(403).json({
    message: 'Bạn không có quyền thực hiện thao tác này.',
    code: 'PERMISSION_DENIED',
    requiredPermission: required,
  });
  return false;
}
