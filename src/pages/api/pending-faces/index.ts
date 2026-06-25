import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';
import { resolvePendingFaceSnapshotUrl } from '../../../lib/faceSnapshotUpload';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    try {
      const { status, sort } = req.query;

      let query = supabaseAdmin
        .from('PendingFaces')
        .select(`
          *,
          benh_nhan:assigned_to (
            id,
            ten
          )
        `)
        .eq('tenant_id', ctx.tenantId);

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      if (sort === 'oldest') {
        query = query.order('detected_at', { ascending: true });
      } else if (sort === 'quality') {
        query = query.order('quality_score', { ascending: false });
      } else {
        query = query.order('detected_at', { ascending: false });
      }

      const { data, error } = await query;

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      const rows = (data || []).map((row: Record<string, unknown>) => {
        const snapshotUrl = row.snapshot_url as string | null | undefined;
        const faceId = row.id as number;
        const snapshot_display_url = resolvePendingFaceSnapshotUrl(faceId, snapshotUrl);
        return { ...row, snapshot_display_url };
      });

      return res.status(200).json({ success: true, data: rows });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ success: false, error: message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
