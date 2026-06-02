'use client';

import React from 'react';

interface FamilyBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export default function FamilyBottomSheet({
  open,
  onClose,
  title = 'Nhóm gia đình',
  children,
}: FamilyBottomSheetProps) {
  if (!open) return null;

  return (
    <div
      className="lg:hidden fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-no-tab-swipe
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />
      <div
        className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col h-[78vh] max-h-[78vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-3 pb-2 flex-shrink-0">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}
