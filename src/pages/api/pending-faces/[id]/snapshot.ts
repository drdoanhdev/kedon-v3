import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../../lib/tenantApi';
import { readSnapshotJpeg } from '../../../../lib/faceSnapshotUpload';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const id = parseInt(String(req.query.id), 10);
  if (!id) {
    return res.status(400).json({ success: false, error: 'Invalid id' });
  }

  const { data: row, error } = await supabaseAdmin
    .from('PendingFaces')
    .select('id, snapshot_url, tenant_id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (error || !row) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }

  const jpeg = await readSnapshotJpeg(row.snapshot_url as string | null);
  if (!jpeg || jpeg.length === 0) {
    return res.status(404).json({ success: false, error: 'No snapshot' });
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.status(200).send(jpeg);
}
