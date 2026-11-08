import React from 'react';

export function BottomSheet({
  onClose,
  children,
  fullHeight,
  sheetId,
  ariaLabelledBy,
}: {
  onClose: () => void;
  children: React.ReactNode;
  fullHeight?: boolean;
  sheetId?: string;
  ariaLabelledBy?: string;
}) {
  return (
    <div
      className="md:hidden fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] mbn-fade-in"
      />
      <div
        id={sheetId}
        className={`absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col mbn-slide-up ${
          fullHeight ? 'h-[92dvh]' : 'max-h-[80dvh]'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
