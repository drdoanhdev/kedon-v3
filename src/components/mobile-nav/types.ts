import type { ComponentType } from 'react';
import type { FeatureKey } from '../../lib/featureConfig';

export type MobileNavSheet = 'none' | 'search' | 'more' | 'fab';

export type DefaultAction = 'kinh' | 'thuoc' | 'hoso';
export type PatientMenuAction = DefaultAction | 'sua';
export type ActivityFilter = 'all' | 'search' | 'history' | 'prescription' | 'dang_do';

export interface NavTab {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  feature?: FeatureKey;
  match?: (pathname: string) => boolean;
}

export interface MoreItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  feature?: FeatureKey;
  visible?: boolean;
}
