import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFaceDevice, touchFaceDevice } from '../../../lib/faceDeviceAuth';
import { supabaseAdmin } from '../../../lib/tenantApi';
import { uploadPendingFaceSnapshot } from '../../../lib/faceSnapshotUpload';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const device = await requireFaceDevice(req, res);
  if (!device) return;

  const { embedding, snapshot_url, snapshot_base64, quality_score } = req.body || {};

  if (!Array.isArray(embedding) || embedding.length < 128) {
    return res.status(400).json({ success: false, error: 'Thiếu embedding hợp lệ' });
  }

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from('PendingFaces')
    .select('id')
    .eq('tenant_id', device.tenantId)
    .eq('device_id', device.deviceId)
    .eq('status', 'pending')
    .gte('detected_at', fiveMinAgo)
    .limit(1);

  if (recent && recent.length > 0) {
    return res.status(200).json({
      success: true,
      message: 'Đã có khuôn mặt lạ đang chờ xử lý',
      skipped: true,
    });
  }

  let storedSnapshotUrl: string | null = typeof snapshot_url === 'string' ? snapshot_url : null;

  if (!storedSnapshotUrl && typeof snapshot_base64 === 'string' && snapshot_base64.length > 100) {
    try {
      const raw = snapshot_base64.replace(/^data:image\/\w+;base64,/, '');
      const jpegBuffer = Buffer.from(raw, 'base64');
      if (jpegBuffer.length > 0 && jpegBuffer.length <= 2 * 1024 * 1024) {
        storedSnapshotUrl = await uploadPendingFaceSnapshot(device.tenantId, jpegBuffer);
      }
    } catch (err) {
      console.warn('pending face snapshot upload failed:', err);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('PendingFaces')
    .insert({
      tenant_id: device.tenantId,
      branch_id: device.branchId,
      device_id: device.deviceId,
      embedding,
      snapshot_url: storedSnapshotUrl,
      quality_score: quality_score ?? null,
      status: 'pending',
      detected_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  await touchFaceDevice(device.deviceId);

  return res.status(201).json({
    success: true,
    message: 'Đã ghi nhận khuôn mặt lạ',
    pending_face_id: data?.id,
  });
}
