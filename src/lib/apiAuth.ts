import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { isOwnerRole, normalizeTenantRole } from './tenantRoles';

type GuardOptions = {
  ownerOnly?: boolean;
};

export type TenantAuthContext = {
  userId: string;
  email: string | null;
  tenantId: string;
  tenantRole: string;
  isOwner: boolean;
};

type MembershipRow = {
  role?: string | null;
  active?: boolean | null;
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const getHeaderValue = (value: string | string[] | undefined): string | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
};

const hasMissingSchemaError = (message: string | undefined): boolean => {
  if (!message) return false;
  const text = message.toLowerCase();
  return text.includes('does not exist') || text.includes('relation') || text.includes('column');
};

const getAccessToken = (req: NextApiRequest): string | null => {
  const authHeader = getHeaderValue(req.headers.authorization);
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length < 2 || parts[0].toLowerCase() !== 'bearer') return null;

  return parts.slice(1).join(' ').trim() || null;
};

const getTenantId = (req: NextApiRequest): string | null => {
  const tenantHeader = getHeaderValue(req.headers['x-tenant-id'] as string | string[] | undefined);
  if (tenantHeader && tenantHeader.trim()) return tenantHeader.trim();

  if (typeof req.query.tenant_id === 'string' && req.query.tenant_id.trim()) {
    return req.query.tenant_id.trim();
  }

  return null;
};

const getMembershipRole = async (userId: string, tenantId: string): Promise<string | null> => {
  const membershipTables = ['tenantmembership', 'tenant_memberships'];

  for (const tableName of membershipTables) {
    const { data, error } = await supabase
      .from(tableName)
      .select('role, active')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle<MembershipRow>();

    if (error) {
      if (hasMissingSchemaError(error.message)) {
        continue;
      }
      throw new Error(`Membership lookup failed on ${tableName}: ${error.message}`);
    }

    if (data) {
      if (data.active === false) return null;
      return normalizeTenantRole(data.role);
    }
  }

  return null;
};

const getGlobalRole = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle<{ role?: string | null }>();

  if (error) {
    if (hasMissingSchemaError(error.message)) return null;
    throw new Error(`Global role lookup failed: ${error.message}`);
  }

  return normalizeTenantRole(data?.role);
};

export async function requireTenantAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  options: GuardOptions = {}
): Promise<TenantAuthContext | null> {
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ message: 'Unauthorized: missing bearer token' });
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ message: 'Unauthorized: invalid session token' });
    return null;
  }

  const tenantId = getTenantId(req);
  if (!tenantId) {
    res.status(400).json({ message: 'Missing tenant context: x-tenant-id header is required' });
    return null;
  }

  try {
    const roleFromMembership = await getMembershipRole(userData.user.id, tenantId);
    const tenantRole = roleFromMembership || (await getGlobalRole(userData.user.id));

    if (!tenantRole) {
      res.status(403).json({ message: 'Forbidden: user is not a member of this tenant' });
      return null;
    }

    const owner = isOwnerRole(tenantRole);
    if (options.ownerOnly && !owner) {
      res.status(403).json({ message: 'Forbidden: owner role is required' });
      return null;
    }

    return {
      userId: userData.user.id,
      email: userData.user.email ?? null,
      tenantId,
      tenantRole,
      isOwner: owner,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: 'Authorization guard error', error: message });
    return null;
  }
}