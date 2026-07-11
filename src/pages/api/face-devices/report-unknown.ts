import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFaceDevice, touchFaceDevice } from '../../../lib/faceDeviceAuth';
import { supabaseAdmin } from '../../../lib/tenantApi';
import { storePendingFaceSnapshot } from '../../../lib/faceSnapshotUpload';
import { validateFaceEmbedding } from '../../../lib/faceRecognition';

async function saveSnapshotFromBase64(
  tenantId: string,
  snapshotBase64: unknown
): Promise<string | null> {
  if (typeof snapshotBase64 !== 'string' || snapshotBase64.length < 100) {
    return null;
  }
  try {
    const raw = snapshotBase64.replace(/^data:image\/\w+;base64,/, '');
    const jpegBuffer = Buffer.from(raw, 'base64');
    if (jpegBuffer.length === 0 || jpegBuffer.length > 2 * 1024 * 1024) {
      return null;
    }
    return await storePendingFaceSnapshot(tenantId, jpegBuffer);
  } catch (err) {
    console.error('[report-unknown] snapshot store failed:', err);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const device = await requireFaceDevice(req, res);
  if (!device) return;

  const { embedding, snapshot_url, snapshot_base64, quality_score } = req.body || {};

  const embeddingError = validateFaceEmbedding(embedding);
  if (embeddingError) {
    return res.status(400).json({ success: false, error: embeddingError });
  }

  const hasSnapshotPayload =
    (typeof snapshot_url === 'string' && snapshot_url.length > 0) ||
    (typeof snapshot_base64 === 'string' && snapshot_base64.length > 100);

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from('PendingFaces')
    .select('id, snapshot_url')
    .eq('tenant_id', device.tenantId)
    .eq('device_id', device.deviceId)
    .eq('status', 'pending')
    .gte('detected_at', fiveMinAgo)
    .limit(1);

  if (recent && recent.length > 0) {
    const existing = recent[0];
    let snapshotUpdated = false;

    if (!existing.snapshot_url && hasSnapshotPayload) {
      const stored =
        (typeof snapshot_url === 'string' && snapshot_url) ||
        (await saveSnapshotFromBase64(device.tenantId, snapshot_base64));
      if (stored) {
        await supabaseAdmin
          .from('PendingFaces')
          .update({ snapshot_url: stored })
          .eq('id', existing.id);
        snapshotUpdated = true;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Đã có khuôn mặt lạ đang chờ xử lý',
      skipped: true,
      pending_face_id: existing.id,
      snapshot_updated: snapshotUpdated,
    });
  }

  let storedSnapshotUrl: string | null =
    typeof snapshot_url === 'string' && snapshot_url ? snapshot_url : null;

  if (!storedSnapshotUrl && hasSnapshotPayload) {
    storedSnapshotUrl = await saveSnapshotFromBase64(device.tenantId, snapshot_base64);
  }

  if (hasSnapshotPayload && !storedSnapshotUrl) {
    console.warn(
      '[report-unknown] agent gửi ảnh nhưng không lưu được snapshot — kiểm tra R2 env trên server'
    );
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

  await touchFaceDevice(device.deviceId, { ip: device.clientIp });

  return res.status(201).json({
    success: true,
    message: 'Đã ghi nhận khuôn mặt lạ',
    pending_face_id: data?.id,
    snapshot_stored: Boolean(storedSnapshotUrl),
    had_snapshot_payload: hasSnapshotPayload,
  });
}
