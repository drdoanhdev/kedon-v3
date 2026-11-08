import Link from 'next/link';
import {
  Bell,
  Building2,
  CheckSquare,
  GitBranch,
  Lock,
  LogOut,
  X,
} from 'lucide-react';
import type { FeatureKey } from '../../lib/featureConfig';
import type { MoreItem } from './types';
import { BottomSheet } from './BottomSheet';

export type MoreSheetProps = {
  open: boolean;
  onClose: () => void;
  userInitial: string;
  userName: string;
  userEmail?: string | null;
  counts: {
    thongBao: number;
    tinNhanPlatform: number;
    nhacViec: number;
  };
  tenants: { id: string; name: string }[];
  currentTenantId: string | null | undefined;
  currentTenantName?: string | null;
  switchTenant: (id: string) => void;
  isMultiBranch: boolean;
  branches: { id: string; ten_chi_nhanh: string; is_main?: boolean }[];
  currentBranchId: string | null | undefined;
  currentRole: string | undefined;
  switchBranch: (id: string | null) => void;
  moreItems: MoreItem[];
  canAccessFeature: (feature: FeatureKey) => boolean;
  onSignOut: () => Promise<void>;
};

export function MoreSheet({
  open,
  onClose,
  userInitial,
  userName,
  userEmail,
  counts,
  tenants,
  currentTenantId,
  currentTenantName,
  switchTenant,
  isMultiBranch,
  branches,
  currentBranchId,
  currentRole,
  switchBranch,
  moreItems,
  canAccessFeature,
  onSignOut,
}: MoreSheetProps) {
  if (!open) return null;

  const platformMsg = counts.thongBao + counts.tinNhanPlatform;

  return (
    <BottomSheet onClose={onClose} fullHeight sheetId="mbn-more-sheet">
      <div className="flex flex-col h-full">
        <div className="px-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-base font-bold border border-blue-200 flex-shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">{userName}</div>
              <div className="text-xs text-gray-500 truncate">{userEmail}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-gray-400 hover:bg-gray-100"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/thong-bao"
              onClick={onClose}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100 active:scale-[0.98] transition-transform"
            >
              <div className="relative">
                <Bell className="w-5 h-5 text-amber-600" />
                {platformMsg > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {platformMsg > 9 ? '9+' : platformMsg}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-amber-900">Thông báo</span>
            </Link>
            <Link
              href="/nhac-viec"
              onClick={onClose}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-100 active:scale-[0.98] transition-transform"
            >
              <div className="relative">
                <CheckSquare className="w-5 h-5 text-blue-600" />
                {counts.nhacViec > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {counts.nhacViec > 9 ? '9+' : counts.nhacViec}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-blue-900">Nhắc việc</span>
            </Link>
          </div>

          {tenants.length > 1 && (
            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100">
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
                <Building2 className="w-3 h-3 text-blue-600" />
                Chuyển phòng khám
              </label>
              <select
                className="w-full h-11 text-sm rounded-lg px-3 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                value={currentTenantId || ''}
                onChange={(e) => switchTenant(e.target.value)}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {tenants.length <= 1 && currentTenantName && (
            <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-600 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-medium text-gray-700 truncate">{currentTenantName}</span>
            </div>
          )}

          {isMultiBranch && branches.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100">
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
                <GitBranch className="w-3 h-3 text-amber-600" />
                Chi nhánh
              </label>
              <select
                className="w-full h-11 text-sm rounded-lg px-3 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                value={currentBranchId || ''}
                onChange={(e) => switchBranch(e.target.value || null)}
              >
                {(currentRole === 'owner' || currentRole === 'admin') && (
                  <option value="">Tất cả chi nhánh</option>
                )}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.ten_chi_nhanh}
                    {b.is_main ? ' (Chính)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2 px-1">
              Tất cả chức năng
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const locked = item.feature ? !canAccessFeature(item.feature) : false;
                const href = locked ? '/billing' : item.href;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={onClose}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-center transition-all active:scale-[0.98] ${
                      locked ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white active:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center relative ${
                        locked ? 'bg-gray-200 text-gray-400' : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {locked && (
                        <Lock className="absolute -bottom-1 -right-1 w-3 h-3 text-gray-400 bg-white rounded-full p-0.5" />
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-medium leading-tight ${
                        locked ? 'text-gray-400' : 'text-gray-700'
                      }`}
                    >
                      {item.label}
                      {locked && <span className="block text-[9px] text-amber-600 font-semibold">Nâng cấp</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-3 bg-white flex-shrink-0">
          <button
            type="button"
            onClick={async () => {
              onClose();
              await onSignOut();
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold text-sm active:bg-red-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
