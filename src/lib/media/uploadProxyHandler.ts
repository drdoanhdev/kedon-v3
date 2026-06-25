import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin as supabase } from '../tenantApi';
import { getMediaStorageProviderForRow } from './storage';

interface PendingMediaRow {
  id: number;
  tenant_id: string;
  branch_id: string | null;
  storage_driver: string;
  bucket: string;
  object_path: string;
  mime_type: string | null;
  status: string;
}

function parsePositiveInt(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function readRequestBody(req: NextApiRequest, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`File vuot qua gioi han ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

export async function handleMediaUploadPut(
  req: NextApiRequest,
  res: NextApiResponse,
  options: {
    tenantId: string;
    branchId: string | null;
    table: 'don_kinh_media' | 'gong_kinh_media' | 'don_thuoc_media';
    maxFileBytes: number;
  }
) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT']);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const mediaId = parsePositiveInt(req.query.id);
  if (!mediaId) {
    return res.status(400).json({ message: 'id media khong hop le' });
  }

  let fetchQuery = supabase
    .from(options.table)
    .select('*')
    .eq('tenant_id', options.tenantId)
    .eq('id', mediaId);

  if (options.branchId) {
    fetchQuery = fetchQuery.eq('branch_id', options.branchId);
  }

  const { data, error } = await fetchQuery.maybeSingle();
  if (error) {
    return res.status(400).json({ message: 'Loi tim media', details: error.message });
  }
  if (!data) {
    return res.status(404).json({ message: 'Khong tim thay media' });
  }

  const row = data as PendingMediaRow;
  if (row.status !== 'pending') {
    return res.status(409).json({ message: 'Media khong o trang thai pending' });
  }

  const contentTypeHeader = req.headers['content-type'];
  const contentType = typeof contentTypeHeader === 'string'
    ? contentTypeHeader.split(';')[0].trim()
    : (row.mime_type || 'application/octet-stream');

  const body = await readRequestBody(req, options.maxFileBytes);
  if (body.length === 0) {
    return res.status(400).json({ message: 'Body rong' });
  }

  const provider = getMediaStorageProviderForRow(row.storage_driver, row.bucket);
  await provider.putObject(row.object_path, body, contentType);

  return res.status(200).json({ ok: true, size_bytes: body.length });
}
