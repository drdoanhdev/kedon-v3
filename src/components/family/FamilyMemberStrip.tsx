'use client';

import React, { useState } from 'react';
import { Plus, Settings, Star, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { calcAge, formatRole, sortFamilyMembers } from './familyUtils';
import type { FamilyGroup } from './types';

interface FamilyMemberStripProps {
  family: FamilyGroup | null;
  loading?: boolean;
  benhnhanId: number;
  onSelectMember: (memberPatientId: number) => void;
  onOpenManage: () => void;
  onOpenSheet?: () => void;
  onOpenAdd?: () => void;
  className?: string;
}

const MAX_VISIBLE = 4;

export default function FamilyMemberStrip({
  family,
  loading,
  benhnhanId,
  onSelectMember,
  onOpenManage,
  onOpenSheet,
  onOpenAdd,
  className = '',
}: FamilyMemberStripProps) {
  const { has, loading: permLoading } = usePermissions();
  const canEdit = !permLoading && has('manage_patients');
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className={`rounded-xl border border-gray-200 bg-white px-3 py-2 animate-pulse ${className}`}>
        <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
        <div className="flex gap-2">
          <div className="h-7 w-24 bg-gray-200 rounded-full" />
          <div className="h-7 w-24 bg-gray-200 rounded-full" />
        </div>
      </div>
    );
  }

  if (!family) {
    return (
      <div className={`rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-3 py-2 ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-sm text-emerald-900">
            <Users className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>Chưa thuộc nhóm gia đình</span>
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs shrink-0"
              onClick={onOpenSheet ?? onOpenManage}
            >
              Thêm nhóm
            </Button>
          )}
        </div>
      </div>
    );
  }

  const sortedMembers = sortFamilyMembers(family.members);
  const visibleMembers = expanded ? sortedMembers : sortedMembers.slice(0, MAX_VISIBLE);
  const hiddenCount = sortedMembers.length - MAX_VISIBLE;

  return (
    <div className={`rounded-xl border border-emerald-100 bg-white px-3 py-2 space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 shrink-0 text-emerald-700" />
          <span className="text-sm font-semibold text-emerald-900 truncate">{family.name}</span>
          <span className="text-[11px] text-emerald-700/80 shrink-0">({family.members.length})</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canEdit && onOpenAdd && (
            <button
              type="button"
              onClick={onOpenAdd}
              className="h-7 w-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 inline-flex items-center justify-center"
              title="Thêm người thân"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onOpenManage}
              className="h-7 w-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 inline-flex items-center justify-center"
              title="Quản lý nhóm"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {visibleMembers.map((member) => {
          const isCurrent = member.benhnhan_id === benhnhanId;
          const name = member.patient?.ten || `#${member.benhnhan_id}`;
          const role = formatRole(member.role);
          const age = calcAge(member.patient?.namsinh);

          return (
            <button
              key={member.id}
              type="button"
              disabled={isCurrent}
              onClick={() => onSelectMember(member.benhnhan_id)}
              className={`inline-flex items-center gap-1 max-w-full rounded-full border px-2.5 py-1 text-xs transition-colors ${
                isCurrent
                  ? 'border-amber-300 bg-amber-50 text-amber-900 font-semibold cursor-default'
                  : 'border-gray-200 bg-gray-50 text-blue-700 hover:bg-blue-50 hover:border-blue-200'
              }`}
            >
              {member.is_primary && (
                <Star className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />
              )}
              <span className="truncate">{name}</span>
              {role && <span className="text-[10px] text-gray-500 shrink-0">· {role}</span>}
              {age && !isCurrent && <span className="text-[10px] text-gray-400 shrink-0">{age}</span>}
              {isCurrent && <span className="text-[10px] text-amber-700 shrink-0">· đang xem</span>}
            </button>
          );
        })}

        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-blue-600 hover:underline px-1"
          >
            +{hiddenCount} người
          </button>
        )}
        {expanded && sortedMembers.length > MAX_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-gray-500 hover:underline px-1"
          >
            Thu gọn
          </button>
        )}
      </div>
    </div>
  );
}
