import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFaceDevice, touchFaceDevice } from '../../../lib/faceDeviceAuth';

function getClientIp(req: NextApiRequest): string | null {
  const xff = req.headers['x-forwarded-for'];
  const forwarded = Array.isArray(xff) ? xff[0] : xff;
  return forwarded?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const device = await requireFaceDevice(req, res);
  if (!device) return;

  const { agent_version, camera_status, last_error, applied_camera_url } = req.body || {};

  const { settings } = await touchFaceDevice(device.deviceId, {
    ip: getClientIp(req),
    agentVersion: agent_version || null,
    cameraStatus: camera_status || null,
    lastError: typeof last_error === 'string' ? last_error.slice(0, 300) : null,
    ackAppliedCameraUrl: typeof applied_camera_url === 'string' ? applied_camera_url : null,
  });

  return res.status(200).json({
    success: true,
    device_id: device.deviceId,
    tenant_id: device.tenantId,
    branch_id: device.branchId,
    camera_status: camera_status || 'ok',
    server_time: new Date().toISOString(),
    // Admin có thể đẩy URL RTSP mới từ web (xem PATCH /api/face-devices/[id]) —
    // agent tự áp dụng và xác nhận lại bằng applied_camera_url ở lần heartbeat sau.
    pending_camera_url: (settings?.pending_camera_url as string | undefined) || null,
  });
}
