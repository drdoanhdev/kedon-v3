import React from 'react';

export function PageTabBtn({
  item,
  active,
  onClick,
}: {
  item:
    | { key: string; label: string; count?: number; icon?: React.ComponentType<{ className?: string }> }
    | undefined;
  active: boolean;
  onClick: () => void;
}) {
  if (!item) return <div />;
  const Icon = item.icon;
  const count = item.count;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
        active ? 'text-blue-600' : 'text-gray-500 active:text-blue-600'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {active && <span className="absolute top-0 w-8 h-0.5 rounded-full bg-blue-600" />}
      <div className="relative">
        {Icon ? (
          <Icon className={`w-5 h-5 ${active ? 'stroke-[2.4]' : ''}`} />
        ) : (
          <span className="text-[15px] font-bold leading-none">{item.label[0]}</span>
        )}
        {typeof count === 'number' && count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      <span className={`text-[10px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
        {item.label}
      </span>
    </button>
  );
}
