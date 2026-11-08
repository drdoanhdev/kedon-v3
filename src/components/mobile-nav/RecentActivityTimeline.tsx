import { GitBranch, History, RefreshCw, Search } from 'lucide-react';
import { formatActivityClock } from '../../lib/recentActivityGrouping';
import { actionLabel } from '../../lib/mobileNavActivity';
import type { PatientResult } from '../../lib/patientSearch';
import type { ActivityDayGroup } from '../../lib/recentActivityGrouping';
import type { ActivityFilter, PatientMenuAction } from './types';
import { PatientRow } from './PatientRow';

function ActivityFilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-gray-200 bg-white text-gray-600 active:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}

function staffBadgeLabel(fullName?: string | null): string {
  const name = (fullName || '').trim();
  if (!name) return '';
  const parts = name.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || name;
}

export type RecentActivityTimelineProps = {
  paddingClass: string;
  activityFilter: ActivityFilter;
  setActivityFilter: (filter: ActivityFilter) => void;
  activitySyncMetaText: string;
  activitySyncError: boolean;
  syncingActivity: boolean;
  onRefresh: () => void;
  activityDayGroups: ActivityDayGroup[];
  canLoadMoreActivities: boolean;
  visibleCount: number;
  totalCount: number;
  onLoadMore: () => void;
  expandedMenuPatientId: number | null;
  onToggleMenu: (patientId: number) => void;
  onMenuAction: (p: PatientResult, action: PatientMenuAction) => void;
  onCallAction: (p: PatientResult) => void;
  onZaloAction: (p: PatientResult) => void;
  needsBranch?: boolean;
  onPickBranch?: () => void;
  currentUserId?: string | null;
};

export function RecentActivityTimeline({
  paddingClass,
  activityFilter,
  setActivityFilter,
  activitySyncMetaText,
  activitySyncError,
  syncingActivity,
  onRefresh,
  activityDayGroups,
  canLoadMoreActivities,
  visibleCount,
  totalCount,
  onLoadMore,
  expandedMenuPatientId,
  onToggleMenu,
  onMenuAction,
  onCallAction,
  onZaloAction,
  needsBranch,
  onPickBranch,
  currentUserId,
}: RecentActivityTimelineProps) {
  return (
    <>
      <div className={`${paddingClass} pt-3 pb-1 flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-400">
          <History className="w-3 h-3" />
          Khách gần đây
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10px] truncate ${activitySyncError ? 'text-amber-600' : 'text-blue-500'}`}>
            {activitySyncMetaText}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={needsBranch}
            className="p-1 rounded-md text-blue-500 hover:bg-blue-50 active:scale-95 transition-transform disabled:opacity-40"
            aria-label="Đồng bộ lại hoạt động"
            title="Đồng bộ lại"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingActivity ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {needsBranch && (
        <div className={`${paddingClass} pb-2`}>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="text-xs font-semibold text-amber-900 mb-1">
              Chọn chi nhánh để đồng bộ khách gần đây
            </div>
            <div className="text-[11px] text-amber-800 mb-2">
              Activity Hub đồng bộ theo từng chi nhánh giữa các thiết bị. Khi đang xem &quot;Tất cả chi nhánh&quot;, hãy chọn một chi nhánh cụ thể.
            </div>
            <button
              type="button"
              onClick={onPickBranch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white active:scale-[0.98]"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Chọn chi nhánh
            </button>
          </div>
        </div>
      )}

      <div className={`${paddingClass} pb-2 flex items-center gap-1.5 overflow-x-auto`}>
        <ActivityFilterPill label="Tất cả" active={activityFilter === 'all'} onClick={() => setActivityFilter('all')} />
        <ActivityFilterPill
          label="Tìm kiếm"
          active={activityFilter === 'search'}
          onClick={() => setActivityFilter('search')}
        />
        <ActivityFilterPill
          label="Lịch sử"
          active={activityFilter === 'history'}
          onClick={() => setActivityFilter('history')}
        />
        <ActivityFilterPill
          label="Kê đơn"
          active={activityFilter === 'prescription'}
          onClick={() => setActivityFilter('prescription')}
        />
        <ActivityFilterPill
          label="Đang dang dở"
          active={activityFilter === 'dang_do'}
          onClick={() => setActivityFilter('dang_do')}
        />
      </div>

      {activityDayGroups.length > 0 ? (
        <>
          {activityDayGroups.map((group) => (
            <div key={group.dayKey}>
              <div className={`${paddingClass} sticky top-0 z-[1] bg-white/95 backdrop-blur-sm py-1.5`}>
                <div className="text-[11px] font-bold text-gray-500 tracking-wide">{group.header}</div>
              </div>
              <ul className="divide-y divide-gray-100">
                {group.items.map((activity) => {
                  const staffLabel =
                    activity.createdBy &&
                    currentUserId &&
                    activity.createdBy !== currentUserId
                      ? staffBadgeLabel(activity.createdByName)
                      : '';
                  return (
                    <PatientRow
                      key={activity.eventId}
                      p={activity.patient as PatientResult}
                      isMenuOpen={expandedMenuPatientId === activity.patient.id}
                      onToggleMenu={onToggleMenu}
                      onMenuAction={onMenuAction}
                      onCallAction={onCallAction}
                      onZaloAction={onZaloAction}
                      activityLabel={actionLabel(activity.action)}
                      activityRelativeTime={formatActivityClock(activity.timestamp)}
                      staffLabel={staffLabel || undefined}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
          {canLoadMoreActivities && (
            <div className={`${paddingClass} py-3 border-t border-gray-100`}>
              <button
                type="button"
                onClick={onLoadMore}
                className="w-full h-10 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium active:scale-[0.99] transition-transform"
              >
                Xem thêm ({visibleCount}/{totalCount})
              </button>
            </div>
          )}
        </>
      ) : (
        <div className={`${paddingClass} py-10 text-center text-gray-400 text-sm`}>
          <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <div className="font-medium text-gray-500 mb-1">
            {needsBranch ? 'Chưa thể đồng bộ danh sách' : 'Chưa có khách phù hợp'}
          </div>
          <div>
            {needsBranch
              ? 'Chọn chi nhánh để tải khách gần đây từ các thiết bị khác'
              : 'Đổi bộ lọc hoặc thao tác thêm để làm đầy Activity Hub'}
          </div>
        </div>
      )}
    </>
  );
}
