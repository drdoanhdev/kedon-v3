import type { NextApiRequest, NextApiResponse } from 'next';
import { requirePermission } from '../../../lib/permissions';
import {
  requireTenant,
  resolveBranchAccess,
  setNoCacheHeaders,
  supabaseAdmin as supabase,
} from '../../../lib/tenantApi';
import { buildDonThuocMediaObjectPath } from '../../../lib/media/objectPath';
import { getMediaStorageProvider, getMediaStorageProviderForRow } from '../../../lib/media/storage';
import {
  DEFAULT_MEDIA_MAX_FILE_BYTES,
  DEFAULT_MEDIA_READ_URL_TTL_SECONDS,
  isAllowedImageMimeType,
  MAX_MEDIA_ITEMS_PER_PRESCRIPTION,
  MEDIA_UPLOAD_STATUSES,
  type MediaUploadStatus,
} from '../../../lib/media/types';

const MIN_READ_URL_TTL_SECONDS = 60;
const MAX_READ_URL_TTL_SECONDS = 60 * 60;
const DEFAULT_KIND = 'don_thuoc';
const ALLOWED_KINDS = [DEFAULT_KIND] as const;

type MediaKind = typeof DEFAULT_KIND;

interface DonThuocLookupRow {
  id: number;
  benhnhanid: number;
  branch_id: string | null;
}

interface DonThuocMediaRow {
  id: number;
  tenant_id: string;
  branch_id: string | null;
  don_thuoc_id: number;
  benhnhan_id: number;
  loai_anh: MediaKind;
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
  source_device: string | null;
  ghi_chu: string | null;
  sort_order: number | null;
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
  const fromEnv = Number.parseInt(process.env.MEDIA_READ_URL_TTL_SECONDS || '', 10);
  const defaultTtl = Number.isFinite(fromEnv) && fromEnv > 0
    ? Math.max(MIN_READ_URL_TTL_SECONDS, Math.min(MAX_READ_URL_TTL_SECONDS, fromEnv))
    : DEFAULT_MEDIA_READ_URL_TTL_SECONDS;
  const parsed = parsePositiveInt(value);
  if (!parsed) return defaultTtl;
  return Math.max(MIN_READ_URL_TTL_SECONDS, Math.min(MAX_READ_URL_TTL_SECONDS, parsed));
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

function normalizeKind(value: unknown): MediaKind | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (ALLOWED_KINDS as readonly string[]).includes(normalized) ? DEFAULT_KIND : null;
}

function parseUploadStatus(value: unknown): MediaUploadStatus | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (MEDIA_UPLOAD_STATUSES as readonly string[]).includes(normalized)
    ? (normalized as MediaUploadStatus)
    : null;
}

function resolveMaxFileBytes(): number {
  const fromEnv = Number.parseInt(process.env.MEDIA_IMAGE_MAX_FILE_BYTES || '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_MEDIA_MAX_FILE_BYTES;
}

function normalizeSortOrder(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  return Number.MAX_SAFE_INTEGER;
}

function sortRowsByDisplayOrder(rows: DonThuocMediaRow[]): DonThuocMediaRow[] {
  return [...rows].sort((a, b) => {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;

  const { tenantId, userId } = ctx;
  const { branchId } = branchAccess;

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res, tenantId, branchId);
    }

    if (req.method === 'POST') {
      if (!(await requirePermission(ctx, res, 'write_prescription'))) return;
      return await handlePost(req, res, tenantId, userId, branchId);
    }

    if (req.method === 'PATCH') {
      if (!(await requirePermission(ctx, res, 'write_prescription'))) return;
      return await handlePatch(req, res, tenantId, branchId);
    }

    if (req.method === 'DELETE') {
      if (!(await requirePermission(ctx, res, 'write_prescription'))) return;
      return await handleDelete(req, res, tenantId, branchId);
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).json({ message: `Method ${req.method} is not allowed` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('don-thuoc/media API error:', error);
    return res.status(500).json({ message: 'Loi he thong media DonThuoc', details: message });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, tenantId: string, branchId: string | null) {
  const donThuocId = parsePositiveInt(req.query.don_thuoc_id);
  const benhnhanId = parsePositiveInt(req.query.benhnhan_id);
  if (!donThuocId && !benhnhanId) {
    return res.status(400).json({ message: 'Thieu don_thuoc_id hoac benhnhan_id' });
  }

  const kindRaw = firstString(req.query.loai_anh);
  const kind = kindRaw ? normalizeKind(kindRaw) : null;
  if (kindRaw && !kind) {
    return res.status(400).json({ message: 'loai_anh khong hop le' });
  }

  const readUrlTtlSeconds = clampReadUrlTtl(req.query.read_url_ttl_seconds);

  let query = supabase
    .from('don_thuoc_media')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }
  if (donThuocId) query = query.eq('don_thuoc_id', donThuocId);
  if (benhnhanId) query = query.eq('benhnhan_id', benhnhanId);
  if (kind) query = query.eq('loai_anh', kind);

  const { data, error } = await query;
  if (error) {
    return res.status(400).json({ message: 'Loi tai danh sach media', details: error.message });
  }

  const rows = sortRowsByDisplayOrder(((data || []) as unknown[]) as DonThuocMediaRow[]);
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
      return { ...row, read_url };
    })
  );

  return res.status(200).json({ data: enriched, read_url_ttl_seconds: readUrlTtlSeconds });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, tenantId: string, userId: string, branchId: string | null) {
  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};
  const donThuocId = parsePositiveInt(body.don_thuoc_id);
  if (!donThuocId) {
    return res.status(400).json({ message: 'don_thuoc_id khong hop le' });
  }

  const loaiAnh = normalizeKind(hasOwn(body, 'loai_anh') ? body.loai_anh : DEFAULT_KIND) || DEFAULT_KIND;
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
    return res.status(400).json({ message: `Anh vuot gioi han kich thuoc ${maxFileBytes} bytes`, max_file_bytes: maxFileBytes });
  }

  let donThuocQuery = supabase
    .from('DonThuoc')
    .select('id, benhnhanid, branch_id')
    .eq('tenant_id', tenantId)
    .eq('id', donThuocId);
  if (branchId) {
    donThuocQuery = donThuocQuery.eq('branch_id', branchId);
  }

  const { data: donThuocRaw, error: donThuocError } = await donThuocQuery.maybeSingle();
  if (donThuocError) {
    return res.status(400).json({ message: 'Loi tra cuu DonThuoc', details: donThuocError.message });
  }
  if (!donThuocRaw) {
    return res.status(404).json({ message: 'Khong tim thay DonThuoc' });
  }

  const donThuoc = donThuocRaw as unknown as DonThuocLookupRow;
  if (!donThuoc.benhnhanid) {
    return res.status(400).json({ message: 'DonThuoc thieu benhnhanid, khong the tao media' });
  }

  let countQuery = supabase
    .from('don_thuoc_media')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('don_thuoc_id', donThuocId)
    .in('status', ['pending', 'uploaded']);
  if (branchId) countQuery = countQuery.eq('branch_id', branchId);

  const { count, error: countError } = await countQuery;
  if (countError) {
    return res.status(400).json({ message: 'Loi kiem tra gioi han media', details: countError.message });
  }
  if ((count || 0) >= MAX_MEDIA_ITEMS_PER_PRESCRIPTION) {
    return res.status(400).json({ message: `Da dat gioi han ${MAX_MEDIA_ITEMS_PER_PRESCRIPTION} anh cho don thuoc này`, max_items_per_prescription: MAX_MEDIA_ITEMS_PER_PRESCRIPTION });
  }

  let lastSortQuery = supabase
    .from('don_thuoc_media')
    .select('sort_order')
    .eq('tenant_id', tenantId)
    .eq('don_thuoc_id', donThuocId)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (branchId) lastSortQuery = lastSortQuery.eq('branch_id', branchId);

  const { data: lastSortRows, error: lastSortError } = await lastSortQuery;
  if (lastSortError) {
    return res.status(400).json({ message: 'Loi tao thu tu anh', details: lastSortError.message });
  }

  const previousSortOrder = Array.isArray(lastSortRows) && lastSortRows.length > 0
    ? (lastSortRows[0] as { sort_order: number | null }).sort_order
    : null;
  const nextSortOrder = typeof previousSortOrder === 'number' && Number.isFinite(previousSortOrder)
    ? Math.max(0, Math.floor(previousSortOrder) + 1)
    : 0;

  const capturedAt = parseDate(body.captured_at);
  const originalFilename = truncateString(body.original_filename, 255);
  const sourceDevice = truncateString(body.source_device, 255);
  const ghiChu = truncateString(body.ghi_chu, 2000);

  const objectPath = buildDonThuocMediaObjectPath({
    tenantId,
    branchId: donThuoc.branch_id,
    benhnhanId: Number(donThuoc.benhnhanid),
    donThuocId,
    kind: loaiAnh,
    mimeType,
    originalFilename,
    capturedAt: capturedAt || undefined,
  });

  const provider = getMediaStorageProvider();
  const uploadTarget = await provider.createSignedUpload(objectPath, mimeType);

  const insertPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    branch_id: donThuoc.branch_id,
    don_thuoc_id: donThuocId,
    benhnhan_id: Number(donThuoc.benhnhanid),
    loai_anh: loaiAnh,
    storage_driver: uploadTarget.driver,
    bucket: uploadTarget.bucket,
    object_path: uploadTarget.path,
    original_filename: originalFilename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    captured_at: capturedAt ? capturedAt.toISOString() : null,
    captured_by: userId,
    source_device: sourceDevice,
    ghi_chu: ghiChu,
    sort_order: nextSortOrder,
    status: 'pending',
  };

  const { data: mediaRow, error: insertError } = await supabase
    .from('don_thuoc_media')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) {
    return res.status(400).json({ message: 'Khong luu duoc metadata media', details: insertError.message });
  }

  return res.status(200).json({ data: mediaRow, upload: uploadTarget, max_items_per_prescription: MAX_MEDIA_ITEMS_PER_PRESCRIPTION });
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse, tenantId: string, branchId: string | null) {
  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};
  const mediaId = parsePositiveInt(body.id);
  if (!mediaId) return res.status(400).json({ message: 'id media khong hop le' });

  const status = hasOwn(body, 'status') ? parseUploadStatus(body.status) : null;
  if (hasOwn(body, 'status') && !status) return res.status(400).json({ message: 'status khong hop le' });

  const width = parsePositiveInt(body.width);
  if (hasOwn(body, 'width') && width === null) return res.status(400).json({ message: 'width khong hop le' });
  const height = parsePositiveInt(body.height);
  if (hasOwn(body, 'height') && height === null) return res.status(400).json({ message: 'height khong hop le' });
  const sizeBytes = parseNonNegativeInt(body.size_bytes);
  if (hasOwn(body, 'size_bytes') && sizeBytes === null) return res.status(400).json({ message: 'size_bytes khong hop le' });
  const ghiChu = hasOwn(body, 'ghi_chu') ? truncateString(body.ghi_chu, 2000) : undefined;
  const sortOrder = hasOwn(body, 'sort_order') ? parseNonNegativeInt(body.sort_order) : null;
  if (hasOwn(body, 'sort_order') && sortOrder === null) return res.status(400).json({ message: 'sort_order khong hop le' });

  const updatePayload: Record<string, unknown> = {};
  if (status) updatePayload.status = status;
  if (width !== null) updatePayload.width = width;
  if (height !== null) updatePayload.height = height;
  if (sizeBytes !== null) updatePayload.size_bytes = sizeBytes;
  if (hasOwn(body, 'ghi_chu')) updatePayload.ghi_chu = ghiChu;
  if (sortOrder !== null) updatePayload.sort_order = sortOrder;
  if (Object.keys(updatePayload).length === 0) return res.status(400).json({ message: 'Khong co du lieu cap nhat hop le' });

  let query = supabase.from('don_thuoc_media').update(updatePayload).eq('tenant_id', tenantId).eq('id', mediaId);
  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query.select('*').maybeSingle();
  if (error) return res.status(400).json({ message: 'Loi cap nhat media', details: error.message });
  if (!data) return res.status(404).json({ message: 'Khong tim thay media can cap nhat' });

  const row = data as unknown as DonThuocMediaRow;
  let read_url: string | null = null;
  if (row.status === 'uploaded') {
    try {
      const provider = getMediaStorageProviderForRow(row.storage_driver, row.bucket);
      read_url = await provider.createSignedReadUrl(row.object_path, DEFAULT_MEDIA_READ_URL_TTL_SECONDS);
    } catch (error) {
      console.warn(`Cannot generate read URL for media#${row.id}:`, error);
    }
  }

  return res.status(200).json({ data: { ...row, read_url } });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, tenantId: string, branchId: string | null) {
  const id = parsePositiveInt(req.query.id);
  if (!id) return res.status(400).json({ message: 'Thieu ID media' });

  let query = supabase.from('don_thuoc_media').select('*').eq('tenant_id', tenantId).eq('id', id);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.maybeSingle();
  if (error) return res.status(400).json({ message: 'Loi tra cuu media', details: error.message });
  if (!data) return res.status(404).json({ message: 'Khong tim thay media' });

  const row = data as unknown as DonThuocMediaRow;
  try {
    const provider = getMediaStorageProviderForRow(row.storage_driver, row.bucket);
    await provider.deleteObject(row.object_path);
  } catch (deleteError) {
    console.warn(`Failed to delete object for media#${row.id}:`, deleteError);
  }

  let deleteQuery = supabase.from('don_thuoc_media').delete().eq('tenant_id', tenantId).eq('id', id);
  if (branchId) deleteQuery = deleteQuery.eq('branch_id', branchId);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) return res.status(400).json({ message: 'Loi xoa media', details: deleteError.message });

  return res.status(200).json({ message: 'Da xoa media' });
}
