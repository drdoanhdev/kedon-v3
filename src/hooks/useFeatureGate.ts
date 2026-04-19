import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  planHasFeature,
  roleHasPermission,
  getRequiredUpgrade,
  PLAN_LABELS,
  FEATURE_LABELS,
  type FeatureKey,
  type Permission,
  type PlanKey,
} from '../lib/featureConfig';

interface FeatureGateResult {
  /** Kiểm tra tenant có quyền truy cập feature không (theo plan) */
  canAccessFeature: (feature: FeatureKey) => boolean;
  /** Kiểm tra user có permission không (theo role trong tenant) */
  hasPermission: (permission: Permission) => boolean;
  /** Kiểm tra cả feature (plan) + permission (role) */
  canAccess: (feature: FeatureKey, permission?: Permission) => boolean;
  /** Lấy tên gói cần nâng cấp để dùng feature (null = đã có) */
  getUpgradePlan: (feature: FeatureKey) => { key: PlanKey; label: string } | null;
  /** Plan hiện tại của tenant */
  currentPlan: string;
  /** Role hiện tại trong tenant */
  currentRole: string | null;
  /** Gói trial / basic (1 user) — không cần phân quyền role */
  isSingleUserPlan: boolean;
}

export function useFeatureGate(): FeatureGateResult {
  const { currentTenant, currentRole } = useAuth();

  const currentPlan = currentTenant?.plan || 'trial';
  const isSingleUserPlan = currentPlan === 'trial' || currentPlan === 'basic';

  const canAccessFeature = useCallback(
    (feature: FeatureKey): boolean => {
      return planHasFeature(currentPlan, feature);
    },
    [currentPlan]
  );

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      // Gói 1 user → owner → có tất cả quyền
      if (isSingleUserPlan) return true;
      return roleHasPermission(currentRole, permission);
    },
    [currentRole, isSingleUserPlan]
  );

  const canAccess = useCallback(
    (feature: FeatureKey, permission?: Permission): boolean => {
      if (!canAccessFeature(feature)) return false;
      if (permission && !hasPermission(permission)) return false;
      return true;
    },
    [canAccessFeature, hasPermission]
  );

  const getUpgradePlan = useCallback(
    (feature: FeatureKey): { key: PlanKey; label: string } | null => {
      const upgrade = getRequiredUpgrade(currentPlan, feature);
      if (!upgrade) return null;
      return { key: upgrade, label: PLAN_LABELS[upgrade] };
    },
    [currentPlan]
  );

  return useMemo(
    () => ({
      canAccessFeature,
      hasPermission,
      canAccess,
      getUpgradePlan,
      currentPlan,
      currentRole,
      isSingleUserPlan,
    }),
    [canAccessFeature, hasPermission, canAccess, getUpgradePlan, currentPlan, currentRole, isSingleUserPlan]
  );
}
