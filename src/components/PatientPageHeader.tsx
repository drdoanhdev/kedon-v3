'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Calendar, Phone, MapPin, AlertTriangle, MoreVertical, Users } from 'lucide-react';
import Link from 'next/link';

export interface PatientHeaderBenhNhan {
  id: number;
  mabenhnhan?: string | null;
  ten: string;
  namsinh: string;
  dienthoai?: string;
  diachi?: string;
  tuoi?: number;
}

export interface PatientHeaderNote {
  id: number;
  content: string;
  note_type: 'important' | 'normal';
}

interface BaseProps {
  benhNhan: PatientHeaderBenhNhan | null;
  benhnhanid: string | null;
  patientNotes?: PatientHeaderNote[];
  onEditPatient: () => void;
  switchPageLink: string;
  switchPageLabel: string;
  onManageNotes?: () => void;
  familySummaryText?: string;
  /** Interactive family UI (chip). Takes precedence over familySummaryText when set. */
  familySection?: React.ReactNode;
  renderBackgroundUploadNotice?: () => React.ReactNode;
}

export interface PatientMobileHeaderProps extends BaseProps {
  switchPageIcon?: React.ReactNode;
  mobileTab: number;
  mobileTabLabels: readonly string[];
  onTabChange: (tab: number) => void;
  /** 0 = fully expanded, 1 = fully compact — driven by scroll position */
  mobileHeaderRatio?: number;
  className?: string;
}

export interface PatientDesktopCardProps extends BaseProps {
  className?: string;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp01(t);
}

// ─── Mobile Header ────────────────────────────────────────────────────────────

export function PatientMobileHeader({
  benhNhan,
  patientNotes = [],
  onEditPatient,
  switchPageLink,
  switchPageLabel,
  mobileTab,
  mobileTabLabels,
  onTabChange,
  onManageNotes,
  familySummaryText,
  familySection,
  renderBackgroundUploadNotice,
  mobileHeaderRatio = 0,
  className,
}: PatientMobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const r = clamp01(mobileHeaderRatio);

  // ── Tính chiều cao thực tế của secondary rows từ nội dung ──────
  // Để maxHeight bắt đầu đúng bằng chiều cao thực → co ngay từ pixel đầu tiên.
  // Mỗi dòng text ~18px (font 12px × line-height 1.5), spacing mt-0.5 = 2px, mt-1 = 4px.
  const estimatedSecondaryH = (() => {
    if (!benhNhan) return 0;
    let h = 4; // mt-1 (khoảng cách trên đầu block)
    h += 18;   // row year+phone (luôn hiển thị)
    if (benhNhan.diachi)    h += 2 + 18; // mt-0.5 + address
    if (familySection || familySummaryText) h += 2 + 18; // mt-0.5 + family
    const noteCount = Math.min(2, patientNotes.length);
    if (noteCount > 0) {
      h += 4; // mt-1 trước block notes
      h += noteCount * 19 + Math.max(0, noteCount - 1) * 2;
    }
    return h + 6; // margin dưới + safety
  })();

  // ── Animation math (tất cả bắt đầu từ r = 0, đồng thời) ────────

  // Avatar: collapse hoàn tất ở r = 0.40
  const avatarProg    = clamp01(r / 0.40);
  const avatarSize    = Math.round(lerp(38, 0, avatarProg));
  const avatarOpacity = clamp01(1 - avatarProg * 1.5); // mờ nhanh hơn co

  // Name font: thu nhỏ đều theo r
  const nameFontSize = lerp(16.5, 14, r);

  // Secondary rows: maxHeight BẮT ĐẦU BẰNG estimatedSecondaryH → co ngay từ đầu
  const secondaryMaxH = Math.round(lerp(estimatedSecondaryH, 0, r));

  // Opacity fade: bắt đầu ở r=0.25, xong ở r=0.78 (giữ rõ lâu hơn)
  const secondaryOpacity = clamp01(1 - Math.max(0, r - 0.25) / 0.53);

  // Combined info (year • address inline): xuất hiện ở r = 0.58→1.0
  const combinedOpacity = clamp01((r - 0.58) / 0.42);

  // Padding: co theo r
  const pt = Math.round(lerp(12, 5, r));
  const pb = Math.round(lerp(8, 3, r));
  // ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const tabBar = (
    <div className="bg-[#f5f6f8] rounded-t-[14px] overflow-hidden px-1.5 pt-1 pb-0">
      <div className="flex">
        {mobileTabLabels.map((label, idx) => (
          <button
            key={label}
            type="button"
            onClick={() => onTabChange(idx)}
            className={`h-7 flex-1 text-xs font-medium relative ${
              mobileTab === idx ? 'text-[#1f78d7]' : 'text-gray-500 active:text-gray-700'
            }`}
          >
            {label}
            {mobileTab === idx && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#1f78d7] rounded-full" />
            )}
          </button>
        ))}
      </div>
    </div>
  );

  if (!benhNhan) {
    return (
      <div className={className}>
        <div className="sticky top-0 z-40 bg-[#1f78d7]">
          <div className="px-3 py-3">
            <p className="text-sm text-white/80">Không tìm thấy thông tin bệnh nhân.</p>
          </div>
          {tabBar}
        </div>
        {renderBackgroundUploadNotice?.()}
      </div>
    );
  }

  const avatarGap = avatarSize > 0 ? Math.round(lerp(9, 0, avatarProg)) : 0;

  return (
    <div className={className}>
      <div className="sticky top-0 z-40 bg-[#1f78d7]">
        <div
          className="px-3"
          style={{ paddingTop: `${pt}px`, paddingBottom: `${pb}px` }}
        >
          {/* ── ROW 1: Avatar + Name + Combined info + 3-dot menu ── */}
          <div className="flex items-center">

            {/* Avatar — shrinks and fades */}
            <div
              className="rounded-full bg-white/20 border border-white/30 flex-shrink-0 overflow-hidden flex items-center justify-center font-bold text-white"
              style={{
                width:  `${avatarSize}px`,
                height: `${avatarSize}px`,
                opacity: avatarOpacity,
                marginRight: `${avatarGap}px`,
                fontSize: `${Math.max(6, Math.round(avatarSize * 0.42))}px`,
              }}
            >
              {avatarSize > 5
                ? (benhNhan.ten || '?').trim().charAt(0).toUpperCase()
                : null}
            </div>

            {/* Name + combined info */}
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-baseline overflow-hidden" style={{ gap: combinedOpacity > 0 ? '5px' : '0px' }}>
                {/* Name */}
                <span className="font-extrabold text-white tracking-tight leading-tight whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{
                    fontSize: `${nameFontSize}px`,
                    /* shrink name to make room for combined info */
                    flex: combinedOpacity > 0.15 ? '0 1 auto' : '0 0 auto',
                    maxWidth: combinedOpacity > 0.15 ? '58%' : '100%',
                  }}
                >
                  {benhNhan.ten}
                </span>
                {benhNhan.mabenhnhan && combinedOpacity === 0 && (
                  <span className="text-white/55 text-[10px] font-medium ml-1.5 flex-shrink-0">
                    {benhNhan.mabenhnhan}
                  </span>
                )}

                {/* Combined: year • address — fades in beside name when compact */}
                {combinedOpacity > 0 && (
                  <span
                    className="text-white/60 whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0"
                    style={{ fontSize: '10.5px', opacity: combinedOpacity }}
                  >
                    {benhNhan.mabenhnhan ? `${benhNhan.mabenhnhan} • ` : ''}
                    {benhNhan.namsinh}
                    {benhNhan.diachi ? ` • ${benhNhan.diachi}` : ''}
                  </span>
                )}
              </div>
            </div>

            <Link
              href={switchPageLink}
              className="h-7 px-2.5 ml-1 rounded-full border border-white/40 bg-white/10 text-white text-[11px] font-semibold inline-flex items-center whitespace-nowrap hover:bg-white/20 active:bg-white/25 flex-shrink-0"
            >
              {switchPageLabel}
            </Link>

            {/* 3-dot menu */}
            <div ref={menuRef} className="relative flex-shrink-0">
              <button
                type="button"
                aria-label="Thêm"
                className="h-8 w-8 flex items-center justify-center text-white/75 hover:text-white rounded-full active:bg-white/10"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreVertical
                  style={{
                    width:  `${Math.round(lerp(20, 17, r))}px`,
                    height: `${Math.round(lerp(20, 17, r))}px`,
                  }}
                />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl shadow-2xl border border-gray-100 min-w-[196px] z-50 overflow-hidden">
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    onClick={() => { setMenuOpen(false); onEditPatient(); }}
                  >
                    Sửa thông tin
                  </button>
                  {onManageNotes && (
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors border-t border-gray-50"
                      onClick={() => { setMenuOpen(false); onManageNotes(); }}
                    >
                      Ghi chú
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── SECONDARY ROWS — clipped from bottom (tab bar "covers" them) ── */}
          {/*
            overflow:hidden + maxHeight → content clipped from the bottom upward.
            Tab bar always sits at the bottom of the sticky header.
            As maxHeight shrinks, last rows (notes → address → phone → year) disappear first,
            creating the illusion that the tab bar rises to cover them.
            NO CSS transition here — scroll drives this directly.
          */}
          <div
            style={{
              maxHeight: `${secondaryMaxH}px`,
              opacity:   secondaryOpacity,
              overflow:  'hidden',
            }}
          >
            {/* Row 2: Code + Year + Phone */}
            <div
              className="flex items-center gap-2 mt-1 text-white/85"
              style={{ fontSize: '12px' }}
            >
              {benhNhan.mabenhnhan && (
                <span className="font-medium text-white/70 flex-shrink-0">{benhNhan.mabenhnhan}</span>
              )}
              <Calendar
                className="text-white/60 flex-shrink-0"
                style={{ width: '13px', height: '13px' }}
              />
              <span>
                {benhNhan.namsinh}
                {benhNhan.tuoi !== undefined ? ` (${benhNhan.tuoi}t)` : ''}
              </span>
              {benhNhan.dienthoai && (
                <>
                  <Phone
                    className="text-white/60 flex-shrink-0"
                    style={{ width: '13px', height: '13px' }}
                  />
                  <span className="truncate">{benhNhan.dienthoai}</span>
                </>
              )}
            </div>

            {/* Row 3: Address */}
            {benhNhan.diachi && (
              <div
                className="flex items-center gap-2 mt-0.5 text-white/85"
                style={{ fontSize: '12px' }}
              >
                <MapPin
                  className="text-white/60 flex-shrink-0"
                  style={{ width: '13px', height: '13px' }}
                />
                <span className="truncate">{benhNhan.diachi}</span>
              </div>
            )}

            {/* Row 4: Family */}
            {familySection ?? (familySummaryText ? (
              <div
                className="flex items-center gap-2 mt-0.5 text-white/85"
                style={{ fontSize: '12px' }}
              >
                <Users
                  className="text-white/60 flex-shrink-0"
                  style={{ width: '13px', height: '13px' }}
                />
                <span className="truncate">{familySummaryText}</span>
              </div>
            ) : null)}

            {/* Row 5: Notes — no "Ghi chú:" prefix, amber if important */}
            {patientNotes.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {patientNotes.slice(0, 2).map((note) => (
                  <div key={note.id} className="flex items-start gap-1.5">
                    <AlertTriangle
                      className="flex-shrink-0"
                      style={{
                        width: '11px',
                        height: '11px',
                        marginTop: '2px',
                        color: note.note_type === 'important'
                          ? '#fbbf24'
                          : 'rgba(255,255,255,0.5)',
                      }}
                    />
                    <p
                      style={{
                        fontSize: '11px',
                        lineHeight: '1.35',
                        color: note.note_type === 'important'
                          ? '#fde68a'
                          : 'rgba(255,255,255,0.75)',
                      }}
                    >
                      {note.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar — rounded-t card in page bg, always pinned at bottom of header */}
        {tabBar}
      </div>

      {renderBackgroundUploadNotice?.()}
    </div>
  );
}

// ─── Desktop Card ─────────────────────────────────────────────────────────────

export function PatientDesktopCard({
  benhNhan,
  patientNotes = [],
  onEditPatient,
  switchPageLink,
  switchPageLabel,
  onManageNotes,
  familySummaryText,
  familySection,
  renderBackgroundUploadNotice,
  className,
}: PatientDesktopCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className={className}>
      {benhNhan ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">

              {/* Clickable patient info block */}
              <button
                type="button"
                className="w-full text-left group rounded-lg px-1 py-0.5 -mx-1 hover:bg-blue-50/50 transition-colors"
                onClick={onEditPatient}
              >
                <span className="font-extrabold text-base text-blue-700 tracking-tight leading-tight block group-hover:text-blue-800">
                  {benhNhan.ten}
                  {benhNhan.mabenhnhan ? (
                    <span className="ml-2 text-xs font-semibold text-gray-400">{benhNhan.mabenhnhan}</span>
                  ) : null}
                </span>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    {benhNhan.namsinh}
                    {benhNhan.tuoi !== undefined ? ` (${benhNhan.tuoi} tuổi)` : ''}
                  </span>
                  {benhNhan.dienthoai && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-gray-400" />
                      {benhNhan.dienthoai}
                    </span>
                  )}
                  {benhNhan.diachi && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-gray-400" />
                      {benhNhan.diachi}
                    </span>
                  )}
                </div>
              </button>

              {/* Family row */}
              {familySection ?? (familySummaryText ? (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 px-1">
                  <Users className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{familySummaryText}</span>
                </div>
              ) : null)}

              {/* Notes inline inside card — clickable to open notes dialog */}
              {patientNotes.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {patientNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      className="w-full text-left flex items-start gap-1.5 rounded px-1 py-0.5 -mx-1 hover:bg-amber-50/70 transition-colors"
                      onClick={onManageNotes}
                    >
                      <AlertTriangle
                        className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
                          note.note_type === 'important' ? 'text-red-500' : 'text-amber-500'
                        }`}
                      />
                      <p
                        className={`text-xs whitespace-pre-wrap leading-tight ${
                          note.note_type === 'important'
                            ? 'text-red-700 font-bold'
                            : 'text-gray-700'
                        }`}
                      >
                        {note.content}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Link
                href={switchPageLink}
                className="h-8 px-3 rounded-full border border-blue-200 text-blue-700 text-xs font-semibold inline-flex items-center whitespace-nowrap hover:bg-blue-50 active:bg-blue-100 transition-colors"
              >
                {switchPageLabel}
              </Link>

              {/* 3-dot menu */}
              <div ref={menuRef} className="relative flex-shrink-0">
                <button
                  type="button"
                  aria-label="Menu"
                  className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 min-w-[196px] z-50 overflow-hidden">
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => { setMenuOpen(false); onEditPatient(); }}
                    >
                      Sửa thông tin
                    </button>
                    {onManageNotes && (
                      <button
                        type="button"
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50"
                        onClick={() => { setMenuOpen(false); onManageNotes(); }}
                      >
                        Ghi chú
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-3 border border-gray-200">
          <p className="text-sm text-gray-400">Không tìm thấy thông tin bệnh nhân.</p>
        </div>
      )}

      {renderBackgroundUploadNotice && (
        <div className="mt-2">{renderBackgroundUploadNotice()}</div>
      )}
    </div>
  );
}
