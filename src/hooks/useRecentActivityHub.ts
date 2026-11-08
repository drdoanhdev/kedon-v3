import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collapseActivitiesToLatestPerPatient,
  getRecentPatientsFromActivities,
  loadRecentActivities,
  subscribeRecentActivityUpdates,
  type RecentActivityEvent,
} from '../lib/recentActivity';
import { groupActivitiesByDay, type ActivityDayGroup } from '../lib/recentActivityGrouping';
import {
  getRecentActivitySyncStatus,
  scheduleRecentActivitySync,
  subscribeRecentActivitySyncStatus,
} from '../lib/recentActivitySync';
import { actionCategory, isDangDoAction } from '../lib/mobileNavActivity';
import type { ActivityFilter } from '../components/mobile-nav/types';
import type { PatientResult } from '../lib/patientSearch';
import {
  ACTIVITY_TIMELINE_INITIAL,
  ACTIVITY_TIMELINE_STEP,
} from '../components/mobile-nav/constants';

export function useRecentActivityHub(searchOpen: boolean) {
  const [recentActivities, setRecentActivities] = useState<RecentActivityEvent[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [activityVisibleCount, setActivityVisibleCount] = useState(ACTIVITY_TIMELINE_INITIAL);
  const [syncingActivity, setSyncingActivity] = useState(false);
  const [activityLastSyncAt, setActivityLastSyncAt] = useState<number | null>(null);
  const [activitySyncError, setActivitySyncError] = useState('');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [expandedMenuPatientId, setExpandedMenuPatientId] = useState<number | null>(null);
  const [syncMetaTick, setSyncMetaTick] = useState(0);

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return recentActivities;
    if (activityFilter === 'dang_do') {
      return recentActivities.filter((activity) => isDangDoAction(activity.action));
    }
    return recentActivities.filter((activity) => actionCategory(activity.action) === activityFilter);
  }, [activityFilter, recentActivities]);

  const displayActivities = useMemo(
    () => collapseActivitiesToLatestPerPatient(filteredActivities),
    [filteredActivities]
  );

  const recentPatients = useMemo(
    () => getRecentPatientsFromActivities(displayActivities) as PatientResult[],
    [displayActivities]
  );

  const visibleActivities = useMemo(
    () => displayActivities.slice(0, activityVisibleCount),
    [displayActivities, activityVisibleCount]
  );

  const activityDayGroups: ActivityDayGroup[] = useMemo(
    () => groupActivitiesByDay(visibleActivities),
    [visibleActivities]
  );

  const canLoadMoreActivities = displayActivities.length > activityVisibleCount;

  const activitySyncMetaText = useMemo(() => {
    void syncMetaTick;
    if (syncingActivity) return 'Đang đồng bộ...';
    if (activitySyncError) return activitySyncError;
    if (pendingSyncCount > 0) return `Chờ đồng bộ: ${pendingSyncCount}`;
    if (!activityLastSyncAt) return 'Chưa đồng bộ';

    const diffMs = Math.max(0, Date.now() - activityLastSyncAt);
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Đã đồng bộ: vừa xong';
    if (mins < 60) return `Đã đồng bộ: ${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    return `Đã đồng bộ: ${hours} giờ trước`;
  }, [activityLastSyncAt, activitySyncError, pendingSyncCount, syncingActivity, syncMetaTick]);

  const togglePatientMenu = useCallback((patientId: number) => {
    setExpandedMenuPatientId((prev) => (prev === patientId ? null : patientId));
  }, []);

  const loadMoreActivities = useCallback(() => {
    setActivityVisibleCount((prev) => prev + ACTIVITY_TIMELINE_STEP);
  }, []);

  const clearExpandedMenu = useCallback(() => {
    setExpandedMenuPatientId(null);
  }, []);

  useEffect(() => {
    return subscribeRecentActivityUpdates((events) => {
      setRecentActivities(events);
    });
  }, []);

  useEffect(() => {
    return subscribeRecentActivitySyncStatus((status) => {
      setSyncingActivity(status.syncing);
      setActivityLastSyncAt(status.lastSyncAt);
      setActivitySyncError(status.error);
      setPendingSyncCount(status.pendingCount);
    });
  }, []);

  useEffect(() => {
    setActivityVisibleCount(ACTIVITY_TIMELINE_INITIAL);
  }, [activityFilter]);

  useEffect(() => {
    if (!searchOpen) {
      setExpandedMenuPatientId(null);
      setActivityFilter('all');
      setActivityVisibleCount(ACTIVITY_TIMELINE_INITIAL);
      return;
    }

    setRecentActivities(loadRecentActivities());
    const status = getRecentActivitySyncStatus();
    setActivityLastSyncAt(status.lastSyncAt);
    setActivitySyncError(status.error);
    setPendingSyncCount(status.pendingCount);
    setSyncingActivity(status.syncing);
    setActivityFilter('all');
    setActivityVisibleCount(ACTIVITY_TIMELINE_INITIAL);
    setExpandedMenuPatientId(null);
    scheduleRecentActivitySync('open_search');
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const id = window.setInterval(() => setSyncMetaTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [searchOpen]);

  return {
    activityFilter,
    setActivityFilter,
    activitySyncMetaText,
    activitySyncError,
    syncingActivity,
    activityDayGroups,
    canLoadMoreActivities,
    visibleActivityCount: visibleActivities.length,
    totalActivityCount: displayActivities.length,
    loadMoreActivities,
    recentPatients,
    expandedMenuPatientId,
    togglePatientMenu,
    clearExpandedMenu,
    setExpandedMenuPatientId,
  };
}
