import { describe, expect, it } from 'vitest';
import {
  collapseActivitiesToLatestPerPatient,
  pruneEvents,
  type RecentActivityEvent,
} from './recentActivity';

function makeEvent(
  overrides: Partial<RecentActivityEvent> & {
    patientId: number;
    action: RecentActivityEvent['action'];
    timestamp: number;
  }
): RecentActivityEvent {
  return {
    eventId: overrides.eventId || `${overrides.timestamp}-${overrides.patientId}-${overrides.action}`,
    timestamp: overrides.timestamp,
    action: overrides.action,
    source: overrides.source,
    pendingSync: overrides.pendingSync,
    syncedAt: overrides.syncedAt ?? null,
    createdBy: overrides.createdBy ?? null,
    createdByName: overrides.createdByName ?? null,
    branchId: overrides.branchId ?? null,
    patient: {
      id: overrides.patientId,
      ten: overrides.patient?.ten || `BN ${overrides.patientId}`,
      dienthoai: overrides.patient?.dienthoai,
    },
  };
}

describe('collapseActivitiesToLatestPerPatient', () => {
  it('giữ một dòng mới nhất cho mỗi bệnh nhân', () => {
    const events = [
      makeEvent({ patientId: 1, action: 'search_hit', timestamp: 1000 }),
      makeEvent({ patientId: 1, action: 'open_profile', timestamp: 2000 }),
      makeEvent({ patientId: 2, action: 'open_rx_drug', timestamp: 1500 }),
    ];

    const collapsed = collapseActivitiesToLatestPerPatient(events);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].patient.id).toBe(1);
    expect(collapsed[0].action).toBe('open_profile');
    expect(collapsed[1].patient.id).toBe(2);
  });

  it('ưu tiên kê đơn hơn search_hit trong cửa sổ 2 phút', () => {
    const events = [
      makeEvent({ patientId: 9, action: 'search_hit', timestamp: 10_000 }),
      makeEvent({ patientId: 9, action: 'open_rx_glasses', timestamp: 9_500 }),
    ];

    const collapsed = collapseActivitiesToLatestPerPatient(events);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].action).toBe('open_rx_glasses');
  });

  it('giữ sự kiện mới hơn khi ngoài cửa sổ ưu tiên', () => {
    const events = [
      makeEvent({ patientId: 3, action: 'search_hit', timestamp: 1_000_000 }),
      makeEvent({ patientId: 3, action: 'open_rx_drug', timestamp: 1_000 }),
    ];

    const collapsed = collapseActivitiesToLatestPerPatient(events);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].action).toBe('search_hit');
    expect(collapsed[0].timestamp).toBe(1_000_000);
  });
});

describe('pruneEvents', () => {
  it('loại bỏ event ngoài cửa sổ retention', () => {
    const now = Date.now();
    const events = [
      makeEvent({ patientId: 1, action: 'open_profile', timestamp: now - 1000 }),
      makeEvent({
        patientId: 2,
        action: 'open_profile',
        timestamp: now - 10 * 24 * 60 * 60 * 1000,
      }),
    ];

    const pruned = pruneEvents(events, now);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].patient.id).toBe(1);
  });
});
