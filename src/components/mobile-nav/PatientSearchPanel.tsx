import React from 'react';
import { Loader2, Search, UserPlus, X } from 'lucide-react';
import type { PatientResult } from '../../lib/patientSearch';
import type { PatientMenuAction } from './types';
import { FAB_SEARCH_VISIBLE_STEP } from './constants';
import { PatientRow } from './PatientRow';
import { RecentActivityTimeline, type RecentActivityTimelineProps } from './RecentActivityTimeline';

export type PatientSearchPanelProps = {
  variant: 'desktop' | 'mobile';
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  searchLoading: boolean;
  searchFailed: boolean;
  searchResults: PatientResult[];
  visibleSearchResults: PatientResult[];
  canLoadMoreSearchResults: boolean;
  onLoadMoreSearch: () => void;
  onAddNewPatient: () => void;
  onEnterExpandFirst: () => void;
  expandedMenuPatientId: number | null;
  onTogglePatientMenu: (id: number) => void;
  onMenuActionSearch: (patient: PatientResult, action: PatientMenuAction) => void;
  onCallAction: (patient: PatientResult) => void;
  onZaloAction: (patient: PatientResult) => void;
  activityTimeline: RecentActivityTimelineProps;
};

export function PatientSearchPanel({
  variant,
  searchTerm,
  onSearchTermChange,
  searchInputRef,
  onClose,
  searchLoading,
  searchFailed,
  searchResults,
  visibleSearchResults,
  canLoadMoreSearchResults,
  onLoadMoreSearch,
  onAddNewPatient,
  onEnterExpandFirst,
  expandedMenuPatientId,
  onTogglePatientMenu,
  onMenuActionSearch,
  onCallAction,
  onZaloAction,
  activityTimeline,
}: PatientSearchPanelProps) {
  const isDesktop = variant === 'desktop';
  const headerPad = isDesktop ? 'px-5 py-4' : 'px-4 pb-2';
  const bodyPad = isDesktop ? 'px-5' : 'px-4';
  const bodyClass = isDesktop ? 'max-h-[65vh] overflow-y-auto' : 'flex-1 overflow-y-auto';
  const footerPad = isDesktop ? 'p-4' : 'p-3';
  const emptyBtnClass = isDesktop
    ? 'inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm'
    : 'inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform';
  const loadMoreBtnClass = isDesktop
    ? 'w-full h-10 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100'
    : 'w-full h-10 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium active:scale-[0.99] transition-transform';
  const footerAddClass = isDesktop
    ? 'w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50'
    : 'w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-600 text-sm font-medium active:bg-gray-50';

  const shellClass = isDesktop
    ? 'flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl'
    : 'flex flex-col h-full';

  return (
    <div className={shellClass}>
      <div className={`${headerPad} border-b border-gray-100`}>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              inputMode="search"
              enterKeyHint="go"
              autoComplete="off"
              placeholder="Tìm theo SĐT, tên, mã BN..."
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                  onAddNewPatient();
                  return;
                }
                onEnterExpandFirst();
              }}
              className="w-full h-12 pl-10 pr-10 rounded-xl bg-gray-100 text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => onSearchTermChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-gray-200 text-gray-400"
                aria-label="Xoá"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-blue-600 font-medium">
            Đóng
          </button>
        </div>
      </div>

      <div className={bodyClass}>
        {searchLoading && searchResults.length === 0 && (
          <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Đang tìm...</span>
          </div>
        )}

        {searchFailed && searchTerm.trim() && (
          <div className={`${bodyPad} py-10 text-center`}>
            <div className="text-red-500 text-sm mb-4">Không thể tải kết quả. Thử lại sau.</div>
          </div>
        )}

        {!searchLoading && !searchFailed && searchTerm.trim() && searchResults.length === 0 && (
          <div className={`${bodyPad} py-10 text-center`}>
            <div className="text-gray-400 text-sm mb-4">
              Không tìm thấy khách hàng &quot;{searchTerm}&quot;
            </div>
            <button type="button" onClick={onAddNewPatient} className={emptyBtnClass}>
              <UserPlus className="w-4 h-4" />
              Thêm khách hàng mới
            </button>
          </div>
        )}

        {!searchTerm.trim() && <RecentActivityTimeline {...activityTimeline} />}

        {searchResults.length > 0 && (
          <>
            {searchLoading && (
              <div className="flex items-center justify-center gap-2 py-2 text-gray-400 text-xs border-b border-gray-100">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Đang cập nhật...
              </div>
            )}
            <ul className="divide-y divide-gray-100">
              {visibleSearchResults.map((p) => (
                <PatientRow
                  key={p.id}
                  p={p}
                  isMenuOpen={expandedMenuPatientId === p.id}
                  onToggleMenu={onTogglePatientMenu}
                  onMenuAction={onMenuActionSearch}
                  onCallAction={onCallAction}
                  onZaloAction={onZaloAction}
                />
              ))}
            </ul>
            {canLoadMoreSearchResults && (
              <div className={`${bodyPad} py-3 border-t border-gray-100`}>
                <button type="button" onClick={onLoadMoreSearch} className={loadMoreBtnClass}>
                  Xem thêm ({visibleSearchResults.length}/{searchResults.length})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className={`border-t border-gray-100 ${footerPad}`}>
        <button type="button" onClick={onAddNewPatient} className={footerAddClass}>
          <UserPlus className="w-4 h-4" />
          Thêm khách hàng mới
        </button>
      </div>
    </div>
  );
}
