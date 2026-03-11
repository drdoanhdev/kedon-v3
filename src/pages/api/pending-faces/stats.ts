/**
 * API endpoint cho thống kê Pending Faces
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const supabase = supabaseAdmin;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Count pending
    const { count: pending } = await supabase
      .from('PendingFaces')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Count assigned
    const { count: assigned } = await supabase
      .from('PendingFaces')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'assigned');

    // Count rejected
    const { count: rejected } = await supabase
      .from('PendingFaces')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected');

    return res.status(200).json({
      success: true,
      data: {
        pending: pending || 0,
        assigned: assigned || 0,
        rejected: rejected || 0,
        total: (pending || 0) + (assigned || 0) + (rejected || 0),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
}