/**
 * Fetch wrapper that automatically injects auth headers (Bearer token + x-tenant-id).
 * Use this instead of raw fetch() for API calls that need tenant context.
 */
import { supabaseAuth } from './supabaseAuth';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (typeof window === 'undefined') return headers;

  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const tenantId = localStorage.getItem('currentTenantId');
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  return headers;
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const mergedHeaders = {
    ...authHeaders,
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers: mergedHeaders,
  });
}
