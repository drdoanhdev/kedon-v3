export const OWNER_TENANT_ROLES = ['owner', 'admin'] as const;

export function normalizeTenantRole(role: string | null | undefined): string {
  return (role || '').trim().toLowerCase();
}

export function isOwnerRole(role: string | null | undefined): boolean {
  return OWNER_TENANT_ROLES.includes(normalizeTenantRole(role) as (typeof OWNER_TENANT_ROLES)[number]);
}