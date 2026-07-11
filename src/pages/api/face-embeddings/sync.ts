import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFaceDevice, touchFaceDevice } from '../../../lib/faceDeviceAuth';
import { supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const device = await requireFaceDevice(req, res);
  if (!device) return;

  await touchFaceDevice(device.deviceId, { ip: device.clientIp });

  const since = typeof req.query.since === 'string' ? req.query.since : null;

  let query = supabaseAdmin
    .from('face_embeddings')
    .select('patient_id, embedding, updated_at, model')
    .eq('tenant_id', device.tenantId)
    .order('updated_at', { ascending: true });

  if (since) {
    query = query.gte('updated_at', since);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const embeddingRows = data || [];
  const patientIds = [...new Set(embeddingRows.map((row) => row.patient_id).filter(Boolean))];

  let nameMap = new Map<number, string>();
  if (patientIds.length > 0) {
    const { data: patients } = await supabaseAdmin
      .from('BenhNhan')
      .select('id, ten')
      .eq('tenant_id', device.tenantId)
      .in('id', patientIds);

    nameMap = new Map((patients || []).map((p) => [p.id, p.ten]));
  }

  const rows = embeddingRows.map((row) => ({
    patient_id: row.patient_id,
    name: nameMap.get(row.patient_id) || null,
    embedding: row.embedding,
    updated_at: row.updated_at,
    model: row.model,
  }));

  return res.status(200).json({
    success: true,
    tenant_id: device.tenantId,
    branch_id: device.branchId,
    count: rows.length,
    synced_at: new Date().toISOString(),
    data: rows,
  });
}
