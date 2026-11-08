import Link from 'next/link';
import type { FeatureKey } from '../../lib/featureConfig';
import type { NavTab } from './types';

export function NavTabItem({
  tab,
  active,
  resolveHref,
}: {
  tab: NavTab;
  active: boolean;
  resolveHref: (href: string, feature?: FeatureKey) => string;
}) {
  const Icon = tab.icon;
  const href = resolveHref(tab.href, tab.feature);
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
        active ? 'text-blue-600' : 'text-gray-500 active:text-blue-600'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {active && <span className="absolute top-0 w-8 h-0.5 rounded-full bg-blue-600" />}
      <Icon className={`w-5 h-5 ${active ? 'stroke-[2.4]' : ''}`} />
      <span className={`text-[10px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
        {tab.label}
      </span>
    </Link>
  );
}
