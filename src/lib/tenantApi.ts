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
  /** Branch ID from x-branch-id header (enterprise multi-branch) */
  branchId: string | null;
}

// ===== In-memory cache for auth lookups =====

interface CachedAuth {
  userId: string;
  email: string | null;
  expiry: number;
}

interface CachedMembership {
  id: string | null;
  role: string;
  active: boolean;
  tenantStatus: string;
  loginSecurity: Record<string, unknown>;
  lockedDeviceId: string | null;
  lockedDeviceLabel: string | null;
  securitySupported: boolean;
  expiry: number;
}

const AUTH_CACHE_TTL = 60_000; // 60s
const MEMBERSHIP_CACHE_TTL = 60_000; // 60s
const LOGIN_UPDATE_THROTTLE = 300_000; // 5 min

const authCache = new Map<string, CachedAuth>();
const membershipCache = new Map<string, CachedMembership>();
const lastLoginUpdated = new Map<string, number>(); // key -> timestamp

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

function getBranchId(req: NextApiRequest): string | null {
  const h = req.headers['x-branch-id'];
  const val = Array.isArray(h) ? h[0] : h;
  return val?.trim() || null;
}

function getDeviceId(req: NextApiRequest): string | null {
  const h = req.headers['x-device-id'];
  const val = Array.isArray(h) ? h[0] : h;
  const normalized = val?.trim();
  if (!normalized) return null;
  return normalized.slice(0, 128);
}

function getDeviceLabel(req: NextApiRequest): string | null {
  const h = req.headers['x-device-label'];
  const val = Array.isArray(h) ? h[0] : h;
  const normalized = val?.trim();
  if (!normalized) return null;
  return normalized.slice(0, 200);
}

function getClientIp(req: NextApiRequest): string | null {
  const xff = req.headers['x-forwarded-for'];
  const forwarded = Array.isArray(xff) ? xff[0] : xff;
  const candidate = forwarded?.split(',')[0]?.trim()
    || (Array.isArray(req.headers['x-real-ip']) ? req.headers['x-real-ip'][0] : req.headers['x-real-ip'])?.trim()
    || req.socket.remoteAddress
    || null;
  if (!candidate) return null;
  return candidate.replace(/^::ffff:/, '').trim();
}

function toMinuteOfDay(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function getWeekdayInTimezone(date: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

function getMinuteInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
  return hour * 60 + minute;
}

function isIpv4(ip: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').map(Number).reduce((acc, octet) => ((acc << 8) + (octet & 255)) >>> 0, 0);
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [base, maskBitsRaw] = cidr.split('/');
  const maskBits = Number(maskBitsRaw);
  if (!isIpv4(ip) || !isIpv4(base) || !Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) {
    return false;
  }
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function isIpAllowed(ip: string, allowedIps: string[]): boolean {
  if (!allowedIps.length) return false;
  for (const raw of allowedIps) {
    const rule = String(raw || '').trim();
    if (!rule) continue;
    if (rule === ip) return true;
    if (rule.includes('/')) {
      if (isIpInCidr(ip, rule)) return true;
      continue;
    }
    if (rule.endsWith('*')) {
      const prefix = rule.slice(0, -1);
      if (ip.startsWith(prefix)) return true;
    }
  }
  return false;
}

function normalizeLoginSecurityPolicy(raw: Record<string, unknown> | null | undefined) {
  const policy = raw || {};
  const weekdaysRaw = Array.isArray(policy.allowed_weekdays) ? policy.allowed_weekdays : [1, 2, 3, 4, 5, 6];
  const weekdays = Array.from(
    new Set(
      weekdaysRaw
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    )
  );
  const allowedIps = Array.isArray(policy.allowed_ips)
    ? policy.allowed_ips.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  return {
    enabled: policy.enabled === true,
    singleDeviceOnly: policy.single_device_only === true,
    enforceStoreNetwork: policy.enforce_store_network === true,
    allowedIps,
    enforceWorkingHours: policy.enforce_working_hours === true,
    weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5, 6],
    startTime: String(policy.start_time || '08:00'),
    endTime: String(policy.end_time || '20:00'),
    timezone: String(policy.timezone || 'Asia/Ho_Chi_Minh'),
  };
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

interface BranchAccessOptions {
  /**
   * Nếu true, bắt buộc phải có branch_id cho mọi role.
   */
  requireBranch?: boolean;
  /**
   * Nếu true (mặc định), staff/doctor bắt buộc có branch_id.
   */
  requireForStaff?: boolean;
  /**
   * Owner/admin có thể xem all branches khi không truyền branch_id.
   */
  allowAllForOwner?: boolean;
  /**
   * Branch override (nếu muốn dùng branch khác ctx.branchId).
   */
  branchId?: string | null;
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

  // 2. Xác thực user (cached)
  const now = Date.now();
  let userId: string;
  let email: string | null;

  const cachedAuth = authCache.get(token);
  if (cachedAuth && cachedAuth.expiry > now) {
    userId = cachedAuth.userId;
    email = cachedAuth.email;
  } else {
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      authCache.delete(token);
      res.status(401).json({ message: 'Unauthorized: token không hợp lệ' });
      return null;
    }
    userId = userData.user.id;
    email = userData.user.email ?? null;
    authCache.set(token, { userId, email, expiry: now + AUTH_CACHE_TTL });
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

  // 4. Kiểm tra membership (cached)
  const memCacheKey = `${userId}:${tenantId}`;
  let membershipRole: string;
  let membershipActive: boolean;

  const cachedMem = membershipCache.get(memCacheKey);
  if (cachedMem && cachedMem.expiry > now) {
    membershipRole = cachedMem.role;
    membershipActive = cachedMem.active;
  } else {
    let membership: any = null;
    let memErr: any = null;

    const fullRes = await supabaseAdmin
      .from('tenantmembership')
      .select('id, role, active, login_security, locked_device_id, locked_device_label, tenants!inner(status)')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    membership = fullRes.data;
    memErr = fullRes.error;

    if (memErr && /login_security|locked_device_id|locked_device_label/i.test(memErr.message || '')) {
      const fallbackRes = await supabaseAdmin
        .from('tenantmembership')
        .select('id, role, active, tenants!inner(status)')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      membership = fallbackRes.data;
      memErr = fallbackRes.error;
      if (membership) {
        membership.login_security = {};
        membership.locked_device_id = null;
        membership.locked_device_label = null;
        membership.security_supported = false;
      }
    }

    if (memErr) {
      res.status(500).json({ message: 'Lỗi kiểm tra quyền: ' + memErr.message });
      return null;
    }

    if (!membership) {
      res.status(403).json({ message: 'Bạn không phải thành viên của phòng khám này' });
      return null;
    }

    membershipRole = membership.role || 'staff';
    membershipActive = membership.active !== false;
    const tenantStatus = (membership as any).tenants?.status || 'active';
    membershipCache.set(memCacheKey, {
      id: membership.id || null,
      role: membershipRole,
      active: membershipActive,
      tenantStatus,
      loginSecurity: (membership as any).login_security || {},
      lockedDeviceId: (membership as any).locked_device_id || null,
      lockedDeviceLabel: (membership as any).locked_device_label || null,
      securitySupported: (membership as any).security_supported !== false,
      expiry: now + MEMBERSHIP_CACHE_TTL,
    });
  }

  if (!membershipActive) {
    res.status(403).json({ message: 'Bạn không phải thành viên của phòng khám này' });
    return null;
  }

  // Kiểm tra trạng thái phòng khám
  const cachedMemFinal = membershipCache.get(memCacheKey);
  const tenantStatus = cachedMemFinal?.tenantStatus || 'active';
  if (tenantStatus === 'suspended') {
    res.status(403).json({ message: 'Phòng khám đang bị tạm ngưng. Vui lòng liên hệ quản trị viên nền tảng.' });
    return null;
  }
  if (tenantStatus === 'inactive') {
    res.status(403).json({ message: 'Phòng khám đã ngưng hoạt động. Vui lòng liên hệ quản trị viên nền tảng.' });
    return null;
  }

  const role = membershipRole.toLowerCase() as TenantRole;
  const isOwner = role === 'owner' || role === 'admin';

  // 5.5 Login security enforcement for non-owner users
  if (!isOwner) {
    const memState = membershipCache.get(memCacheKey);
    if (memState?.securitySupported !== false) {
      const policy = normalizeLoginSecurityPolicy(memState?.loginSecurity);
      if (policy.enabled) {
        const nowDate = new Date();
        const deviceId = getDeviceId(req);

        if (policy.singleDeviceOnly) {
          if (!deviceId) {
            res.status(400).json({ message: 'Thiếu định danh thiết bị. Vui lòng đăng nhập lại.', code: 'DEVICE_ID_REQUIRED' });
            return null;
          }

          if (!memState?.lockedDeviceId) {
            const { error: lockErr } = await supabaseAdmin
              .from('tenantmembership')
              .update({
                locked_device_id: deviceId,
                locked_device_label: getDeviceLabel(req),
                locked_device_at: nowDate.toISOString(),
              })
              .eq('user_id', userId)
              .eq('tenant_id', tenantId);

            if (lockErr) {
              res.status(500).json({ message: 'Lỗi gắn thiết bị đăng nhập: ' + lockErr.message });
              return null;
            }

            membershipCache.set(memCacheKey, {
              ...(memState as CachedMembership),
              lockedDeviceId: deviceId,
              lockedDeviceLabel: getDeviceLabel(req),
              expiry: now + MEMBERSHIP_CACHE_TTL,
            });
          } else if (memState.lockedDeviceId !== deviceId) {
            res.status(403).json({
              message: 'Tài khoản này chỉ được phép đăng nhập trên thiết bị đã đăng ký.',
              code: 'DEVICE_LOCKED',
              locked_device_label: memState.lockedDeviceLabel || null,
            });
            return null;
          }
        }

        if (policy.enforceStoreNetwork) {
          const clientIp = getClientIp(req);
          if (!clientIp) {
            res.status(403).json({ message: 'Không xác định được địa chỉ mạng truy cập.', code: 'NETWORK_UNKNOWN' });
            return null;
          }
          if (!isIpAllowed(clientIp, policy.allowedIps)) {
            res.status(403).json({ message: 'Tài khoản chỉ được dùng trong mạng cửa hàng.', code: 'IP_NOT_ALLOWED' });
            return null;
          }
        }

        if (policy.enforceWorkingHours) {
          const start = toMinuteOfDay(policy.startTime);
          const end = toMinuteOfDay(policy.endTime);
          if (start !== null && end !== null) {
            const minuteNow = getMinuteInTimezone(nowDate, policy.timezone);
            const weekdayNow = getWeekdayInTimezone(nowDate, policy.timezone);
            const isAllowedDay = policy.weekdays.includes(weekdayNow);
            const inRange = start <= end
              ? minuteNow >= start && minuteNow <= end
              : minuteNow >= start || minuteNow <= end;
            if (!isAllowedDay || !inRange) {
              res.status(403).json({ message: 'Ngoài khung giờ đăng nhập được phép.', code: 'OUT_OF_WORKING_HOURS' });
              return null;
            }
          }
        }
      }
    }
  }

  // 5. Kiểm tra quyền
  if (options.ownerOnly && !isOwner) {
    res.status(403).json({ message: 'Chỉ chủ phòng khám/admin mới có quyền thực hiện' });
    return null;
  }

  if (options.allowedRoles && !options.allowedRoles.includes(role)) {
    res.status(403).json({ message: `Yêu cầu quyền: ${options.allowedRoles.join(', ')}` });
    return null;
  }

  // 6. Cập nhật last_login_at (throttled: tối đa 1 lần / 5 phút / user+tenant)
  const lastUpdated = lastLoginUpdated.get(memCacheKey) || 0;
  if (now - lastUpdated > LOGIN_UPDATE_THROTTLE) {
    lastLoginUpdated.set(memCacheKey, now);
    supabaseAdmin
      .from('tenantmembership')
      .update({ last_login_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .then(() => {});
  }

  // 7. Branch ID (optional, for enterprise multi-branch)
  const branchId = getBranchId(req);

  return {
    userId,
    email,
    tenantId,
    role,
    isOwner,
    supabase: supabaseAdmin,
    branchId: branchId && isValidUUID(branchId) ? branchId : null,
  };
}

/**
 * Branch-level access guard cho mô hình multi-branch.
 * - Owner/admin: có thể xem all branches (branchId = null) nếu allowAllForOwner=true
 * - Staff/doctor: bắt buộc có branch_id và phải được phân công active tại branch đó
 */
export async function resolveBranchAccess(
  ctx: TenantContext,
  res: NextApiResponse,
  options: BranchAccessOptions = {}
): Promise<{ branchId: string | null } | null> {
  const requireBranch = options.requireBranch === true;
  const requireForStaff = options.requireForStaff !== false;
  const allowAllForOwner = options.allowAllForOwner !== false;
  const requestedBranchId = options.branchId !== undefined ? options.branchId : ctx.branchId;

  const isAdminRole = ctx.role === 'owner' || ctx.role === 'admin';

  if (!requestedBranchId) {
    if (requireBranch) {
      res.status(400).json({ message: 'Thiếu x-branch-id header' });
      return null;
    }

    if (!isAdminRole && requireForStaff) {
      // Fallback: nếu client chưa kịp gửi x-branch-id, tự suy ra từ phân công active.
      const { data: assignments, error: assignmentErr } = await supabaseAdmin
        .from('staff_assignments')
        .select('branch_id, is_primary, from_date')
        .eq('tenant_id', ctx.tenantId)
        .eq('user_id', ctx.userId)
        .is('to_date', null)
        .order('is_primary', { ascending: false })
        .order('from_date', { ascending: false });

      if (assignmentErr) {
        res.status(500).json({ message: 'Lỗi kiểm tra phân công chi nhánh: ' + assignmentErr.message });
        return null;
      }

      const inferredBranchId = assignments?.[0]?.branch_id || null;
      if (!inferredBranchId) {
        res.status(400).json({ message: 'Thiếu x-branch-id header cho tài khoản nhân viên' });
        return null;
      }

      return { branchId: inferredBranchId };
    }

    if (isAdminRole && allowAllForOwner) {
      return { branchId: null };
    }

    res.status(400).json({ message: 'Thiếu x-branch-id header' });
    return null;
  }

  if (!isValidUUID(requestedBranchId)) {
    res.status(400).json({ message: 'branch_id không hợp lệ' });
    return null;
  }

  const { data: branch, error: branchErr } = await supabaseAdmin
    .from('branches')
    .select('id, status')
    .eq('id', requestedBranchId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (branchErr) {
    res.status(500).json({ message: 'Lỗi kiểm tra chi nhánh: ' + branchErr.message });
    return null;
  }

  if (!branch) {
    res.status(403).json({ message: 'Bạn không có quyền truy cập chi nhánh này' });
    return null;
  }

  if (branch.status !== 'active') {
    res.status(403).json({ message: 'Chi nhánh đang tạm ngưng hoạt động' });
    return null;
  }

  if (isAdminRole) {
    return { branchId: requestedBranchId };
  }

  const { data: assignment, error: assErr } = await supabaseAdmin
    .from('staff_assignments')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .eq('branch_id', requestedBranchId)
    .is('to_date', null)
    .maybeSingle();

  if (assErr) {
    res.status(500).json({ message: 'Lỗi kiểm tra phân công chi nhánh: ' + assErr.message });
    return null;
  }

  if (!assignment) {
    res.status(403).json({ message: 'Bạn không được phân công tại chi nhánh này' });
    return null;
  }

  return { branchId: requestedBranchId };
}

// ===== Feature gate middleware =====

import { planHasFeature, roleHasPermission, getMinPlanForFeature, PLAN_LABELS, FEATURE_LABELS, type FeatureKey, type Permission, type PlanKey } from './featureConfig';

// Cache tenant plan để tránh query lặp
const tenantPlanCache = new Map<string, { plan: string; expiry: number }>();
const PLAN_CACHE_TTL = 120_000; // 2 phút

/**
 * Kiểm tra tenant có quyền truy cập feature không.
 * Gọi SAU requireTenant() — cần TenantContext.
 */
export async function requireFeature(
  ctx: TenantContext,
  res: NextApiResponse,
  feature: FeatureKey,
  permission?: Permission
): Promise<boolean> {
  // 1. Lấy plan của tenant (cached)
  const now = Date.now();
  let plan = 'trial';
  const cached = tenantPlanCache.get(ctx.tenantId);
  if (cached && cached.expiry > now) {
    plan = cached.plan;
  } else {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('plan')
      .eq('id', ctx.tenantId)
      .single();
    if (!error && data) {
      plan = data.plan || 'trial';
      tenantPlanCache.set(ctx.tenantId, { plan, expiry: now + PLAN_CACHE_TTL });
    }
  }

  // 2. Check plan → feature
  if (!planHasFeature(plan, feature)) {
    const featureLabel = FEATURE_LABELS[feature] || feature;
    const minPlan = getMinPlanForFeature(feature);
    res.status(403).json({
      message: `Tính năng "${featureLabel}" yêu cầu gói ${PLAN_LABELS[minPlan]}. Vui lòng nâng cấp.`,
      code: 'PLAN_REQUIRED',
      requiredFeature: feature,
    });
    return false;
  }

  // 3. Check role → permission (chỉ cho gói multi-user)
  if (permission && plan !== 'trial' && plan !== 'basic') {
    if (!roleHasPermission(ctx.role, permission)) {
      res.status(403).json({
        message: 'Bạn không có quyền thực hiện thao tác này.',
        code: 'PERMISSION_DENIED',
        requiredPermission: permission,
      });
      return false;
    }
  }

  return true;
}

// ===== Trial expiry check =====

/**
 * Kiểm tra trial đã hết hạn chưa. Dùng cho POST tạo đơn thuốc/kính mới.
 * Chỉ block khi gói là trial VÀ đã hết hạn (theo ngày hoặc số đơn).
 * Trả về true nếu OK (có thể tạo đơn), false nếu bị block.
 */
export async function checkTrialLimit(
  ctx: TenantContext,
  res: NextApiResponse
): Promise<boolean> {
  // Lấy thông tin tenant
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan, trial_start, trial_days, trial_max_prescriptions, plan_expires_at')
    .eq('id', ctx.tenantId)
    .single();

  if (!tenant) return true;

  // Chỉ check trial
  if (tenant.plan !== 'trial') return true;

  // Check hết hạn ngày
  if (tenant.trial_start && tenant.trial_days) {
    const startDate = new Date(tenant.trial_start);
    const endDate = new Date(startDate.getTime() + tenant.trial_days * 86400000);
    if (new Date() > endDate) {
      res.status(403).json({
        message: 'Gói dùng thử đã hết hạn. Vui lòng nâng cấp để tiếp tục tạo đơn.',
        code: 'TRIAL_EXPIRED',
      });
      return false;
    }
  }

  // Check hết hạn số đơn
  if (tenant.trial_max_prescriptions) {
    const { count: countThuoc } = await supabaseAdmin
      .from('DonThuoc')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId);

    const { count: countKinh } = await supabaseAdmin
      .from('DonKinh')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId);

    const totalPrescriptions = (countThuoc || 0) + (countKinh || 0);
    if (totalPrescriptions >= tenant.trial_max_prescriptions) {
      res.status(403).json({
        message: `Gói dùng thử đã đạt giới hạn ${tenant.trial_max_prescriptions} đơn. Vui lòng nâng cấp để tiếp tục tạo đơn.`,
        code: 'TRIAL_LIMIT_REACHED',
      });
      return false;
    }
  }

  return true;
}

// ===== Convenience: set no-cache headers =====
export function setNoCacheHeaders(res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
