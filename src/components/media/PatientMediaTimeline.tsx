'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Calendar, ChevronLeft, ChevronRight, Loader2, RefreshCw, X } from 'lucide-react';

type UploadStatus = 'pending' | 'uploaded' | 'failed';
type TimelineSource = 'don_thuoc' | 'don_kinh';
type TimelineSourceFilter = TimelineSource | 'all';

interface DonThuocMediaApiItem {
  id: number;
  don_thuoc_id: number;
  benhnhan_id: number;
  status: UploadStatus;
  read_url: string | null;
  original_filename: string | null;
  captured_at: string | null;
  created_at: string;
}

interface DonKinhMediaApiItem {
  id: number;
  don_kinh_id: number;
  benhnhan_id: number;
  status: UploadStatus;
  read_url: string | null;
  original_filename: string | null;
  captured_at: string | null;
  created_at: string;
}

interface TimelineMediaItem {
  key: string;
  source: TimelineSource;
  sourceLabel: string;
  sourceOwnerId: number;
  status: UploadStatus;
  readUrl: string | null;
  originalFilename: string | null;
  capturedAt: string | null;
  createdAt: string;
  timelineAt: string;
}

interface TimelineGroup {
  dateKey: string;
  dateLabel: string;
  items: TimelineMediaItem[];
}

interface PatientMediaTimelineProps {
  patientId: number | null;
  className?: string;
  title?: string;
  dense?: boolean;
  sourceFilter?: TimelineSourceFilter;
  hideHeader?: boolean;
  onCountChange?: (count: number) => void;
  ownerIdFilter?: number | null;
}

const READ_URL_TTL_SECONDS = 1200;
const SWIPE_THRESHOLD = 36;

/** Badge màu cho từng nguồn ảnh */
const SOURCE_BADGE: Record<TimelineSource, { label: string; className: string }> = {
  don_thuoc: { label: '💊', className: 'bg-green-600/80 text-white' },
  don_kinh:  { label: '👓', className: 'bg-blue-600/80  text-white' },
};

function toTimelineAt(capturedAt: string | null, createdAt: string): string {
  return capturedAt || createdAt;
}

function toDateKey(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'invalid';
  return dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function formatDateLabel(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Không rõ ngày';
  return dt.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTimeLabel(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '--:--';
  return dt.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusText(status: UploadStatus): string {
  if (status === 'uploaded') return 'Đã tải';
  if (status === 'failed') return 'Tải lỗi';
  return 'Đang tải';
}

function sortTimelineItems(items: TimelineMediaItem[]): TimelineMediaItem[] {
  return [...items].sort((a, b) => {
    const ta = new Date(a.timelineAt).getTime();
    const tb = new Date(b.timelineAt).getTime();
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
      return tb - ta;
    }
    return b.sourceOwnerId - a.sourceOwnerId;
  });
}

/** Khoảng cách giữa 2 ngón tay */
function getTouchDist(t1: React.Touch, t2: React.Touch): number {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

export default function PatientMediaTimeline({
  patientId,
  className = '',
  title = 'Timeline ảnh bệnh nhân',
  dense = false,
  sourceFilter = 'all',
  hideHeader = false,
  onCountChange,
  ownerIdFilter,
}: PatientMediaTimelineProps) {
  const [items, setItems] = useState<TimelineMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // ── Lightbox touch state ─────────────────────────────────────────
  const [pinchScale, setPinchScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [lightboxDragY, setLightboxDragY] = useState(0);
  const lightboxTouchRef = useRef<{
    startTouches: Array<{ x: number; y: number }>;
    startScale: number;
    startPanX: number;
    startPanY: number;
    startDist: number;
    mode: 'idle' | 'pinch' | 'swipe_h' | 'swipe_v' | 'pan';
  } | null>(null);

  const fetchTimeline = async () => {
    if (!patientId) {
      setItems([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const shouldFetchDonThuoc = sourceFilter === 'all' || sourceFilter === 'don_thuoc';
    const shouldFetchDonKinh = sourceFilter === 'all' || sourceFilter === 'don_kinh';

    const requestEntries: Array<{ source: TimelineSource; request: Promise<any> }> = [];

    if (shouldFetchDonThuoc) {
      requestEntries.push({
        source: 'don_thuoc',
        request: axios.get('/api/don-thuoc/media', {
          params: { benhnhan_id: patientId, read_url_ttl_seconds: READ_URL_TTL_SECONDS },
        }),
      });
    }

    if (shouldFetchDonKinh) {
      requestEntries.push({
        source: 'don_kinh',
        request: axios.get('/api/don-kinh/media', {
          params: { benhnhan_id: patientId, read_url_ttl_seconds: READ_URL_TTL_SECONDS },
        }),
      });
    }

    const settledResults = await Promise.allSettled(requestEntries.map((entry) => entry.request));

    const merged: TimelineMediaItem[] = [];
    const errors: string[] = [];

    settledResults.forEach((result, index) => {
      const source = requestEntries[index]?.source;
      if (!source) return;

      if (result.status !== 'fulfilled') {
        errors.push(source === 'don_thuoc' ? 'Không tải được ảnh đơn thuốc' : 'Không tải được ảnh đơn kính');
        return;
      }

      if (source === 'don_thuoc') {
        const rows = (result.value.data?.data || []) as DonThuocMediaApiItem[];
        rows.forEach((row) => {
          merged.push({
            key: `don_thuoc-${row.id}`,
            source: 'don_thuoc',
            sourceLabel: 'Đơn thuốc',
            sourceOwnerId: row.don_thuoc_id,
            status: row.status,
            readUrl: row.read_url,
            originalFilename: row.original_filename,
            capturedAt: row.captured_at,
            createdAt: row.created_at,
            timelineAt: toTimelineAt(row.captured_at, row.created_at),
          });
        });
        return;
      }

      const rows = (result.value.data?.data || []) as DonKinhMediaApiItem[];
      rows.forEach((row) => {
        merged.push({
          key: `don_kinh-${row.id}`,
          source: 'don_kinh',
          sourceLabel: 'Đơn kính',
          sourceOwnerId: row.don_kinh_id,
          status: row.status,
          readUrl: row.read_url,
          originalFilename: row.original_filename,
          capturedAt: row.captured_at,
          createdAt: row.created_at,
          timelineAt: toTimelineAt(row.captured_at, row.created_at),
        });
      });
    });

    setItems(sortTimelineItems(merged));
    setError(errors.length > 0 ? errors.join('. ') : null);
    setLoading(false);
  };

  useEffect(() => {
    void fetchTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, refreshTick, sourceFilter]);

  useEffect(() => {
    onCountChange?.(items.length);
  }, [items.length, onCountChange]);

  const hasPending = useMemo(() => items.some((item) => item.status === 'pending'), [items]);

  useEffect(() => {
    if (!hasPending || !patientId) return;
    const timer = window.setTimeout(() => {
      setRefreshTick((prev) => prev + 1);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [hasPending, patientId]);

  const filteredItems = useMemo(() => {
    if (ownerIdFilter == null) return items;
    return items.filter((item) => item.sourceOwnerId === ownerIdFilter);
  }, [items, ownerIdFilter]);

  const groups = useMemo<TimelineGroup[]>(() => {
    const map = new Map<string, TimelineGroup>();

    for (const item of filteredItems) {
      const dateKey = toDateKey(item.timelineAt);
      if (!map.has(dateKey)) {
        map.set(dateKey, {
          dateKey,
          dateLabel: formatDateLabel(item.timelineAt),
          items: [],
        });
      }
      map.get(dateKey)?.items.push(item);
    }

    return Array.from(map.values());
  }, [filteredItems]);

  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach((item, idx) => map.set(item.key, idx));
    return map;
  }, [filteredItems]);

  const previewItem = previewIndex !== null && previewIndex >= 0 && previewIndex < filteredItems.length
    ? filteredItems[previewIndex]
    : null;

  const closePreview = () => {
    setPreviewIndex(null);
    setPinchScale(1);
    setPanOffset({ x: 0, y: 0 });
    setLightboxDragY(0);
    lightboxTouchRef.current = null;
  };

  const showPreviousPreview = () => {
    if (filteredItems.length === 0) return;
    setPinchScale(1); setPanOffset({ x: 0, y: 0 });
    setPreviewIndex((prev) => {
      if (prev === null) return 0;
      return (prev - 1 + filteredItems.length) % filteredItems.length;
    });
  };

  const showNextPreview = () => {
    if (filteredItems.length === 0) return;
    setPinchScale(1); setPanOffset({ x: 0, y: 0 });
    setPreviewIndex((prev) => {
      if (prev === null) return 0;
      return (prev + 1) % filteredItems.length;
    });
  };

  // ── Lightbox touch handlers ──────────────────────────────────────

  const onLightboxTouchStart = (e: React.TouchEvent) => {
    const touches = e.touches;
    if (touches.length === 2) {
      const dist = getTouchDist(touches[0] as unknown as React.Touch, touches[1] as unknown as React.Touch);
      lightboxTouchRef.current = {
        startTouches: [
          { x: touches[0].clientX, y: touches[0].clientY },
          { x: touches[1].clientX, y: touches[1].clientY },
        ],
        startScale: pinchScale, startPanX: panOffset.x, startPanY: panOffset.y,
        startDist: dist, mode: 'pinch',
      };
    } else if (touches.length === 1) {
      lightboxTouchRef.current = {
        startTouches: [{ x: touches[0].clientX, y: touches[0].clientY }],
        startScale: pinchScale, startPanX: panOffset.x, startPanY: panOffset.y,
        startDist: 0, mode: 'idle',
      };
    }
  };

  const onLightboxTouchMove = (e: React.TouchEvent) => {
    const ref = lightboxTouchRef.current;
    if (!ref) return;

    if (e.touches.length === 2 && ref.mode !== 'swipe_h' && ref.mode !== 'swipe_v') {
      const dist = getTouchDist(e.touches[0] as unknown as React.Touch, e.touches[1] as unknown as React.Touch);
      if (ref.startDist === 0) return;
      const newScale = Math.min(4, Math.max(1, ref.startScale * (dist / ref.startDist)));
      setPinchScale(newScale);
      ref.mode = 'pinch';
      return;
    }

    if (e.touches.length === 1 && ref.startTouches.length >= 1) {
      const dx = e.touches[0].clientX - ref.startTouches[0].x;
      const dy = e.touches[0].clientY - ref.startTouches[0].y;

      if (ref.mode === 'idle' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        if (ref.startScale > 1) {
          ref.mode = 'pan';
        } else if (Math.abs(dy) > Math.abs(dx) && dy > 0) {
          ref.mode = 'swipe_v';
        } else {
          ref.mode = 'swipe_h';
        }
      }

      if (ref.mode === 'pan') {
        setPanOffset({ x: ref.startPanX + dx, y: ref.startPanY + dy });
      } else if (ref.mode === 'swipe_v' && dy > 0) {
        setLightboxDragY(dy);
      }
    }
  };

  const onLightboxTouchEnd = (e: React.TouchEvent) => {
    const ref = lightboxTouchRef.current;
    if (!ref) return;

    if (ref.mode === 'swipe_v') {
      if (lightboxDragY > 100) {
        closePreview();
      } else {
        setLightboxDragY(0);
      }
    } else if (ref.mode === 'swipe_h' && e.changedTouches.length > 0) {
      const dx = e.changedTouches[0].clientX - ref.startTouches[0].x;
      if (Math.abs(dx) < SWIPE_THRESHOLD) { lightboxTouchRef.current = null; return; }
      if (dx < 0) showNextPreview();
      else showPreviousPreview();
    } else if (ref.mode === 'pinch' && pinchScale < 1.12) {
      setPinchScale(1);
      setPanOffset({ x: 0, y: 0 });
    }

    lightboxTouchRef.current = null;
  };

  const gridClassName = dense
    ? 'grid grid-cols-2 gap-1'
    : 'grid grid-cols-3 sm:grid-cols-4 gap-1';

  const lightboxContentStyle: React.CSSProperties = lightboxDragY > 0
    ? {
        transform: `translateY(${lightboxDragY}px)`,
        transition: 'none',
        opacity: Math.max(0.25, 1 - lightboxDragY / 280),
      }
    : {
        transform: 'translateY(0)',
        transition: 'transform 0.22s ease, opacity 0.22s ease',
        opacity: 1,
      };

  return (
    <>
      <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-2 space-y-2 ${className}`} data-no-tab-swipe>
        {!hideHeader && (
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
              <h3 className={`font-bold text-gray-900 ${dense ? 'text-xs' : 'text-sm'} truncate`}>{title}</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold shrink-0">
                {filteredItems.length}
              </span>
            </div>
            <button
              type="button"
              className="h-7 w-7 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 inline-flex items-center justify-center"
              onClick={() => setRefreshTick((prev) => prev + 1)}
              disabled={loading}
              title="Tải lại"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {error && (
          <div className="mx-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            {error}
          </div>
        )}

        {patientId === null ? (
          <div className="mx-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2 py-2 text-xs text-gray-500">
            Chưa có bệnh nhân để xem timeline ảnh.
          </div>
        ) : items.length === 0 || filteredItems.length === 0 ? (
          <div className="mx-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2 py-2 text-xs text-gray-500">
            {loading
              ? 'Đang tải timeline ảnh...'
              : filteredItems.length === 0 && ownerIdFilter != null
                ? 'Đơn hiện tại chưa có ảnh.'
                : 'Chưa có ảnh theo timeline.'}
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <div key={group.dateKey} className="space-y-1">
                <div className="px-1 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  {group.dateLabel}
                </div>
                <div className={gridClassName}>
                  {group.items.map((item) => {
                    const index = itemIndexMap.get(item.key) ?? 0;
                    const badge = SOURCE_BADGE[item.source];
                    return (
                      <button
                        type="button"
                        key={item.key}
                        className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
                        onClick={() => setPreviewIndex(index)}
                        data-no-tab-swipe
                      >
                        {item.status === 'uploaded' && item.readUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.readUrl} alt={item.originalFilename || item.key} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center px-1 text-[10px] text-gray-500 text-center">
                            {getStatusText(item.status)}
                          </div>
                        )}
                        {/* Badge nguồn ảnh — chỉ hiển thị khi filter = 'all' */}
                        {sourceFilter === 'all' && (
                          <span className={`absolute bottom-1 left-1 text-[10px] px-1 py-0.5 rounded font-bold leading-none ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {previewItem && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4" data-no-tab-swipe>
              <div
                className="absolute inset-0 bg-black/80"
                style={{ opacity: lightboxDragY > 0 ? Math.max(0.1, 1 - lightboxDragY / 280) : undefined }}
                onClick={closePreview}
              />

              <div className="relative z-10 w-full max-w-5xl" style={lightboxContentStyle}>
                {/* Top bar */}
                <div className="flex items-center justify-between text-white mb-2">
                  <div className="text-xs sm:text-sm truncate pr-2 flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${SOURCE_BADGE[previewItem.source].className}`}>
                      {previewItem.sourceLabel}
                    </span>
                    <span>{formatDateLabel(previewItem.timelineAt)} {formatTimeLabel(previewItem.timelineAt)}</span>
                    {pinchScale > 1 && (
                      <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">
                        {pinchScale.toFixed(1)}×
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {pinchScale > 1 && (
                      <button
                        type="button"
                        onClick={() => { setPinchScale(1); setPanOffset({ x: 0, y: 0 }); }}
                        className="h-8 px-2 rounded-lg bg-white/15 text-white hover:bg-white/25 text-[11px] font-semibold"
                      >
                        1×
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closePreview}
                      className="h-8 w-8 rounded-lg bg-white/15 text-white hover:bg-white/25 inline-flex items-center justify-center"
                      title="Đóng"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Image area */}
                <div className="relative rounded-xl overflow-hidden bg-black shadow-2xl">
                  {filteredItems.length > 1 && pinchScale === 1 && (
                    <>
                      <button
                        type="button"
                        onClick={showPreviousPreview}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-white/15 text-white hover:bg-white/25 inline-flex items-center justify-center"
                        title="Ảnh trước"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={showNextPreview}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-white/15 text-white hover:bg-white/25 inline-flex items-center justify-center"
                        title="Ảnh sau"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}

                  {/* Dot indicator */}
                  {filteredItems.length > 1 && (
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10 pointer-events-none">
                      {filteredItems.map((_, idx) => (
                        <span
                          key={idx}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === previewIndex ? 'bg-white' : 'bg-white/40'}`}
                        />
                      ))}
                    </div>
                  )}

                  <div
                    className="w-full flex items-center justify-center bg-black min-h-[45vh] max-h-[78vh] overflow-hidden select-none"
                    onTouchStart={onLightboxTouchStart}
                    onTouchMove={onLightboxTouchMove}
                    onTouchEnd={onLightboxTouchEnd}
                  >
                    {previewItem.status === 'uploaded' && previewItem.readUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewItem.readUrl}
                        alt={previewItem.originalFilename || previewItem.key}
                        draggable={false}
                        style={{
                          maxHeight: '78vh',
                          width: 'auto',
                          objectFit: 'contain',
                          transform: `scale(${pinchScale}) translate(${panOffset.x / pinchScale}px, ${panOffset.y / pinchScale}px)`,
                          transition: lightboxTouchRef.current ? 'none' : 'transform 0.18s ease',
                          cursor: pinchScale > 1 ? 'move' : 'zoom-in',
                          touchAction: 'none',
                        }}
                        onClick={() => {
                          if (pinchScale > 1) { setPinchScale(1); setPanOffset({ x: 0, y: 0 }); }
                          else { setPinchScale(2); setPanOffset({ x: 0, y: 0 }); }
                        }}
                      />
                    ) : (
                      <div className="px-3 py-10 text-center text-sm text-white/90">
                        {getStatusText(previewItem.status)}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-center text-[10px] text-white/40 mt-1.5 select-none">
                  Vuốt xuống để đóng
                </p>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
