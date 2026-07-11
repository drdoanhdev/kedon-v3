import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFaceDevice, touchFaceDevice } from '../../../lib/faceDeviceAuth';
import { upsertFaceEmbedding } from '../../../lib/faceRecognition';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const device = await requireFaceDevice(req, res);
  if (!device) return;

  const { patient_id, embedding } = req.body || {};
  const patientId = parseInt(String(patient_id), 10);
  if (!patientId || !Array.isArray(embedding)) {
    return res.status(400).json({ success: false, error: 'Thiếu patient_id hoặc embedding' });
  }

  try {
    await upsertFaceEmbedding(device.tenantId, patientId, embedding, {
      deviceId: device.deviceId,
      ip: device.clientIp,
      source: 'agent_enroll',
    });
    await touchFaceDevice(device.deviceId, { ip: device.clientIp });
    return res.status(200).json({ success: true, message: 'Đã lưu embedding' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi lưu embedding';
    return res.status(400).json({ success: false, error: message });
  }
}
