'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Save,
  Trash2,
  X,
  ZoomIn,
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
  mediaOwnerId?: number | null;
  apiBasePath?: string;
  ownerIdField?: 'don_kinh_id' | 'don_thuoc_id';
  ownerLabel?: string;
  missingOwnerMessage?: string;
  mediaKind?: string;
  enableDraftWhenNoDonKinhId?: boolean;
  draftQueueResetToken?: number;
  onDraftQueueChange?: (items: DraftDonKinhUploadItem[]) => void;
  /** Gọi sau khi người dùng thêm ảnh thành công — dùng để auto-return về tab kê đơn */
  onPhotoAdded?: () => void;
  headerTitle?: string;
  draftNoticeText?: string;
}

export interface DraftDonKinhUploadItem {
  file: File;
  sourceDevice: 'camera' | 'file_picker';
}

interface DraftDonKinhPreviewItem extends DraftDonKinhUploadItem {
  tempId: string;
  previewUrl: string;
  createdAt: string;
}

const MAX_MEDIA_ITEMS = 6;
const PREVIEW_READ_TTL_SECONDS = 1200;
const COMPRESS_MAX_DIMENSION = 1280;
const COMPRESS_QUALITY = 0.72;
const COMPRESS_MIN_BYTES = 200 * 1024;
const COMPRESS_TARGET_MAX_BYTES = 350 * 1024;
const COMPRESS_MIME = 'image/webp';

async function compressImageFile(file: File): Promise<File> {
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

/** Khoảng cách giữa 2 ngón tay (pinch) */
function getTouchDist(t1: React.Touch, t2: React.Touch): number {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

export default function DonKinhMediaPanel({
  donKinhId,
  className = '',
  mediaOwnerId,
  apiBasePath = '/api/don-kinh/media',
  ownerIdField = 'don_kinh_id',
  ownerLabel = 'đơn kính',
  missingOwnerMessage = 'Chưa có đơn đang chọn.',
  mediaKind = 'don_kinh',
  enableDraftWhenNoDonKinhId = true,
  draftQueueResetToken,
  onDraftQueueChange,
  onPhotoAdded,
  headerTitle,
  draftNoticeText,
}: DonKinhMediaPanelProps) {
  const [items, setItems] = useState<DonKinhMediaItem[]>([]);
  const [draftItems, setDraftItems] = useState<DraftDonKinhPreviewItem[]>([]);
  const [, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyCount, setBusyCount] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // ── Lightbox touch & zoom state ──────────────────────────────────
  /** Scale hiện tại (1x–4x), dùng cho pinch-to-zoom */
  const [pinchScale, setPinchScale] = useState(1);
  /** Pan offset khi đang zoom */
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  /** Khoảng kéo xuống để dismiss lightbox */
  const [lightboxDragY, setLightboxDragY] = useState(0);

  /**
   * Ref theo dõi trạng thái touch trong lightbox.
   * Dùng ref thay state để tránh re-render khi đang animate.
   */
  const lightboxTouchRef = useRef<{
    startTouches: Array<{ x: number; y: number }>;
    startScale: number;
    startPanX: number;
    startPanY: number;
    startDist: number;
    mode: 'idle' | 'pinch' | 'swipe_h' | 'swipe_v' | 'pan';
  } | null>(null);

  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const draftCounterRef = useRef(0);
  const draftItemsRef = useRef<DraftDonKinhPreviewItem[]>([]);

  const resolvedOwnerId = mediaOwnerId ?? donKinhId;
  const isDraftMode = !resolvedOwnerId && enableDraftWhenNoDonKinhId;

  const activeCount = useMemo(() => {
    if (isDraftMode) return draftItems.length;
    return items.filter((item) => item.status !== 'failed').length;
  }, [isDraftMode, draftItems, items]);

  const canAddMore = activeCount < MAX_MEDIA_ITEMS;

  const previewItem = previewIndex !== null ? (items[previewIndex] || null) : null;

  useEffect(() => {
    if (!previewItem) {
      setNoteDraft('');
      // Reset zoom/pan/drag khi đóng lightbox
      setPinchScale(1);
      setPanOffset({ x: 0, y: 0 });
      setLightboxDragY(0);
      return;
    }
    setNoteDraft(previewItem.ghi_chu || '');
  }, [previewItem]);

  const refreshMedia = async () => {
    if (!resolvedOwnerId) {
      setItems([]);
      setPreviewIndex(null);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(apiBasePath, {
        params: {
          [ownerIdField]: resolvedOwnerId,
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
  }, [resolvedOwnerId, refreshTick, apiBasePath, ownerIdField]);

  useEffect(() => {
    if (!resolvedOwnerId || isDraftMode) return;
    const hasPending = items.some((item) => item.status === 'pending');
    if (!hasPending) return;

    const timer = window.setTimeout(() => {
      setRefreshTick((prev) => prev + 1);
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [items, resolvedOwnerId, isDraftMode]);

  useEffect(() => {
    onDraftQueueChange?.(draftItems.map((item) => ({
      file: item.file,
      sourceDevice: item.sourceDevice,
    })));
  }, [draftItems, onDraftQueueChange]);

  useEffect(() => {
    draftItemsRef.current = draftItems;
  }, [draftItems]);

  useEffect(() => {
    if (typeof draftQueueResetToken === 'undefined') return;
    setDraftItems((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }, [draftQueueResetToken]);

  useEffect(() => () => {
    draftItemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const bumpBusyCount = (delta: number) => {
    setBusyCount((prev) => Math.max(0, prev + delta));
  };

  const uploadSingleFile = async (file: File, sourceDevice: 'camera' | 'file_picker') => {
    if (!resolvedOwnerId) {
      toast.error(`Cần lưu/chọn ${ownerLabel} trước khi tải ảnh`);
      return;
    }

    const uploadFile = await compressImageFile(file);
    let mediaId: number | null = null;

    try {
      const createRes = await axios.post<CreateMediaResponse>(apiBasePath, {
        [ownerIdField]: resolvedOwnerId,
        loai_anh: mediaKind,
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
        await axios.patch(apiBasePath, {
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
        await axios.patch(apiBasePath, { id: mediaId, status: 'failed' }).catch(() => {});
      }

      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : (error instanceof Error ? error.message : String(error));
      toast.error(`Không tải được ảnh ${file.name}: ${message}`);
    }
  };

  const handleFiles = async (fileList: FileList | null, sourceDevice: 'camera' | 'file_picker') => {
    if (!fileList || fileList.length === 0) return;

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

    if (isDraftMode) {
      bumpBusyCount(files.length);
      const nextDraftItems: DraftDonKinhPreviewItem[] = [];

      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const compressed = await compressImageFile(file);
        const previewUrl = URL.createObjectURL(compressed);
        draftCounterRef.current += 1;
        nextDraftItems.push({
          tempId: `draft-${Date.now()}-${draftCounterRef.current}`,
          file: compressed,
          sourceDevice,
          previewUrl,
          createdAt: new Date().toISOString(),
        });
        bumpBusyCount(-1);
      }

      setDraftItems((prev) => [...prev, ...nextDraftItems]);
      toast.success(`Đã thêm ${nextDraftItems.length} ảnh tạm. Ảnh sẽ được tải khi lưu đơn.`);
      onPhotoAdded?.();
      return;
    }

    if (!resolvedOwnerId) {
      toast.error(`Cần lưu/chọn ${ownerLabel} trước khi tải ảnh`);
      return;
    }

    bumpBusyCount(files.length);
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await uploadSingleFile(file, sourceDevice);
      bumpBusyCount(-1);
    }

    setRefreshTick((prev) => prev + 1);
    onPhotoAdded?.();
  };

  const handleDeleteMedia = async (id: number) => {
    if (isDraftMode) {
      setDraftItems((prev) => {
        const target = prev.find((item) => item.tempId === String(id));
        if (target) {
          URL.revokeObjectURL(target.previewUrl);
        }
        return prev.filter((item) => item.tempId !== String(id));
      });
      return;
    }

    if (!window.confirm('Xóa ảnh này?')) return;

    const removedIndex = items.findIndex((item) => item.id === id);
    const deletingCurrentPreview = previewItem?.id === id;

    setDeletingId(id);
    try {
      await axios.delete(`${apiBasePath}?id=${id}`);
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

  const handleDeleteDraftMedia = (tempId: string) => {
    setDraftItems((prev) => {
      const target = prev.find((item) => item.tempId === tempId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.tempId !== tempId);
    });
  };

  const closePreview = () => {
    setPreviewIndex(null);
    setPinchScale(1);
    setPanOffset({ x: 0, y: 0 });
    setLightboxDragY(0);
    lightboxTouchRef.current = null;
  };

  const showPreviousPreview = () => {
    if (items.length === 0) return;
    setPinchScale(1);
    setPanOffset({ x: 0, y: 0 });
    setPreviewIndex((prev) => {
      if (prev === null) return 0;
      return (prev - 1 + items.length) % items.length;
    });
  };

  const showNextPreview = () => {
    if (items.length === 0) return;
    setPinchScale(1);
    setPanOffset({ x: 0, y: 0 });
    setPreviewIndex((prev) => {
      if (prev === null) return 0;
      return (prev + 1) % items.length;
    });
  };

  const saveNote = async () => {
    if (!previewItem) return;

    setSavingNote(true);
    try {
      await axios.patch(apiBasePath, {
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
        startScale: pinchScale,
        startPanX: panOffset.x,
        startPanY: panOffset.y,
        startDist: dist,
        mode: 'pinch',
      };
    } else if (touches.length === 1) {
      lightboxTouchRef.current = {
        startTouches: [{ x: touches[0].clientX, y: touches[0].clientY }],
        startScale: pinchScale,
        startPanX: panOffset.x,
        startPanY: panOffset.y,
        startDist: 0,
        mode: 'idle',
      };
    }
  };

  const onLightboxTouchMove = (e: React.TouchEvent) => {
    const ref = lightboxTouchRef.current;
    if (!ref) return;

    // ── Pinch-to-zoom (2 ngón tay) ──
    if (e.touches.length === 2 && ref.mode !== 'swipe_h' && ref.mode !== 'swipe_v') {
      const dist = getTouchDist(e.touches[0] as unknown as React.Touch, e.touches[1] as unknown as React.Touch);
      if (ref.startDist === 0) return;
      const newScale = Math.min(4, Math.max(1, ref.startScale * (dist / ref.startDist)));
      setPinchScale(newScale);
      ref.mode = 'pinch';
      return;
    }

    // ── 1 ngón tay ──
    if (e.touches.length === 1 && ref.startTouches.length >= 1) {
      const dx = e.touches[0].clientX - ref.startTouches[0].x;
      const dy = e.touches[0].clientY - ref.startTouches[0].y;

      // Xác định mode khi mới bắt đầu kéo
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
        // Pan ảnh khi đang zoom
        setPanOffset({ x: ref.startPanX + dx, y: ref.startPanY + dy });
      } else if (ref.mode === 'swipe_v') {
        // Kéo xuống để dismiss — chỉ cho kéo xuống (dy > 0)
        if (dy > 0) setLightboxDragY(dy);
      }
      // swipe_h: không làm gì trong move, xử lý ở touchEnd
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
      if (Math.abs(dx) > 45) {
        if (dx < 0) showNextPreview();
        else showPreviousPreview();
      }
    } else if (ref.mode === 'pinch') {
      // Snap về 1x nếu scale gần 1
      if (pinchScale < 1.12) {
        setPinchScale(1);
        setPanOffset({ x: 0, y: 0 });
      }
    }

    lightboxTouchRef.current = null;
  };

  // ── Render ───────────────────────────────────────────────────────

  /**
   * Empty state: vùng tap lớn chiếm toàn panel để dễ bấm hơn.
   * Hiển thị khi chưa có ảnh nào (activeCount === 0).
   */
  const canInteract = resolvedOwnerId || isDraftMode;

  const renderEmptyAddArea = () => (
    <button
      type="button"
      className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 text-blue-600 active:bg-blue-100 transition-colors disabled:opacity-50"
      onClick={() => captureInputRef.current?.click()}
      disabled={busyCount > 0 || !canInteract}
      data-no-tab-swipe
    >
      {busyCount > 0
        ? <Loader2 className="w-8 h-8 animate-spin" />
        : <Camera className="w-8 h-8" />
      }
      <span className="text-sm font-semibold">Chụp ảnh cho đơn này</span>
      <span className="text-xs text-blue-400">hoặc&nbsp;
        <span
          role="button"
          className="underline"
          onClick={(e) => { e.stopPropagation(); uploadInputRef.current?.click(); }}
        >
          chọn từ thư viện
        </span>
      </span>
    </button>
  );

  /** Nút thêm ảnh nhỏ (hiển thị khi đã có ≥1 ảnh) */
  const renderAddButtons = () => (
    <div className="flex items-center gap-2 px-3">
      <button
        type="button"
        className="h-8 px-2.5 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium inline-flex items-center gap-1 hover:bg-blue-100 disabled:opacity-60"
        onClick={() => captureInputRef.current?.click()}
        disabled={busyCount > 0 || !canAddMore || !canInteract}
        data-no-tab-swipe
      >
        {busyCount > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
        Chụp
      </button>
      <button
        type="button"
        className="h-8 px-2.5 border border-gray-300 bg-white text-gray-700 rounded-lg text-xs font-medium inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-60"
        onClick={() => uploadInputRef.current?.click()}
        disabled={busyCount > 0 || !canAddMore || !canInteract}
        data-no-tab-swipe
      >
        {busyCount > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
        Tải ảnh
      </button>
    </div>
  );

  // Lightbox dismiss opacity (mờ dần khi kéo xuống)
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
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 py-2 px-0 space-y-2 ${className}`} data-no-tab-swipe>
        <div className="flex items-center justify-between gap-2 px-3">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-sm tracking-tight">
              {headerTitle ?? `Ảnh ${ownerLabel}`}
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold flex-shrink-0">
              {activeCount}/{MAX_MEDIA_ITEMS}
            </span>
          </div>
        </div>

        {/* Hidden file inputs */}
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

        {isDraftMode ? (
          <div className="space-y-2 px-3">
            {draftItems.length === 0
              ? renderEmptyAddArea()
              : (
                <>
                  {renderAddButtons()}
                  <div className="grid grid-cols-2 gap-1 px-0" data-no-tab-swipe>
                    {draftItems.map((item, index) => (
                      <div
                        key={item.tempId}
                        className="relative aspect-square w-full rounded-xl border overflow-hidden bg-gray-100 border-gray-200"
                        data-no-tab-swipe
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.previewUrl}
                          alt={item.file.name || `draft-${index + 1}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute top-1 right-1 flex items-center gap-1">
                          <button
                            type="button"
                            className="h-5 w-5 rounded bg-red-600/80 text-white inline-flex items-center justify-center hover:bg-red-600"
                            onClick={() => handleDeleteDraftMedia(item.tempId)}
                            title="Xóa"
                            data-no-tab-swipe
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            }

            {draftNoticeText && (
              <p className="text-[11px] text-amber-600 font-medium">
                {draftNoticeText}
              </p>
            )}
            {!draftNoticeText && draftItems.length > 0 && (
              <p className="text-[11px] text-gray-500">
                Ảnh tạm chỉ lưu trong phiên hiện tại. Bấm Lưu đơn để tải ảnh lên hệ thống.
              </p>
            )}
          </div>
        ) : !resolvedOwnerId ? (
          <div className="mx-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-500">
            {missingOwnerMessage}
          </div>
        ) : (
          <div className="space-y-2">
            {items.length === 0
              ? <div className="px-3">{renderEmptyAddArea()}</div>
              : renderAddButtons()
            }

            {items.length > 0 && (
              <div className="grid grid-cols-2 gap-1 px-0" data-no-tab-swipe>
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="relative aspect-square w-full rounded-xl border overflow-hidden bg-gray-100 border-gray-200"
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

                    <div className="absolute top-1 right-1 flex items-center gap-1">
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {previewItem && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4" data-no-tab-swipe>
          {/* Backdrop — opacity giảm khi kéo xuống */}
          <div
            className="absolute inset-0 bg-black/80"
            style={{ opacity: lightboxDragY > 0 ? Math.max(0.1, 1 - lightboxDragY / 280) : undefined }}
            onClick={closePreview}
          />

          {/* Content wrapper — translate xuống khi kéo */}
          <div className="relative z-10 w-full max-w-5xl" style={lightboxContentStyle}>

            {/* Top bar */}
            <div className="flex items-center justify-between text-white mb-2">
              <div className="text-xs sm:text-sm truncate pr-2">
                {previewItem.original_filename || 'Ảnh xem trước'}
                {pinchScale > 1 && (
                  <span className="ml-2 text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">
                    {pinchScale.toFixed(1)}×
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Nút zoom-in nhanh khi chưa zoom */}
                {pinchScale === 1 && (
                  <button
                    type="button"
                    onClick={() => { setPinchScale(2); setPanOffset({ x: 0, y: 0 }); }}
                    className="h-8 w-8 rounded-lg bg-white/15 text-white hover:bg-white/25 inline-flex items-center justify-center"
                    title="Phóng to"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                )}
                {/* Nút reset zoom khi đang zoom */}
                {pinchScale > 1 && (
                  <button
                    type="button"
                    onClick={() => { setPinchScale(1); setPanOffset({ x: 0, y: 0 }); }}
                    className="h-8 px-2 rounded-lg bg-white/15 text-white hover:bg-white/25 text-[11px] font-semibold"
                    title="Đặt lại zoom"
                  >
                    1×
                  </button>
                )}
                {/* Nút chụp ảnh mới từ trong lightbox */}
                {canAddMore && (
                  <button
                    type="button"
                    onClick={() => captureInputRef.current?.click()}
                    className="h-8 w-8 rounded-lg bg-white/15 text-white hover:bg-white/25 inline-flex items-center justify-center"
                    title="Thêm ảnh"
                    disabled={busyCount > 0}
                  >
                    {busyCount > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
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
              {/* Prev / Next buttons — ẩn khi đang zoom (pan mode) */}
              {items.length > 1 && pinchScale === 1 && (
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
              {items.length > 1 && (
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10 pointer-events-none">
                  {items.map((_, idx) => (
                    <span
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === previewIndex ? 'bg-white' : 'bg-white/40'}`}
                    />
                  ))}
                </div>
              )}

              <div
                className="min-h-[52vh] sm:min-h-[70vh] max-h-[80vh] flex items-center justify-center overflow-hidden bg-black select-none"
                onTouchStart={onLightboxTouchStart}
                onTouchMove={onLightboxTouchMove}
                onTouchEnd={onLightboxTouchEnd}
              >
                {previewItem.read_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewItem.read_url}
                    alt={previewItem.original_filename || `preview-${previewItem.id}`}
                    draggable={false}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '80vh',
                      objectFit: 'contain',
                      transform: `scale(${pinchScale}) translate(${panOffset.x / pinchScale}px, ${panOffset.y / pinchScale}px)`,
                      transition: lightboxTouchRef.current ? 'none' : 'transform 0.18s ease',
                      cursor: pinchScale > 1 ? 'move' : 'zoom-in',
                      touchAction: 'none',
                    }}
                    onClick={() => {
                      if (pinchScale > 1) {
                        setPinchScale(1);
                        setPanOffset({ x: 0, y: 0 });
                      } else {
                        setPinchScale(2);
                        setPanOffset({ x: 0, y: 0 });
                      }
                    }}
                  />
                ) : (
                  <div className="text-sm text-white/70">Không có xem trước cho ảnh này</div>
                )}
              </div>
            </div>

            {/* Note area */}
            <div className="mt-2 rounded-xl border border-gray-200 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-gray-800">Ghi chú ngắn (tùy chọn)</label>
                <span className="text-[11px] text-gray-500">
                  {previewItem.width && previewItem.height ? `${previewItem.width}×${previewItem.height}` : '-'} · {formatBytes(previewItem.size_bytes)}
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
                  Lưu
                </button>
              </div>
            </div>

            {/* Swipe-down hint */}
            <p className="text-center text-[10px] text-white/40 mt-1.5 select-none">
              Vuốt xuống để đóng
            </p>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
