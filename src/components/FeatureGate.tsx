import React from 'react';
import Link from 'next/link';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { FEATURE_LABELS, PLAN_LABELS, type FeatureKey, type Permission } from '../lib/featureConfig';
import { Lock, ArrowUpCircle } from 'lucide-react';

interface FeatureGateProps {
  /** Feature key cần kiểm tra (theo plan) */
  feature: FeatureKey;
  /** Permission cần kiểm tra (theo role) — tùy chọn */
  permission?: Permission;
  /** Custom fallback khi không có quyền */
  fallback?: React.ReactNode;
  /** Nếu true, render children nhưng mờ + overlay (thay vì ẩn hoàn toàn) */
  preview?: boolean;
  children: React.ReactNode;
}

/**
 * Component gate — ẩn/hiện nội dung dựa trên plan + role
 * 
 * @example
 * <FeatureGate feature="inventory_lens">
 *   <QuanLyKhoContent />
 * </FeatureGate>
 * 
 * @example
 * <FeatureGate feature="advanced_reports" permission="view_reports">
 *   <BaoCaoNangCao />
 * </FeatureGate>
 */
export function FeatureGate({ feature, permission, fallback, preview, children }: FeatureGateProps) {
  const { canAccessFeature, hasPermission, getUpgradePlan } = useFeatureGate();

  const featureAllowed = canAccessFeature(feature);
  const permissionAllowed = permission ? hasPermission(permission) : true;

  // Đủ quyền → render children
  if (featureAllowed && permissionAllowed) {
    return <>{children}</>;
  }

  // Custom fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  // Không có quyền plan → hiện upgrade banner
  if (!featureAllowed) {
    const upgrade = getUpgradePlan(feature);
    const featureLabel = FEATURE_LABELS[feature] || feature;

    if (preview) {
      return (
        <div className="relative">
          <div className="opacity-30 pointer-events-none select-none blur-[1px]">
            {children}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <UpgradeBanner featureLabel={featureLabel} planLabel={upgrade?.label} />
          </div>
        </div>
      );
    }

    return <UpgradeBanner featureLabel={featureLabel} planLabel={upgrade?.label} />;
  }

  // Có feature nhưng không có permission → hiện thông báo quyền
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-orange-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">Không có quyền truy cập</h3>
      <p className="text-gray-500 text-center max-w-md">
        Tài khoản của bạn không có quyền sử dụng tính năng này.
        Vui lòng liên hệ chủ cửa hàng để được cấp quyền.
      </p>
    </div>
  );
}

/**
 * Banner nâng cấp gói — hiện khi user truy cập feature cần plan cao hơn
 */
function UpgradeBanner({ featureLabel, planLabel }: { featureLabel: string; planLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
        <ArrowUpCircle className="w-8 h-8 text-blue-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">
        Nâng cấp để sử dụng {featureLabel}
      </h3>
      <p className="text-gray-500 text-center max-w-md mb-6">
        Tính năng <strong>{featureLabel}</strong> chỉ có trong gói{' '}
        <strong className="text-blue-600">{planLabel || 'cao hơn'}</strong>.
        Nâng cấp ngay để trải nghiệm đầy đủ tính năng.
      </p>
      <Link
        href="/billing"
        className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
      >
        <ArrowUpCircle className="w-4 h-4" />
        Xem gói dịch vụ
      </Link>
    </div>
  );
}

/**
 * Inline upgrade badge — dùng cho menu items bị khóa
 */
export function UpgradeBadge({ planLabel }: { planLabel?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-full">
      <Lock className="w-2.5 h-2.5" />
      {planLabel || 'PRO'}
    </span>
  );
}

export default FeatureGate;
