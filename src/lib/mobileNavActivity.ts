import type { RecentActivityAction } from './recentActivity';
import type { ActivityFilter, DefaultAction } from '../components/mobile-nav/types';

export function actionFromDefault(defaultAction: DefaultAction): RecentActivityAction {
  if (defaultAction === 'kinh') return 'open_rx_glasses';
  if (defaultAction === 'thuoc') return 'open_rx_drug';
  return 'open_profile';
}

export function actionLabel(action: RecentActivityAction): string {
  switch (action) {
    case 'search_hit':
      return 'Vừa tìm kiếm';
    case 'quick_history_open':
      return 'Mở nhanh lịch sử';
    case 'open_rx_drug':
      return 'Mở kê đơn thuốc';
    case 'open_rx_glasses':
      return 'Mở kê đơn kính';
    case 'open_profile':
    default:
      return 'Mở hồ sơ';
  }
}

export function actionCategory(action: RecentActivityAction): ActivityFilter {
  if (action === 'search_hit') return 'search';
  if (action === 'open_rx_drug' || action === 'open_rx_glasses') return 'prescription';
  return 'history';
}

export function isDangDoAction(action: RecentActivityAction): boolean {
  return action === 'search_hit' || action === 'quick_history_open' || action === 'open_profile';
}
