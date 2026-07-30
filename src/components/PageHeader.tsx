import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

/**
 * Shared page title row.
 * - Desktop (md+): title + optional subtitle + actions
 * - Mobile: title/subtitle hidden (shown by _app sticky bar); only actions if present
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  meta,
  className = '',
}: PageHeaderProps) {
  const hasActions = Boolean(actions);
  const hasDesktopTitle = Boolean(title);

  if (!hasDesktopTitle && !hasActions) return null;

  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${
        hasActions ? 'mb-4 md:mb-6' : 'mb-4 md:mb-6 hidden md:flex'
      } ${className}`.trim()}
    >
      <div className="hidden min-w-0 md:block">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold leading-tight text-gray-900 sm:text-2xl">{title}</h1>
          {meta}
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-gray-500 sm:mt-1">{subtitle}</p>
        ) : null}
      </div>
      {hasActions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
