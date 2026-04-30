/**
 * usePermissions — load tập permission của user hiện tại (V054 RBAC).
 *
 * Cache trong React state, refetch khi đổi tenant. Tránh dùng global
 * fetch lặp đi lặp lại. Đồng thời cache vào localStorage để render
 * lần sau không nháy.
 *
 * Usage:
 *   const { has, loading, refresh } = usePermissions();
 *   {has('manage_inventory') && <Button>...</Button>}
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchWithAuth } from '../lib/fetchWithAuth';

interface PermissionsState {
  permissions: Set<string>;
  role: string | null;
  loading: boolean;
}

const LS_KEY_PREFIX = 'rbac_perms_v1:';

function lsLoad(tenantId: string): { permissions: string[]; role: string | null } | null {
  try {
    const raw = localStorage.getItem(LS_KEY_PREFIX + tenantId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.permissions)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function lsSave(tenantId: string, permissions: string[], role: string | null): void {
  try {
    localStorage.setItem(
      LS_KEY_PREFIX + tenantId,
      JSON.stringify({ permissions, role, ts: Date.now() })
    );
  } catch {}
}

export function usePermissions() {
  const { currentTenantId, user } = useAuth();
  const fetchedTenantRef = useRef<string | null>(null);

  const [state, setState] = useState<PermissionsState>(() => {
    if (typeof window !== 'undefined' && currentTenantId) {
      const cached = lsLoad(currentTenantId);
      if (cached) {
        return {
          permissions: new Set(cached.permissions),
          role: cached.role,
          loading: true, // vẫn refetch nhưng đã có cache để render
        };
      }
    }
    return { permissions: new Set<string>(), role: null, loading: true };
  });

  const fetchPerms = useCallback(async (tenantId: string) => {
    try {
      const res = await fetchWithAuth('/api/permissions/me');
      if (!res.ok) {
        // Không log noisy ở console khi user chưa join tenant.
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      const json = await res.json();
      const perms: string[] = Array.isArray(json.permissions) ? json.permissions : [];
      const role: string | null = typeof json.role === 'string' ? json.role : null;
      setState({ permissions: new Set(perms), role, loading: false });
      lsSave(tenantId, perms, role);
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!user?.id || !currentTenantId) {
      setState({ permissions: new Set(), role: null, loading: false });
      return;
    }
    if (fetchedTenantRef.current === currentTenantId) return;
    fetchedTenantRef.current = currentTenantId;

    // Load cache đồng bộ trước để tránh nháy UI
    const cached = lsLoad(currentTenantId);
    if (cached) {
      setState({ permissions: new Set(cached.permissions), role: cached.role, loading: true });
    } else {
      setState({ permissions: new Set(), role: null, loading: true });
    }

    fetchPerms(currentTenantId);
  }, [user?.id, currentTenantId, fetchPerms]);

  const has = useCallback(
    (permission: string | string[]): boolean => {
      const list = Array.isArray(permission) ? permission : [permission];
      return list.some((p) => state.permissions.has(p));
    },
    [state.permissions]
  );

  const refresh = useCallback(() => {
    if (currentTenantId) {
      fetchedTenantRef.current = null;
      fetchPerms(currentTenantId);
    }
  }, [currentTenantId, fetchPerms]);

  return {
    has,
    permissions: state.permissions,
    role: state.role,
    loading: state.loading,
    refresh,
  };
}
