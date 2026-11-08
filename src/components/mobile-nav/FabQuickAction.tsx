import React from 'react';

export function FabQuickAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm font-medium text-gray-700 hover:bg-blue-50 active:bg-blue-100 transition-colors"
    >
      <Icon className="w-4 h-4 text-blue-600" />
      <span>{label}</span>
    </button>
  );
}
