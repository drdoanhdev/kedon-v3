import { CalendarDays, Home, Users } from 'lucide-react';
import type { NavTab } from './types';

export const MOBILE_NAV_TABS: NavTab[] = [
  { href: '/', label: 'Trang chủ', icon: Home, match: (p) => p === '/' },
  {
    href: '/benh-nhan',
    label: 'Bệnh nhân',
    icon: Users,
    feature: 'patient_management',
    match: (p) => p.startsWith('/benh-nhan') || p.startsWith('/tra-cuu-khach-hang'),
  },
  {
    href: '/lich-hen',
    label: 'Lịch hẹn',
    icon: CalendarDays,
    feature: 'appointments',
    match: (p) => p.startsWith('/lich-hen'),
  },
];
