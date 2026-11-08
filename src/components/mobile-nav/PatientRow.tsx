import React, { memo } from 'react';
import {
  ChevronDown,
  FileText,
  Glasses,
  MessageCircle,
  Pencil,
  Phone,
} from 'lucide-react';
import { digitsOnly } from '../../lib/phone';
import type { PatientResult } from '../../lib/patientSearch';
import type { PatientMenuAction } from './types';

function PatientFabActionBtn({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  tone: 'emerald' | 'blue' | 'violet' | 'amber' | 'slate' | 'rose';
}) {
  const toneClass: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-100 active:bg-emerald-100',
    blue: 'bg-blue-50 text-blue-800 border-blue-100 active:bg-blue-100',
    violet: 'bg-violet-50 text-violet-800 border-violet-100 active:bg-violet-100',
    amber: 'bg-amber-50 text-amber-900 border-amber-100 active:bg-amber-100',
    slate: 'bg-slate-50 text-slate-800 border-slate-100 active:bg-slate-100',
    rose: 'bg-rose-50 text-rose-800 border-rose-100 active:bg-rose-100',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border px-0.5 py-1.5 min-w-0 text-[9px] font-semibold leading-tight transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed bg-gray-50 text-gray-400 border-gray-100' : toneClass[tone]
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="text-center">{label}</span>
    </button>
  );
}

export type PatientRowProps = {
  p: PatientResult;
  isMenuOpen: boolean;
  onToggleMenu: (patientId: number) => void;
  onMenuAction: (patient: PatientResult, action: PatientMenuAction) => void;
  onCallAction: (patient: PatientResult) => void;
  onZaloAction: (patient: PatientResult) => void;
  activityLabel?: string;
  activityRelativeTime?: string;
  staffLabel?: string;
};

export const PatientRow = memo(function PatientRow({
  p,
  isMenuOpen,
  onToggleMenu,
  onMenuAction,
  onCallAction,
  onZaloAction,
  activityLabel,
  activityRelativeTime,
  staffLabel,
}: PatientRowProps) {
  const phoneDigits = digitsOnly(p.dienthoai);
  const canContact = phoneDigits.length >= 8;

  return (
    <li className="bg-white">
      <button
        type="button"
        onClick={() => onToggleMenu(p.id)}
        aria-expanded={isMenuOpen}
        className="w-full px-4 py-2.5 flex items-center gap-3 text-left active:bg-gray-50"
      >
        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {(p.ten || '?')[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-gray-800 truncate">{p.ten || '(không tên)'}</span>
            {p.namsinh && <span className="text-xs text-gray-500 shrink-0">• {p.namsinh}</span>}
          </div>
          {(p.dienthoai || p.diachi) && (
            <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 min-w-0">
              {p.dienthoai && (
                <span className="flex items-center gap-1 shrink-0">
                  <Phone className="w-3 h-3" />
                  {p.dienthoai}
                </span>
              )}
              {p.dienthoai && p.diachi && <span className="text-gray-300">•</span>}
              {p.diachi && <span className="truncate">{p.diachi}</span>}
            </div>
          )}
          {(activityLabel || activityRelativeTime || staffLabel) && (
            <div className="mt-1 flex items-center gap-1.5 min-w-0">
              {activityLabel && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 text-[10px] font-semibold truncate">
                  {activityLabel}
                </span>
              )}
              {staffLabel && (
                <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold shrink-0">
                  {staffLabel}
                </span>
              )}
              {activityRelativeTime && (
                <span className="text-[10px] text-gray-400 shrink-0">{activityRelativeTime}</span>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            isMenuOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {isMenuOpen && (
        <div className="px-3 pb-3 grid grid-cols-5 gap-1 border-t border-gray-50 pt-2">
          <PatientFabActionBtn
            label="Kê kính"
            icon={Glasses}
            tone="emerald"
            onClick={() => onMenuAction(p, 'kinh')}
          />
          <PatientFabActionBtn
            label="Kê thuốc"
            icon={FileText}
            tone="blue"
            onClick={() => onMenuAction(p, 'thuoc')}
          />
          <PatientFabActionBtn
            label="Sửa"
            icon={Pencil}
            tone="amber"
            onClick={() => onMenuAction(p, 'sua')}
          />
          <PatientFabActionBtn
            label="Gọi"
            icon={Phone}
            tone="emerald"
            disabled={!canContact}
            onClick={() => onCallAction(p)}
          />
          <PatientFabActionBtn
            label="Zalo"
            icon={MessageCircle}
            tone="blue"
            disabled={!canContact}
            onClick={() => onZaloAction(p)}
          />
        </div>
      )}
    </li>
  );
});
