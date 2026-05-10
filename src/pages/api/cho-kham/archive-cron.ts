import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/tenantApi';

function parseBearerToken(req: NextApiRequest): string {
  const authHeader = (req.headers['authorization'] as string) || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

function parseRetentionDays(): number {
  const raw = Number(process.env.WAITING_ROOM_LOG_RETENTION_DAYS || '90');
  if (!Number.isFinite(raw)) return 90;
  return Math.min(Math.max(Math.floor(raw), 7), 3650);
}

async function runArchive(retentionDays: number): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('archive_waiting_cleanup_logs', {
    p_retention_days: retentionDays,
    p_tenant_id: null,
    p_branch_id: null,
  });

  if (error) {
    throw error;
  }

  return Number(data || 0);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const cronSecret = process.env.CRON_SECRET;
  const cleanupSecret = process.env.WAITING_ROOM_CLEANUP_SECRET;
  if (!cronSecret && !cleanupSecret) {
    return res.status(500).json({ message: 'Thiếu CRON_SECRET hoặc WAITING_ROOM_CLEANUP_SECRET' });
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

  try {
    const archivedRows = await runArchive(retentionDays);
    return res.status(200).json({
      ok: true,
      retentionDays,
      archivedRows,
      ranAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({
      message: 'Archive failed',
      details: error?.message || String(error),
    });
  }
}
