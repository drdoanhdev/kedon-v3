'use client';

import React from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { buildFamilyChipLabel } from './familyUtils';
import type { FamilyGroup } from './types';

interface FamilySummaryChipProps {
  family: FamilyGroup | null;
  loading?: boolean;
  benhnhanId: number;
  onOpen: () => void;
  /** Mobile header: white text on blue gradient */
  variant?: 'header' | 'default';
}

export default function FamilySummaryChip({
  family,
  loading,
  benhnhanId,
  onOpen,
  variant = 'header',
}: FamilySummaryChipProps) {
  if (loading) {
    return (
      <div
        className={`flex items-center gap-2 mt-0.5 animate-pulse ${
          variant === 'header' ? 'text-white/70' : 'text-gray-400'
        }`}
        style={{ fontSize: '12px' }}
      >
        <Users className="flex-shrink-0 opacity-60" style={{ width: '13px', height: '13px' }} />
        <span className="h-3 w-32 bg-current/20 rounded" />
      </div>
    );
  }

  const { primary, secondary } = buildFamilyChipLabel(family, benhnhanId);
  const isHeader = variant === 'header';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full flex items-center gap-2 mt-0.5 text-left min-w-0 active:opacity-80 ${
        isHeader ? 'text-white/90' : 'text-gray-600 hover:text-gray-800'
      }`}
      style={{ fontSize: '12px' }}
      data-no-tab-swipe
    >
      <Users
        className={`flex-shrink-0 ${isHeader ? 'text-white/60' : 'text-gray-400'}`}
        style={{ width: '13px', height: '13px' }}
      />
      <span className="truncate min-w-0">
        {primary}
        {secondary ? (
          <span className={isHeader ? 'text-white/70' : 'text-gray-500'}>
            {' · '}
            {secondary}
          </span>
        ) : null}
      </span>
      <ChevronRight
        className={`flex-shrink-0 ${isHeader ? 'text-white/50' : 'text-gray-400'}`}
        style={{ width: '14px', height: '14px' }}
      />
    </button>
  );
}
