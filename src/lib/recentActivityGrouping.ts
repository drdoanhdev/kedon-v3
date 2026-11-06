import type { RecentActivityEvent } from './recentActivity';

export type ActivityDayGroup = {
  dayKey: string;
  header: string;
  items: RecentActivityEvent[];
};

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getActivityDayKey(timestamp: number): string {
  return toDayKey(new Date(timestamp));
}

export function formatActivityDayHeader(dayKey: string, now: Date = new Date()): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;

  const day = new Date(y, m - 1, d);
  const today = startOfLocalDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (day.getTime() === today.getTime()) return 'Hôm nay';
  if (day.getTime() === yesterday.getTime()) return 'Hôm qua';

  return day.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatActivityClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function groupActivitiesByDay(
  events: RecentActivityEvent[],
  now: Date = new Date()
): ActivityDayGroup[] {
  const groups = new Map<string, RecentActivityEvent[]>();

  for (const event of [...events].sort((a, b) => b.timestamp - a.timestamp)) {
    const key = getActivityDayKey(event.timestamp);
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }

  return Array.from(groups.entries()).map(([dayKey, items]) => ({
    dayKey,
    header: formatActivityDayHeader(dayKey, now),
    items,
  }));
}
