/**
 * Public kiosk API — xác thực bằng kiosk token (không cần đăng nhập nhân viên).
 * GET: session + sự kiện gần đây
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchKioskRecentEvents, requireKioskDevice } from '../../../lib/faceKiosk';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Không cache — kiosk cần dữ liệu mới
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const ctx = await requireKioskDevice(req, res);
  if (!ctx) return;

  try {
    const sinceMs = Math.min(
      300000,
      Math.max(30000, parseInt(String(req.query.since_ms || '120000'), 10) || 120000)
    );
    const events = await fetchKioskRecentEvents(ctx, sinceMs);

    return res.status(200).json({
      success: true,
      data: {
        device_id: ctx.deviceId,
        device_label: ctx.deviceLabel,
        events,
        server_time: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
}
