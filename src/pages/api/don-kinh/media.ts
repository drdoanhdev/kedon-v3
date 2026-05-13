import type { NextApiRequest, NextApiResponse } from 'next';
import { requirePermission } from '../../../lib/permissions';
import {
  requireTenant,
  resolveBranchAccess,
  setNoCacheHeaders,
  supabaseAdmin as supabase,
} from '../../../lib/tenantApi';
import { buildDonKinhMediaObjectPath } from '../../../lib/media/objectPath';
import { getMediaStorageProvider, getMediaStorageProviderForRow } from '../../../lib/media/storage';
import {
  DEFAULT_MEDIA_MAX_FILE_BYTES,
  DEFAULT_MEDIA_READ_URL_TTL_SECONDS,
  isAllowedImageMimeType,
  MAX_MEDIA_ITEMS_PER_PRESCRIPTION,
  MEDIA_UPLOAD_STATUSES,
  normalizeMediaImageKind,
  type MediaImageKind,
  type MediaUploadStatus,
} from '../../../lib/media/types';

const MIN_READ_URL_TTL_SECONDS = 60;
const MAX_READ_URL_TTL_SECONDS = 60 * 60;

interface DonKinhLookupRow {
  id: number;
  benhnhanid: number;
  branch_id: string | null;
}

interface DonKinhMediaRow {
  id: number;
  tenant_id: string;
  branch_id: string | null;
  don_kinh_id: number;
  benhnhan_id: number;
  loai_anh: MediaImageKind;
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

interface MediaSortOrderUpdate {
  id: number;
  sort_order: number;
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

function normalizeSortOrder(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortRowsByDisplayOrder(rows: DonKinhMediaRow[]): DonKinhMediaRow[] {
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
    console.error('don-kinh/media API error:', error);
    return res.status(500).json({ message: 'Loi he thong media DonKinh', details: message });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  branchId: string | null
) {
  const donKinhId = parsePositiveInt(req.query.don_kinh_id);
  const benhnhanId = parsePositiveInt(req.query.benhnhan_id);

  if (!donKinhId && !benhnhanId) {
    return res.status(400).json({ message: 'Thieu don_kinh_id hoac benhnhan_id' });
  }

  const kindRaw = firstString(req.query.loai_anh);
  const kind = kindRaw ? normalizeMediaImageKind(kindRaw) : null;
  if (kindRaw && !kind) {
    return res.status(400).json({ message: 'loai_anh khong hop le' });
  }

  const readUrlTtlSeconds = clampReadUrlTtl(req.query.read_url_ttl_seconds);

  let query = supabase
    .from('don_kinh_media')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  if (donKinhId) {
    query = query.eq('don_kinh_id', donKinhId);
  }

  if (benhnhanId) {
    query = query.eq('benhnhan_id', benhnhanId);
  }

  if (kind) {
    query = query.eq('loai_anh', kind);
  }

  const { data, error } = await query;
  if (error) {
    return res.status(400).json({ message: 'Loi tai danh sach media', details: error.message });
  }

  const rows = sortRowsByDisplayOrder(((data || []) as unknown[]) as DonKinhMediaRow[]);

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
  userId: string,
  branchId: string | null
) {
  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};

  const donKinhId = parsePositiveInt(body.don_kinh_id);
  if (!donKinhId) {
    return res.status(400).json({ message: 'don_kinh_id khong hop le' });
  }

  const loaiAnh = normalizeMediaImageKind(hasOwn(body, 'loai_anh') ? body.loai_anh : 'don_kinh');
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

  let donKinhQuery = supabase
    .from('DonKinh')
    .select('id, benhnhanid, branch_id')
    .eq('tenant_id', tenantId)
    .eq('id', donKinhId);

  if (branchId) {
    donKinhQuery = donKinhQuery.eq('branch_id', branchId);
  }

  const { data: donKinhRaw, error: donKinhError } = await donKinhQuery.maybeSingle();
  if (donKinhError) {
    return res.status(400).json({ message: 'Loi tra cuu DonKinh', details: donKinhError.message });
  }
  if (!donKinhRaw) {
    return res.status(404).json({ message: 'Khong tim thay DonKinh' });
  }

  const donKinh = donKinhRaw as unknown as DonKinhLookupRow;
  if (!donKinh.benhnhanid) {
    return res.status(400).json({ message: 'DonKinh thieu benhnhanid, khong the tao media' });
  }

  let countQuery = supabase
    .from('don_kinh_media')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('don_kinh_id', donKinhId)
    .in('status', ['pending', 'uploaded']);

  if (branchId) {
    countQuery = countQuery.eq('branch_id', branchId);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    return res.status(400).json({ message: 'Loi kiem tra gioi han media', details: countError.message });
  }

  if ((count || 0) >= MAX_MEDIA_ITEMS_PER_PRESCRIPTION) {
    return res.status(400).json({
      message: `Da dat gioi han ${MAX_MEDIA_ITEMS_PER_PRESCRIPTION} anh cho don kinh`,
      max_items_per_prescription: MAX_MEDIA_ITEMS_PER_PRESCRIPTION,
      max_items_for_kind: MAX_MEDIA_ITEMS_PER_PRESCRIPTION,
    });
  }

  let lastSortQuery = supabase
    .from('don_kinh_media')
    .select('sort_order')
    .eq('tenant_id', tenantId)
    .eq('don_kinh_id', donKinhId)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (branchId) {
    lastSortQuery = lastSortQuery.eq('branch_id', branchId);
  }

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

  const objectPath = buildDonKinhMediaObjectPath({
    tenantId,
    branchId: donKinh.branch_id,
    benhnhanId: Number(donKinh.benhnhanid),
    donKinhId,
    kind: loaiAnh,
    mimeType,
    originalFilename,
    capturedAt: capturedAt || undefined,
  });

  const provider = getMediaStorageProvider();
  const uploadTarget = await provider.createSignedUpload(objectPath, mimeType);

  const insertPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    branch_id: donKinh.branch_id,
    don_kinh_id: donKinhId,
    benhnhan_id: Number(donKinh.benhnhanid),
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
    .from('don_kinh_media')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) {
    return res.status(400).json({ message: 'Khong luu duoc metadata media', details: insertError.message });
  }

  return res.status(200).json({
    data: mediaRow,
    upload: uploadTarget,
    max_items_per_prescription: MAX_MEDIA_ITEMS_PER_PRESCRIPTION,
    max_items_for_kind: MAX_MEDIA_ITEMS_PER_PRESCRIPTION,
  });
}

async function handlePatchSortOrders(
  res: NextApiResponse,
  tenantId: string,
  branchId: string | null,
  updates: MediaSortOrderUpdate[]
) {
  for (const updateItem of updates) {
    let updateQuery = supabase
      .from('don_kinh_media')
      .update({ sort_order: updateItem.sort_order })
      .eq('tenant_id', tenantId)
      .eq('id', updateItem.id);

    if (branchId) {
      updateQuery = updateQuery.eq('branch_id', branchId);
    }

    const { error } = await updateQuery;
    if (error) {
      return res.status(400).json({ message: 'Loi cap nhat thu tu media', details: error.message });
    }
  }

  let fetchQuery = supabase
    .from('don_kinh_media')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', updates.map((u) => u.id));

  if (branchId) {
    fetchQuery = fetchQuery.eq('branch_id', branchId);
  }

  const { data, error } = await fetchQuery;
  if (error) {
    return res.status(400).json({ message: 'Loi tai media sau cap nhat thu tu', details: error.message });
  }

  const rows = sortRowsByDisplayOrder(((data || []) as unknown[]) as DonKinhMediaRow[]);
  return res.status(200).json({
    message: 'Da cap nhat thu tu media',
    data: rows,
  });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  branchId: string | null
) {
  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};

  if (hasOwn(body, 'orders')) {
    const rawOrders = body.orders;
    if (!Array.isArray(rawOrders) || rawOrders.length === 0) {
      return res.status(400).json({ message: 'orders khong hop le' });
    }

    const updates: MediaSortOrderUpdate[] = [];
    const seenIds = new Set<number>();
    for (const raw of rawOrders) {
      if (!raw || typeof raw !== 'object') {
        return res.status(400).json({ message: 'orders co phan tu khong hop le' });
      }

      const row = raw as Record<string, unknown>;
      const id = parsePositiveInt(row.id);
      const sortOrder = parseNonNegativeInt(row.sort_order);

      if (!id || sortOrder === null) {
        return res.status(400).json({ message: 'orders can id va sort_order hop le' });
      }

      if (seenIds.has(id)) continue;
      seenIds.add(id);
      updates.push({ id, sort_order: sortOrder });
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'orders rong sau khi chuan hoa' });
    }

    return await handlePatchSortOrders(res, tenantId, branchId, updates);
  }

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

  const sortOrder = parseNonNegativeInt(body.sort_order);
  if (hasOwn(body, 'sort_order') && sortOrder === null) {
    return res.status(400).json({ message: 'sort_order khong hop le' });
  }

  const ghiChu = hasOwn(body, 'ghi_chu')
    ? truncateString(body.ghi_chu, 2000)
    : undefined;

  const updatePayload: Record<string, unknown> = {};

  if (status) updatePayload.status = status;

  if (width !== null) updatePayload.width = width;
  if (height !== null) updatePayload.height = height;
  if (sizeBytes !== null) updatePayload.size_bytes = sizeBytes;
  if (sortOrder !== null) updatePayload.sort_order = sortOrder;
  if (hasOwn(body, 'ghi_chu')) updatePayload.ghi_chu = ghiChu;

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ message: 'Khong co du lieu cap nhat hop le' });
  }

  let updateQuery = supabase
    .from('don_kinh_media')
    .update(updatePayload)
    .eq('tenant_id', tenantId)
    .eq('id', mediaId);

  if (branchId) {
    updateQuery = updateQuery.eq('branch_id', branchId);
  }

  const { data, error } = await updateQuery
    .select('*')
    .maybeSingle();

  if (error) {
    return res.status(400).json({ message: 'Loi cap nhat media', details: error.message });
  }

  if (!data) {
    return res.status(404).json({ message: 'Khong tim thay media can cap nhat' });
  }

  const row = data as unknown as DonKinhMediaRow;
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
  tenantId: string,
  branchId: string | null
) {
  const mediaId = parsePositiveInt(req.query.id);
  if (!mediaId) {
    return res.status(400).json({ message: 'id media khong hop le' });
  }

  let fetchQuery = supabase
    .from('don_kinh_media')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', mediaId);

  if (branchId) {
    fetchQuery = fetchQuery.eq('branch_id', branchId);
  }

  const { data: mediaRowRaw, error: fetchError } = await fetchQuery.maybeSingle();
  if (fetchError) {
    return res.status(400).json({ message: 'Loi tim media de xoa', details: fetchError.message });
  }
  if (!mediaRowRaw) {
    return res.status(404).json({ message: 'Khong tim thay media' });
  }

  const mediaRow = mediaRowRaw as unknown as DonKinhMediaRow;

  let objectDeleteWarning: string | null = null;
  try {
    const provider = getMediaStorageProviderForRow(mediaRow.storage_driver, mediaRow.bucket);
    await provider.deleteObject(mediaRow.object_path);
  } catch (error) {
    objectDeleteWarning = error instanceof Error ? error.message : String(error);
  }

  let deleteQuery = supabase
    .from('don_kinh_media')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', mediaId);

  if (branchId) {
    deleteQuery = deleteQuery.eq('branch_id', branchId);
  }

  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    return res.status(400).json({ message: 'Loi xoa metadata media', details: deleteError.message });
  }

  return res.status(200).json({
    message: 'Da xoa media',
    warning: objectDeleteWarning,
  });
}
