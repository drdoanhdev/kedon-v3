import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/tenantApi';

function parseBearerToken(req: NextApiRequest): string {
  const authHeader = (req.headers['authorization'] as string) || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

function parseRetentionDays(): number {
  const raw = Number(process.env.RECENT_ACTIVITY_RETENTION_DAYS || '30');
  if (!Number.isFinite(raw)) return 30;
  return Math.min(Math.max(Math.floor(raw), 1), 365);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  // Hỗ trợ Vercel Cron: Authorization Bearer CRON_SECRET
  // và fallback header/query riêng cho hệ thống tự chạy.
  const cronSecret = process.env.CRON_SECRET;
  const cleanupSecret = process.env.RECENT_ACTIVITY_CLEANUP_SECRET;
  if (!cronSecret && !cleanupSecret) {
    return res.status(500).json({ message: 'Thiếu CRON_SECRET hoặc RECENT_ACTIVITY_CLEANUP_SECRET' });
  }

  const bearer = parseBearerToken(req);
  const headerSecret = (req.headers['x-cron-secret'] as string) || '';
  const querySecret = (req.query.secret as string) || '';

  const authorized =
    (cronSecret && bearer && bearer === cronSecret) ||
    (cleanupSecret && headerSecret && headerSecret === cleanupSecret) ||
    (cleanupSecret && querySecret && querySecret === cleanupSecret);

  if (!authorized) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const retentionDays = parseRetentionDays();

  const { data, error } = await supabaseAdmin.rpc('cleanup_recent_activity_events', {
    p_days: retentionDays,
    p_tenant_id: null,
  });

  if (error) {
    return res.status(500).json({ message: 'Cleanup failed', details: error.message });
  }

  return res.status(200).json({
    ok: true,
    retentionDays,
    deletedRows: Number(data || 0),
    ranAt: new Date().toISOString(),
  });
}
