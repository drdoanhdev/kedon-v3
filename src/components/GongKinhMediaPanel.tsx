'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Camera,
  ImagePlus,
  Loader2,
  Trash2,
} from 'lucide-react';

type ImageKind = 'mat_truoc' | 'mat_trai' | 'mat_phai';

interface GongKinhMediaItem {
  id: number;
  gong_kinh_id: number;
  loai_anh: ImageKind;
  status: 'pending' | 'uploaded' | 'failed';
  read_url: string | null;
  original_filename: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  ghi_chu: string | null;
  created_at: string;
}

interface SignedUploadTarget {
  method: 'PUT';
  signedUrl: string;
  contentType: string;
}

interface CreateMediaResponse {
  data: GongKinhMediaItem;
  upload: SignedUploadTarget;
}

interface GongKinhMediaPanelProps {
  gongKinhId: number | null;
  className?: string;
}

const MAX_MEDIA_ITEMS = 3;
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

export default function GongKinhMediaPanel({ gongKinhId, className = '' }: GongKinhMediaPanelProps) {
  const [items, setItems] = useState<GongKinhMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyCount, setBusyCount] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (Number.isFinite(tA) && Number.isFinite(tB) && tA !== tB) return tA - tB;
      return a.id - b.id;
    }),
    [items]
  );

  const activeCount = useMemo(
    () => items.filter((item) => item.status !== 'failed').length,
    [items]
  );

  const canAddMore = Boolean(gongKinhId) && activeCount < MAX_MEDIA_ITEMS;

  const refreshMedia = useCallback(async () => {
    if (!gongKinhId) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get('/api/gong-kinh/media', {
        params: {
          gong_kinh_id: gongKinhId,
          read_url_ttl_seconds: PREVIEW_READ_TTL_SECONDS,
        },
      });
      setItems((res.data?.data || []) as GongKinhMediaItem[]);
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : (error instanceof Error ? error.message : String(error));
      toast.error(`Lỗi tải ảnh gọng: ${message}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [gongKinhId]);

  useEffect(() => {
    void refreshMedia();
  }, [gongKinhId, refreshTick, refreshMedia]);

  const bumpBusyCount = (delta: number) => {
    setBusyCount((prev) => Math.max(0, prev + delta));
  };

  const uploadSingleFile = async (file: File, sourceDevice: 'camera' | 'file_picker') => {
    if (!gongKinhId) {
      toast.error('Cần chọn gọng trước khi tải ảnh');
      return;
    }

    const uploadFile = await compressImageFile(file);
    let mediaId: number | null = null;

    try {
      const createRes = await axios.post<CreateMediaResponse>('/api/gong-kinh/media', {
        gong_kinh_id: gongKinhId,
        mime_type: uploadFile.type || 'image/jpeg',
        size_bytes: uploadFile.size,
        original_filename: uploadFile.name,
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
        await axios.patch('/api/gong-kinh/media', {
          id: mediaId,
          status: 'uploaded',
          width: imageDimensions?.width,
          height: imageDimensions?.height,
          size_bytes: uploadFile.size,
        });
      }

      toast.success('Đã tải ảnh');
    } catch (error: unknown) {
      if (mediaId) {
        await axios.patch('/api/gong-kinh/media', { id: mediaId, status: 'failed' }).catch(() => {});
      }

      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : (error instanceof Error ? error.message : String(error));

      toast.error(`Không tải được ảnh: ${message}`);
    }
  };

  const handleCapture = () => {
    if (!gongKinhId || busyCount > 0) return;
    captureInputRef.current?.click();
  };

  const handleUpload = () => {
    if (!gongKinhId || busyCount > 0) return;
    uploadInputRef.current?.click();
  };

  const handleFiles = async (fileList: FileList | null, sourceDevice: 'camera' | 'file_picker') => {
    if (!fileList || fileList.length === 0) return;
    if (!gongKinhId) {
      toast.error('Cần chọn gọng trước khi tải ảnh');
      return;
    }

    const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return;
    }

    const remaining = Math.max(0, MAX_MEDIA_ITEMS - activeCount);
    if (remaining <= 0) {
      toast.error(`Mỗi gọng chỉ tối đa ${MAX_MEDIA_ITEMS} ảnh`);
      return;
    }

    const files = imageFiles.slice(0, remaining);
    if (files.length < imageFiles.length) {
      toast(`Chỉ tải ${remaining} ảnh đầu tiên để đảm bảo giới hạn ${MAX_MEDIA_ITEMS}`);
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

    setDeletingId(id);
    try {
      await axios.delete(`/api/gong-kinh/media?id=${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
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

  return (
    <>
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 py-3 px-3 space-y-3 ${className}`} data-no-tab-swipe>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-gray-900 text-sm tracking-tight">Ảnh gọng kính</h3>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
            {activeCount}/{MAX_MEDIA_ITEMS}
          </span>
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

        {!gongKinhId ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-500">
            Chưa chọn gọng.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-8 px-3 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium inline-flex items-center gap-1 hover:bg-blue-100 disabled:opacity-60"
                onClick={handleCapture}
                disabled={!gongKinhId || busyCount > 0 || !canAddMore}
                data-no-tab-swipe
              >
                {busyCount > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                Chụp ảnh
              </button>
              <button
                type="button"
                className="h-8 px-3 border border-gray-300 bg-white text-gray-700 rounded-lg text-xs font-medium inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-60"
                onClick={handleUpload}
                disabled={!gongKinhId || busyCount > 0 || !canAddMore}
                data-no-tab-swipe
              >
                {busyCount > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                Tải ảnh
              </button>
            </div>

            {loading && (
              <div className="text-xs text-gray-500">Đang tải danh sách ảnh...</div>
            )}

            {sortedItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-500">
                Chưa có ảnh nào.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sortedItems.map((media, index) => (
                  <div key={media.id} className="border border-gray-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="text-xs font-semibold text-gray-700">Ảnh {index + 1}</label>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        media.status === 'uploaded'
                          ? 'bg-green-100 text-green-700'
                          : media.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {media.status === 'uploaded' ? 'Đã tải' : media.status === 'pending' ? 'Đang tải...' : 'Lỗi'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-100 flex-shrink-0">
                        {media.read_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={media.read_url}
                            alt={`Ảnh gọng ${index + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">
                            Không xem trước
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-gray-600 truncate" title={media.original_filename || `Ảnh ${index + 1}`}>
                          {media.original_filename || `Ảnh ${index + 1}`}
                        </p>
                        <p className="text-[10px] text-gray-500">{formatDateTime(media.created_at)}</p>
                        {media.width && media.height && (
                          <p className="text-[10px] text-gray-500">{media.width}×{media.height}px</p>
                        )}
                      </div>

                      <button
                        type="button"
                        className="h-8 w-8 rounded-lg bg-red-50 text-red-600 inline-flex items-center justify-center hover:bg-red-100 disabled:opacity-60 flex-shrink-0"
                        onClick={() => void handleDeleteMedia(media.id)}
                        disabled={deletingId === media.id}
                        title="Xóa"
                        data-no-tab-swipe
                      >
                        {deletingId === media.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
