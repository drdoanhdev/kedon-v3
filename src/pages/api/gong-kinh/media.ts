'use client';

import type { NextApiRequest, NextApiResponse } from 'next';
import { requirePermission } from '../../../lib/permissions';
import {
  requireTenant,
  setNoCacheHeaders,
  supabaseAdmin as supabase,
} from '../../../lib/tenantApi';
import { buildDonKinhMediaObjectPath } from '../../../lib/media/objectPath';
import { getMediaStorageProvider, getMediaStorageProviderForRow } from '../../../lib/media/storage';
import {
  DEFAULT_MEDIA_MAX_FILE_BYTES,
  DEFAULT_MEDIA_READ_URL_TTL_SECONDS,
  isAllowedImageMimeType,
  MEDIA_UPLOAD_STATUSES,
  type MediaUploadStatus,
} from '../../../lib/media/types';

const MIN_READ_URL_TTL_SECONDS = 60;
const MAX_READ_URL_TTL_SECONDS = 60 * 60;
const MAX_MEDIA_PER_FRAME = 3;
const ALLOWED_IMAGE_KINDS = ['mat_truoc', 'mat_trai', 'mat_phai'] as const;

type FrameImageKind = typeof ALLOWED_IMAGE_KINDS[number];

interface GongKinhLookupRow {
  id: number;
  ten_gong: string | null;
  tenant_id: string;
}

interface GongKinhMediaRow {
  id: number;
  tenant_id: string;
  gong_kinh_id: number;
  loai_anh: FrameImageKind;
  storage_driver: string;
  bucket: string;
  object_path: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  captured_at: string | null;
  captured_by: string | null;
  ghi_chu: string | null;
  status: MediaUploadStatus;
  created_at: string;
  updated_at: string;
}

function firstString(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : null;
  }
  return typeof value === 'string' ? value : null;
}

function parsePositiveInt(value: unknown): number | null {
  const raw = firstString(value) ?? (typeof value === 'number' ? String(value) : null);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseNonNegativeInt(value: unknown): number | null {
  const raw = firstString(value) ?? (typeof value === 'number' ? String(value) : null);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function clampReadUrlTtl(value: unknown): number {
  const defaultTtl = resolveDefaultReadUrlTtlSeconds();
  const parsed = parsePositiveInt(value);
  if (!parsed) return defaultTtl;
  return Math.max(MIN_READ_URL_TTL_SECONDS, Math.min(MAX_READ_URL_TTL_SECONDS, parsed));
}

function resolveDefaultReadUrlTtlSeconds(): number {
  const fromEnv = Number.parseInt(process.env.MEDIA_READ_URL_TTL_SECONDS || '', 10);
  if (!Number.isFinite(fromEnv) || fromEnv <= 0) return DEFAULT_MEDIA_READ_URL_TTL_SECONDS;
  return Math.max(MIN_READ_URL_TTL_SECONDS, Math.min(MAX_READ_URL_TTL_SECONDS, fromEnv));
}

function normalizeMimeType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase().split(';')[0].trim();
  return normalized || null;
}

function truncateString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function parseUploadStatus(value: unknown): MediaUploadStatus | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if ((MEDIA_UPLOAD_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as MediaUploadStatus;
  }
  return null;
}

function resolveMaxFileBytes(): number {
  const fromEnv = Number.parseInt(process.env.MEDIA_IMAGE_MAX_FILE_BYTES || '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_MEDIA_MAX_FILE_BYTES;
}

function normalizeFrameImageKind(value: unknown): FrameImageKind | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if ((ALLOWED_IMAGE_KINDS as readonly string[]).includes(normalized)) {
    return normalized as FrameImageKind;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const { tenantId, userId } = ctx;

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res, tenantId);
    }

    if (req.method === 'POST') {
      if (!(await requirePermission(ctx, res, 'write_inventory'))) return;
      return await handlePost(req, res, tenantId, userId);
    }

    if (req.method === 'PATCH') {
      if (!(await requirePermission(ctx, res, 'write_inventory'))) return;
      return await handlePatch(req, res, tenantId);
    }

    if (req.method === 'DELETE') {
      if (!(await requirePermission(ctx, res, 'write_inventory'))) return;
      return await handleDelete(req, res, tenantId);
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).json({ message: `Method ${req.method} is not allowed` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('gong-kinh/media API error:', error);
    return res.status(500).json({ message: 'Loi he thong media GongKinh', details: message });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string
) {
  const gongKinhId = parsePositiveInt(req.query.gong_kinh_id);

  if (!gongKinhId) {
    return res.status(400).json({ message: 'Thieu gong_kinh_id' });
  }

  const kindRaw = firstString(req.query.loai_anh);
  const kind = kindRaw ? normalizeFrameImageKind(kindRaw) : null;
  if (kindRaw && !kind) {
    return res.status(400).json({ message: 'loai_anh khong hop le' });
  }

  const readUrlTtlSeconds = clampReadUrlTtl(req.query.read_url_ttl_seconds);

  let query = supabase
    .from('gong_kinh_media')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('gong_kinh_id', gongKinhId)
    .order('created_at', { ascending: true });

  if (kind) {
    query = query.eq('loai_anh', kind);
  }

  const { data, error } = await query;
  if (error) {
    return res.status(400).json({ message: 'Loi tai danh sach media', details: error.message });
  }

  const rows = ((data || []) as unknown[]) as GongKinhMediaRow[];

  const enriched = await Promise.all(
    rows.map(async (row) => {
      let read_url: string | null = null;
      if (row.status === 'uploaded') {
        try {
          const provider = getMediaStorageProviderForRow(row.storage_driver, row.bucket);
          read_url = await provider.createSignedReadUrl(row.object_path, readUrlTtlSeconds);
        } catch (error) {
          console.warn(`Cannot sign read URL for media#${row.id}:`, error);
        }
      }
      return {
        ...row,
        read_url,
      };
    })
  );

  return res.status(200).json({
    data: enriched,
    read_url_ttl_seconds: readUrlTtlSeconds,
  });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};

  const gongKinhId = parsePositiveInt(body.gong_kinh_id);
  if (!gongKinhId) {
    return res.status(400).json({ message: 'gong_kinh_id khong hop le' });
  }

  const loaiAnh = normalizeFrameImageKind(hasOwn(body, 'loai_anh') ? body.loai_anh : 'mat_truoc');
  if (!loaiAnh) {
    return res.status(400).json({ message: 'loai_anh khong hop le' });
  }

  const mimeType = normalizeMimeType(body.mime_type);
  if (!mimeType || !isAllowedImageMimeType(mimeType)) {
    return res.status(400).json({ message: 'mime_type khong duoc ho tro' });
  }

  const sizeBytes = parseNonNegativeInt(body.size_bytes);
  if (hasOwn(body, 'size_bytes') && sizeBytes === null) {
    return res.status(400).json({ message: 'size_bytes khong hop le' });
  }

  const maxFileBytes = resolveMaxFileBytes();
  if (sizeBytes !== null && sizeBytes > maxFileBytes) {
    return res.status(400).json({
      message: `Anh vuot gioi han kich thuoc ${maxFileBytes} bytes`,
      max_file_bytes: maxFileBytes,
    });
  }

  // Kiểm tra GongKinh tồn tại
  const { data: gongKinhRaw, error: gongKinhError } = await supabase
    .from('GongKinh')
    .select('id, ten_gong, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('id', gongKinhId)
    .maybeSingle();

  if (gongKinhError) {
    return res.status(400).json({ message: 'Loi tra cuu GongKinh', details: gongKinhError.message });
  }
  if (!gongKinhRaw) {
    return res.status(404).json({ message: 'Khong tim thay GongKinh' });
  }

  const gongKinh = gongKinhRaw as unknown as GongKinhLookupRow;

  // Check xem loại ảnh này đã có chưa (chỉ cho phép 1 loại ảnh mỗi loại)
  const { data: existingMedia, error: existingError } = await supabase
    .from('gong_kinh_media')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('gong_kinh_id', gongKinhId)
    .eq('loai_anh', loaiAnh)
    .in('status', ['pending', 'uploaded']);

  if (existingError) {
    return res.status(400).json({ message: 'Loi kiem tra media ton tai', details: existingError.message });
  }

  if (existingMedia && existingMedia.length > 0) {
    return res.status(409).json({
      message: `Đã có ảnh ${loaiAnh} cho gọng này. Xóa cũ trước khi thêm cái mới.`,
      existing_media_id: (existingMedia[0] as { id: number }).id,
    });
  }

  const capturedAt = parseDate(body.captured_at);
  const originalFilename = truncateString(body.original_filename, 255);
  const ghiChu = truncateString(body.ghi_chu, 2000);

  // Dùng object path tương tự don_kinh nhưng với gong_kinh_id
  const objectPath = buildDonKinhMediaObjectPath({
    tenantId,
    branchId: null,
    benhnhanId: gongKinhId, // Sử dụng gong_kinh_id thay benhnhanId
    donKinhId: 0, // Không dùng
    kind: loaiAnh as any,
    mimeType,
    originalFilename,
    capturedAt: capturedAt || undefined,
  }).replace('/don-kinh/', '/gong-kinh/'); // Đổi path prefix

  const provider = getMediaStorageProvider();
  const uploadTarget = await provider.createSignedUpload(objectPath, mimeType);

  const insertPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    gong_kinh_id: gongKinhId,
    loai_anh: loaiAnh,
    storage_driver: uploadTarget.driver,
    bucket: 'gong-kinh-media',
    object_path: uploadTarget.path,
    original_filename: originalFilename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    captured_at: capturedAt ? capturedAt.toISOString() : null,
    captured_by: userId,
    ghi_chu: ghiChu,
    status: 'pending',
  };

  const { data: mediaRow, error: insertError } = await supabase
    .from('gong_kinh_media')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) {
    return res.status(400).json({ message: 'Khong luu duoc metadata media', details: insertError.message });
  }

  return res.status(200).json({
    data: mediaRow,
    upload: uploadTarget,
    max_items_per_frame: MAX_MEDIA_PER_FRAME,
  });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string
) {
  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};

  const mediaId = parsePositiveInt(body.id);
  if (!mediaId) {
    return res.status(400).json({ message: 'id media khong hop le' });
  }

  const status = hasOwn(body, 'status') ? parseUploadStatus(body.status) : null;
  if (hasOwn(body, 'status') && !status) {
    return res.status(400).json({ message: 'status khong hop le' });
  }

  const width = parsePositiveInt(body.width);
  if (hasOwn(body, 'width') && width === null) {
    return res.status(400).json({ message: 'width khong hop le' });
  }

  const height = parsePositiveInt(body.height);
  if (hasOwn(body, 'height') && height === null) {
    return res.status(400).json({ message: 'height khong hop le' });
  }

  const sizeBytes = parseNonNegativeInt(body.size_bytes);
  if (hasOwn(body, 'size_bytes') && sizeBytes === null) {
    return res.status(400).json({ message: 'size_bytes khong hop le' });
  }

  const ghiChu = hasOwn(body, 'ghi_chu')
    ? truncateString(body.ghi_chu, 2000)
    : undefined;

  const updatePayload: Record<string, unknown> = {};

  if (status) updatePayload.status = status;
  if (width !== null) updatePayload.width = width;
  if (height !== null) updatePayload.height = height;
  if (sizeBytes !== null) updatePayload.size_bytes = sizeBytes;
  if (hasOwn(body, 'ghi_chu')) updatePayload.ghi_chu = ghiChu;

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ message: 'Khong co du lieu cap nhat hop le' });
  }

  const { data, error } = await supabase
    .from('gong_kinh_media')
    .update(updatePayload)
    .eq('tenant_id', tenantId)
    .eq('id', mediaId)
    .select('*')
    .maybeSingle();

  if (error) {
    return res.status(400).json({ message: 'Loi cap nhat media', details: error.message });
  }

  if (!data) {
    return res.status(404).json({ message: 'Khong tim thay media can cap nhat' });
  }

  const row = data as unknown as GongKinhMediaRow;
  let read_url: string | null = null;
  if (row.status === 'uploaded') {
    const provider = getMediaStorageProviderForRow(row.storage_driver, row.bucket);
    try {
      read_url = await provider.createSignedReadUrl(row.object_path, DEFAULT_MEDIA_READ_URL_TTL_SECONDS);
    } catch (error) {
      console.warn(`Cannot generate read URL for media#${row.id}:`, error);
    }
  }

  return res.status(200).json({
    data: {
      ...row,
      read_url,
    },
  });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string
) {
  const mediaId = parsePositiveInt(req.query.id);
  if (!mediaId) {
    return res.status(400).json({ message: 'id media khong hop le' });
  }

  const { data: mediaRowRaw, error: fetchError } = await supabase
    .from('gong_kinh_media')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', mediaId)
    .maybeSingle();

  if (fetchError) {
    return res.status(400).json({ message: 'Loi tim media de xoa', details: fetchError.message });
  }
  if (!mediaRowRaw) {
    return res.status(404).json({ message: 'Khong tim thay media' });
  }

  const mediaRow = mediaRowRaw as unknown as GongKinhMediaRow;

  let objectDeleteWarning: string | null = null;
  try {
    const provider = getMediaStorageProviderForRow(mediaRow.storage_driver, mediaRow.bucket);
    await provider.deleteObject(mediaRow.object_path);
  } catch (error) {
    objectDeleteWarning = error instanceof Error ? error.message : String(error);
  }

  const { error: deleteError } = await supabase
    .from('gong_kinh_media')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', mediaId);

  if (deleteError) {
    return res.status(400).json({ message: 'Loi xoa metadata media', details: deleteError.message });
  }

  return res.status(200).json({
    message: 'Da xoa media',
    warning: objectDeleteWarning,
  });
}
