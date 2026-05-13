'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImagePlus,
  Loader2,
  Maximize2,
  Save,
  Trash2,
  X,
} from 'lucide-react';

type MediaUploadStatus = 'pending' | 'uploaded' | 'failed';

interface DonKinhMediaItem {
  id: number;
  don_kinh_id: number;
  benhnhan_id: number;
  loai_anh: 'don_kinh' | 'gong_da_cat' | 'ket_qua_khuc_xa';
  status: MediaUploadStatus;
  read_url: string | null;
  original_filename: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  ghi_chu: string | null;
  sort_order: number | null;
  created_at: string;
}

interface SignedUploadTarget {
  method: 'PUT';
  signedUrl: string;
  contentType: string;
}

interface CreateMediaResponse {
  data: DonKinhMediaItem;
  upload: SignedUploadTarget;
}

interface DonKinhMediaPanelProps {
  donKinhId: number | null;
  className?: string;
}

const MAX_MEDIA_ITEMS = 6;
const PREVIEW_READ_TTL_SECONDS = 1200;
// Nén ảnh client để tiết kiệm storage + bandwidth
const COMPRESS_MAX_DIMENSION = 1280; // cạnh dài tối đa (px)
const COMPRESS_QUALITY = 0.72; // chất lượng mặc định
const COMPRESS_MIN_BYTES = 200 * 1024; // <200KB thì không nén
const COMPRESS_TARGET_MAX_BYTES = 350 * 1024; // mục tiêu dung lượng sau nén
const COMPRESS_MIME = 'image/webp';

async function compressImageFile(file: File): Promise<File> {
  // Chỉ nén ảnh raster phổ biến; bỏ qua GIF/SVG để không phá animation/vector
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  if (file.size < COMPRESS_MIN_BYTES) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode_failed'));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return file;

    const longest = Math.max(srcW, srcH);
    const scale = longest > COMPRESS_MAX_DIMENSION ? COMPRESS_MAX_DIMENSION / longest : 1;
    const targetW = Math.round(srcW * scale);
    const targetH = Math.round(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const encodeBlob = async (mime: string, quality: number): Promise<Blob | null> => new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), mime, quality);
    });

    // Nén thích ứng để đưa ảnh về gần ngưỡng mục tiêu, giúp giảm chi phí lưu trữ/băng thông.
    const qualitySteps = [COMPRESS_QUALITY, 0.64, 0.56, 0.48];
    let blob: Blob | null = null;
    for (const quality of qualitySteps) {
      // eslint-disable-next-line no-await-in-loop
      blob = await encodeBlob(COMPRESS_MIME, quality);
      if (!blob) continue;
      if (blob.size <= COMPRESS_TARGET_MAX_BYTES) break;
    }

    if (!blob) {
      blob = await encodeBlob('image/jpeg', 0.68);
    }
    if (!blob) return file;

    // Nếu nén ra to hơn file gốc thì giữ nguyên file gốc
    if (blob.size >= file.size) return file;

    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    const outputExt = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const outputType = blob.type || 'image/jpeg';
    return new File([blob], `${baseName}.${outputExt}`, { type: outputType, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeSortOrder(value: number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortMediaItems(items: DonKinhMediaItem[]): DonKinhMediaItem[] {
  return [...items].sort((a, b) => {
    const sortA = normalizeSortOrder(a.sort_order);
    const sortB = normalizeSortOrder(b.sort_order);
    if (sortA !== sortB) return sortA - sortB;

    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }

    return a.id - b.id;
  });
}

function moveArrayItem<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return array;
  const next = [...array];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Cannot read image dimensions'));
      img.src = objectUrl;
    });
    return size;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function DonKinhMediaPanel({ donKinhId, className = '' }: DonKinhMediaPanelProps) {
  const [items, setItems] = useState<DonKinhMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyCount, setBusyCount] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const activeCount = useMemo(
    () => items.filter((item) => item.status !== 'failed').length,
    [items]
  );
  const canAddMore = Boolean(donKinhId) && activeCount < MAX_MEDIA_ITEMS;

  const previewItem = previewIndex !== null ? (items[previewIndex] || null) : null;

  useEffect(() => {
    if (!previewItem) {
      setNoteDraft('');
      setZoomed(false);
      return;
    }
    setNoteDraft(previewItem.ghi_chu || '');
    setZoomed(false);
  }, [previewItem]);

  const refreshMedia = async () => {
    if (!donKinhId) {
      setItems([]);
      setPreviewIndex(null);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get('/api/don-kinh/media', {
        params: {
          don_kinh_id: donKinhId,
          read_url_ttl_seconds: PREVIEW_READ_TTL_SECONDS,
        },
      });
      setItems(sortMediaItems((res.data?.data || []) as DonKinhMediaItem[]));
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : (error instanceof Error ? error.message : String(error));
      toast.error(`Lỗi tải media đơn kính: ${message}`);
      setItems([]);
      setPreviewIndex(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donKinhId, refreshTick]);

  const bumpBusyCount = (delta: number) => {
    setBusyCount((prev) => Math.max(0, prev + delta));
  };

  const uploadSingleFile = async (file: File, sourceDevice: 'camera' | 'file_picker') => {
    if (!donKinhId) {
      toast.error('Cần lưu/chọn đơn kính trước khi tải ảnh');
      return;
    }

    // Nén ảnh phía client để tiết kiệm dung lượng & băng thông
    const uploadFile = await compressImageFile(file);

    let mediaId: number | null = null;

    try {
      const createRes = await axios.post<CreateMediaResponse>('/api/don-kinh/media', {
        don_kinh_id: donKinhId,
        loai_anh: 'don_kinh',
        mime_type: uploadFile.type || 'image/jpeg',
        size_bytes: uploadFile.size,
        original_filename: uploadFile.name,
        source_device: sourceDevice,
        captured_at: new Date().toISOString(),
      });

      const uploadMeta = createRes.data?.upload;
      mediaId = createRes.data?.data?.id ?? null;

      if (!uploadMeta?.signedUrl) {
        throw new Error('Không nhận được signed upload URL');
      }

      const uploadRes = await fetch(uploadMeta.signedUrl, {
        method: uploadMeta.method || 'PUT',
        headers: {
          'Content-Type': uploadMeta.contentType || uploadFile.type || 'application/octet-stream',
        },
        body: uploadFile,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload thất bại (${uploadRes.status})`);
      }

      const imageDimensions = await readImageDimensions(uploadFile);

      if (mediaId) {
        await axios.patch('/api/don-kinh/media', {
          id: mediaId,
          status: 'uploaded',
          width: imageDimensions?.width,
          height: imageDimensions?.height,
          size_bytes: uploadFile.size,
        });
      }

      const savedKB = Math.max(0, Math.round((file.size - uploadFile.size) / 1024));
      if (savedKB > 50) {
        toast.success(`Đã tải ảnh: ${file.name} (tiết kiệm ${savedKB} KB)`);
      } else {
        toast.success(`Đã tải ảnh: ${file.name}`);
      }
    } catch (error: unknown) {
      if (mediaId) {
        await axios.patch('/api/don-kinh/media', { id: mediaId, status: 'failed' }).catch(() => {});
      }

      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : (error instanceof Error ? error.message : String(error));
      toast.error(`Không tải được ảnh ${file.name}: ${message}`);
    }
  };

  const handleFiles = async (fileList: FileList | null, sourceDevice: 'camera' | 'file_picker') => {
    if (!fileList || fileList.length === 0) return;
    if (!donKinhId) {
      toast.error('Cần lưu/chọn đơn kính trước khi tải ảnh');
      return;
    }

    const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return;
    }

    const slots = Math.max(0, MAX_MEDIA_ITEMS - activeCount);
    if (slots <= 0) {
      toast.error(`Mỗi đơn chỉ tối đa ${MAX_MEDIA_ITEMS} ảnh`);
      return;
    }

    const files = imageFiles.slice(0, slots);
    if (files.length < imageFiles.length) {
      toast(`Chỉ tải ${slots} ảnh đầu tiên để đảm bảo giới hạn ${MAX_MEDIA_ITEMS}`);
    }

    bumpBusyCount(files.length);
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await uploadSingleFile(file, sourceDevice);
      bumpBusyCount(-1);
    }

    setRefreshTick((prev) => prev + 1);
  };

  const handleDeleteMedia = async (id: number) => {
    if (!window.confirm('Xóa ảnh này?')) return;

    const removedIndex = items.findIndex((item) => item.id === id);
    const deletingCurrentPreview = previewItem?.id === id;

    setDeletingId(id);
    try {
      await axios.delete(`/api/don-kinh/media?id=${id}`);
      setItems((prev) => sortMediaItems(prev.filter((item) => item.id !== id)));

      if (deletingCurrentPreview) {
        setPreviewIndex(null);
      } else if (previewIndex !== null && removedIndex >= 0 && removedIndex < previewIndex) {
        setPreviewIndex(previewIndex - 1);
      }

      toast.success('Đã xóa ảnh');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : (error instanceof Error ? error.message : String(error));
      toast.error(`Không xóa được ảnh: ${message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const persistSortOrder = async (orderedItems: DonKinhMediaItem[]) => {
    const orders = orderedItems.map((item, index) => ({
      id: item.id,
      sort_order: index,
    }));
    await axios.patch('/api/don-kinh/media', { orders });
  };

  const reorderByIndex = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= items.length || toIndex >= items.length) return;

    const selectedPreviewId = previewItem?.id ?? null;
    const moved = moveArrayItem(items, fromIndex, toIndex)
      .map((item, index) => ({ ...item, sort_order: index }));

    setItems(moved);

    if (selectedPreviewId) {
      const nextPreviewIndex = moved.findIndex((item) => item.id === selectedPreviewId);
      setPreviewIndex(nextPreviewIndex >= 0 ? nextPreviewIndex : null);
    }

    try {
      await persistSortOrder(moved);
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : (error instanceof Error ? error.message : String(error));
      toast.error(`Không lưu được thứ tự ảnh: ${message}`);
      void refreshMedia();
    }
  };

  const reorderById = async (sourceId: number, targetId: number) => {
    if (sourceId === targetId) return;
    const sourceIndex = items.findIndex((item) => item.id === sourceId);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    await reorderByIndex(sourceIndex, targetIndex);
  };

  const handleMoveByStep = async (id: number, direction: -1 | 1) => {
    const sourceIndex = items.findIndex((item) => item.id === id);
    if (sourceIndex < 0) return;
    const targetIndex = sourceIndex + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    await reorderByIndex(sourceIndex, targetIndex);
  };

  const closePreview = () => {
    setPreviewIndex(null);
    setZoomed(false);
  };

  const showPreviousPreview = () => {
    if (items.length === 0) return;
    setPreviewIndex((prev) => {
      if (prev === null) return 0;
      return (prev - 1 + items.length) % items.length;
    });
    setZoomed(false);
  };

  const showNextPreview = () => {
    if (items.length === 0) return;
    setPreviewIndex((prev) => {
      if (prev === null) return 0;
      return (prev + 1) % items.length;
    });
    setZoomed(false);
  };

  const saveNote = async () => {
    if (!previewItem) return;

    setSavingNote(true);
    try {
      await axios.patch('/api/don-kinh/media', {
        id: previewItem.id,
        ghi_chu: noteDraft,
      });

      setItems((prev) => prev.map((item) => (
        item.id === previewItem.id
          ? { ...item, ghi_chu: noteDraft.trim() ? noteDraft.trim() : null }
          : item
      )));
      toast.success('Đã lưu ghi chú');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : (error instanceof Error ? error.message : String(error));
      toast.error(`Không lưu được ghi chú: ${message}`);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <>
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 py-2 px-0 space-y-2 ${className}`} data-no-tab-swipe>
        <div className="flex items-center justify-between gap-2 px-3">
          <div className="min-w-0 flex items-center gap-2">
            <h3 className="font-bold text-gray-900 text-sm tracking-tight">Ảnh đơn kính</h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
              {activeCount}/{MAX_MEDIA_ITEMS}
            </span>
          </div>
        </div>

        <input
          ref={captureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files, 'camera');
            e.currentTarget.value = '';
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files, 'file_picker');
            e.currentTarget.value = '';
          }}
        />

        <div className="flex items-center gap-2 px-3">
          <button
            type="button"
            className="h-8 px-2.5 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium inline-flex items-center gap-1 hover:bg-blue-100 disabled:opacity-60"
            onClick={() => captureInputRef.current?.click()}
            disabled={!donKinhId || busyCount > 0 || !canAddMore}
            data-no-tab-swipe
          >
            {busyCount > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            Chụp
          </button>
          <button
            type="button"
            className="h-8 px-2.5 border border-gray-300 bg-white text-gray-700 rounded-lg text-xs font-medium inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-60"
            onClick={() => uploadInputRef.current?.click()}
            disabled={!donKinhId || busyCount > 0 || !canAddMore}
            data-no-tab-swipe
          >
            {busyCount > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            Tải ảnh
          </button>
        </div>

        {!donKinhId ? (
          <div className="mx-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-500">
            Chưa có đơn đang chọn.
          </div>
        ) : (
          <div className="space-y-2">
            {items.length === 0 && (
              <div className="mx-3 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-600 flex items-center justify-between gap-2">
                <span>Chưa có ảnh. Bấm Tải ảnh hoặc Chụp để thêm nhanh.</span>
                <button
                  type="button"
                  className="h-7 px-2 rounded-lg border border-gray-300 bg-white text-[11px] hover:bg-gray-100 shrink-0"
                  onClick={() => uploadInputRef.current?.click()}
                  data-no-tab-swipe
                >
                  + Tải ảnh
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 px-0" data-no-tab-swipe>
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={`relative aspect-square w-full rounded-xl border overflow-hidden bg-gray-100 ${draggingId === item.id ? 'opacity-60 border-blue-400' : 'border-gray-200'}`}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(item.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(item.id));
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceIdRaw = e.dataTransfer.getData('text/plain');
                    const sourceId = Number.parseInt(sourceIdRaw, 10);
                    setDraggingId(null);
                    if (Number.isFinite(sourceId) && sourceId > 0) {
                      void reorderById(sourceId, item.id);
                    }
                  }}
                  data-no-tab-swipe
                >
                  <button
                    type="button"
                    className="absolute inset-0"
                    onClick={() => setPreviewIndex(index)}
                    data-no-tab-swipe
                  >
                    {item.read_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.read_url}
                        alt={item.original_filename || `don-kinh-${item.id}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[10px] text-gray-500 px-1 text-center">
                        {item.status === 'pending' ? 'Đang tải' : item.status === 'failed' ? 'Tải lỗi' : 'Không có xem trước'}
                      </div>
                    )}
                  </button>

                  <div className="absolute top-1 left-1 text-[10px] px-1 py-0.5 rounded bg-black/60 text-white font-semibold">
                    {index + 1}
                  </div>

                  <div className="absolute top-1 right-1 flex items-center gap-1">
                    <button
                      type="button"
                      className="h-5 w-5 rounded bg-black/55 text-white inline-flex items-center justify-center hover:bg-black/70"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewIndex(index);
                      }}
                      title="Xem lớn"
                      data-no-tab-swipe
                    >
                      <Maximize2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded bg-red-600/80 text-white inline-flex items-center justify-center hover:bg-red-600 disabled:opacity-60"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteMedia(item.id);
                      }}
                      disabled={deletingId === item.id}
                      title="Xóa"
                      data-no-tab-swipe
                    >
                      {deletingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>

                  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
                    <div className="h-5 px-1 rounded bg-black/55 text-white text-[9px] inline-flex items-center">
                      {item.status === 'uploaded' ? 'OK' : item.status === 'pending' ? 'UP' : 'FAIL'}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="h-5 w-5 rounded bg-black/55 text-white inline-flex items-center justify-center hover:bg-black/70 disabled:opacity-40"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleMoveByStep(item.id, -1);
                        }}
                        disabled={index === 0}
                        title="Lên trước"
                        data-no-tab-swipe
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        className="h-5 w-5 rounded bg-black/55 text-white inline-flex items-center justify-center hover:bg-black/70 disabled:opacity-40"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleMoveByStep(item.id, 1);
                        }}
                        disabled={index === items.length - 1}
                        title="Lùi sau"
                        data-no-tab-swipe
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                      <span className="h-5 w-5 rounded bg-black/55 text-white inline-flex items-center justify-center">
                        <GripVertical className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {canAddMore && (
                <button
                  type="button"
                  className="aspect-square w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 inline-flex flex-col items-center justify-center"
                  onClick={() => uploadInputRef.current?.click()}
                  title="Thêm ảnh"
                  data-no-tab-swipe
                >
                  <span className="text-xl leading-none">+</span>
                  <span className="text-[11px] font-medium">Thêm</span>
                </button>
              )}
            </div>

            {items.length > 0 && (
              <p className="px-3 text-[11px] text-gray-500">
                Kéo thả để sắp xếp. Ảnh đầu tiên là ảnh đại diện đơn kính.
              </p>
            )}
          </div>
        )}
      </div>

      {previewItem && (
        <div className="fixed inset-0 z-[90] p-2 sm:p-4 flex items-center justify-center" data-no-tab-swipe>
          <div className="absolute inset-0 bg-black/80" onClick={closePreview} />

          <div className="relative z-10 w-full max-w-5xl">
            <div className="flex items-center justify-between text-white mb-2">
              <div className="text-xs sm:text-sm">
                Ảnh {previewIndex !== null ? previewIndex + 1 : 1}/{items.length}
                {'  '}|{'  '}
                {formatDateTime(previewItem.created_at)}
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

            <div className="relative rounded-xl overflow-hidden bg-black">
              {items.length > 1 && (
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

              <div
                className="h-[62vh] sm:h-[70vh] flex items-center justify-center overflow-auto bg-black"
                onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
                onTouchEnd={(e) => {
                  if (touchStartX === null) return;
                  const endX = e.changedTouches[0]?.clientX ?? touchStartX;
                  const delta = endX - touchStartX;
                  if (Math.abs(delta) > 45) {
                    if (delta < 0) showNextPreview();
                    else showPreviousPreview();
                  }
                  setTouchStartX(null);
                }}
              >
                {previewItem.read_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewItem.read_url}
                    alt={previewItem.original_filename || `preview-${previewItem.id}`}
                    className={`max-w-full max-h-full object-contain transition-transform duration-200 ${zoomed ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'}`}
                    onClick={() => setZoomed((prev) => !prev)}
                  />
                ) : (
                  <div className="text-sm text-white/70">Không có xem trước cho ảnh này</div>
                )}
              </div>
            </div>

            <div className="mt-2 rounded-xl border border-gray-200 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-gray-800">Ghi chú ngắn (tùy chọn)</label>
                <span className="text-[11px] text-gray-500">
                  {previewItem.width && previewItem.height ? `${previewItem.width}x${previewItem.height}` : '-'} • {formatBytes(previewItem.size_bytes)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  maxLength={140}
                  placeholder="Nhập ghi chú ngắn cho ảnh..."
                  className="h-9 flex-1 min-w-0 bg-white border border-gray-300 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => void saveNote()}
                  disabled={savingNote}
                  className="h-9 px-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold inline-flex items-center gap-1 hover:bg-blue-100 disabled:opacity-60"
                >
                  {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Lưu ghi chú
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
