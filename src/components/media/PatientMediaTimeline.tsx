'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
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
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

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
          params: {
            benhnhan_id: patientId,
            read_url_ttl_seconds: READ_URL_TTL_SECONDS,
          },
        }),
      });
    }

    if (shouldFetchDonKinh) {
      requestEntries.push({
        source: 'don_kinh',
        request: axios.get('/api/don-kinh/media', {
          params: {
            benhnhan_id: patientId,
            read_url_ttl_seconds: READ_URL_TTL_SECONDS,
          },
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

  const showPreviousPreview = () => {
    if (filteredItems.length === 0) return;
    setPreviewIndex((prev) => {
      if (prev === null) return 0;
      return (prev - 1 + filteredItems.length) % filteredItems.length;
    });
  };

  const showNextPreview = () => {
    if (filteredItems.length === 0) return;
    setPreviewIndex((prev) => {
      if (prev === null) return 0;
      return (prev + 1) % filteredItems.length;
    });
  };

  const closePreview = () => {
    setPreviewIndex(null);
    setTouchStartX(null);
  };

  const onPreviewTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.touches[0]?.clientX ?? null);
  };

  const onPreviewTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;
    const dx = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    setTouchStartX(null);
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx < 0) {
      showNextPreview();
    } else {
      showPreviousPreview();
    }
  };

  const gridClassName = dense
    ? 'grid grid-cols-2 gap-1'
    : 'grid grid-cols-3 sm:grid-cols-4 gap-1';

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
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewItem && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4" data-no-tab-swipe>
              <div className="absolute inset-0 bg-black/80" onClick={closePreview} />

              <div className="relative z-10 w-full max-w-5xl">
                <div className="flex items-center justify-between text-white mb-2">
                  <div className="text-xs sm:text-sm truncate pr-2">
                    {formatDateLabel(previewItem.timelineAt)} {formatTimeLabel(previewItem.timelineAt)}
                  </div>
                  <button
                    type="button"
                    onClick={closePreview}
                    className="h-8 w-8 rounded-lg bg-white/15 text-white hover:bg-white/25 inline-flex items-center justify-center"
                    title="Đóng"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div
                  className="relative rounded-xl overflow-hidden bg-black shadow-2xl"
                  onTouchStart={onPreviewTouchStart}
                  onTouchEnd={onPreviewTouchEnd}
                >
                  {filteredItems.length > 1 && (
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

                  <div className="w-full flex items-center justify-center bg-black min-h-[45vh] max-h-[78vh]">
                    {previewItem.status === 'uploaded' && previewItem.readUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewItem.readUrl}
                        alt={previewItem.originalFilename || previewItem.key}
                        className="max-h-[78vh] w-auto object-contain"
                      />
                    ) : (
                      <div className="px-3 py-10 text-center text-sm text-white/90">
                        {getStatusText(previewItem.status)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
