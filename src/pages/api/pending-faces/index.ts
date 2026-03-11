/**
 * API endpoint cho Pending Faces - Proxy đến Python API hoặc trực tiếp query DB
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const supabase = supabaseAdmin;

  if (req.method === 'GET') {
    try {
      const { status, sort } = req.query;

      let query = supabase
        .from('PendingFaces')
        .select(`
          *,
          benh_nhan:assigned_to (
            id,
            ten
          )
        `);

      // Filter by status
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      // Sort
      if (sort === 'oldest') {
        query = query.order('detected_at', { ascending: true });
      } else if (sort === 'quality') {
        query = query.order('quality_score', { ascending: false });
      } else {
        // newest (default)
        query = query.order('detected_at', { ascending: false });
      }

      const { data, error } = await query;

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ success: false, error: message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}