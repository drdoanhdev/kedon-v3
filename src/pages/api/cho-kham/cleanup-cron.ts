import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/tenantApi';

function parseBearerToken(req: NextApiRequest): string {
  const authHeader = (req.headers['authorization'] as string) || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

function parseRetentionMinutes(): number {
  const raw = Number(process.env.WAITING_ROOM_AUTO_CLEANUP_MINUTES || '30');
  if (!Number.isFinite(raw)) return 30;
  return Math.min(Math.max(Math.floor(raw), 1), 24 * 60);
}

async function runAutoCleanup(thresholdMinutes: number): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('cleanup_waiting_room_done_cases', {
    p_threshold_minutes: thresholdMinutes,
    p_tenant_id: null,
    p_branch_id: null,
    p_trigger_mode: 'auto',
    p_actor_role: 'system',
    p_actor_user_id: null,
    p_actor_email: null,
    p_details: { request_source: 'vercel-cron' },
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

  const thresholdMinutes = parseRetentionMinutes();

  try {
    const deletedRows = await runAutoCleanup(thresholdMinutes);
    return res.status(200).json({
      ok: true,
      thresholdMinutes,
      deletedRows,
      ranAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({
      message: 'Cleanup failed',
      details: error?.message || String(error),
    });
  }
}
