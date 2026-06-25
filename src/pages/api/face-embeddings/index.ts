import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';
import { upsertFaceEmbedding } from '../../../lib/faceRecognition';
import { planHasFeature } from '../../../lib/featureConfig';

async function assertTenantFeature(tenantId: string, res: NextApiResponse): Promise<boolean> {
  const { data: tenantRow } = await supabaseAdmin
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single();

  if (!planHasFeature(tenantRow?.plan, 'face_recognition')) {
    res.status(403).json({ success: false, error: 'Cần gói Pro để dùng nhận diện khuôn mặt' });
    return false;
  }
  return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const { tenantId } = ctx;

  if (!(await assertTenantFeature(tenantId, res))) return;

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from('face_embeddings')
        .select(
          `id, patient_id, created_at, updated_at, model,
           BenhNhan(id, ten, dienthoai)`
        )
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false });

      if (error) return res.status(400).json({ success: false, error: error.message });

      const formattedData = (data || []).map((item: Record<string, unknown>) => ({
        id: item.id,
        patient_id: item.patient_id,
        patient: item.BenhNhan,
        created_at: item.created_at,
        updated_at: item.updated_at,
        has_embedding: true,
      }));

      return res.status(200).json({
        success: true,
        count: formattedData.length,
        data: formattedData,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Lỗi server';
      return res.status(500).json({ success: false, error: message });
    }
  }

  if (req.method === 'POST') {
    const { patient_id, embedding } = req.body || {};
    const patientId = parseInt(String(patient_id), 10);
    if (!patientId || !Array.isArray(embedding)) {
      return res.status(400).json({ success: false, error: 'Thiếu patient_id hoặc embedding' });
    }

    try {
      await upsertFaceEmbedding(tenantId, patientId, embedding);
      return res.status(200).json({ success: true, message: 'Đã lưu embedding' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi lưu embedding';
      return res.status(400).json({ success: false, error: message });
    }
  }

  if (req.method === 'DELETE') {
    const { patient_id } = req.query;
    if (!patient_id) {
      return res.status(400).json({ success: false, error: 'Thiếu patient_id' });
    }

    const { error } = await supabaseAdmin
      .from('face_embeddings')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('patient_id', patient_id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: 'Đã xóa embedding' });
  }

  if (req.method === 'HEAD') {
    const { patient_id } = req.query;
    if (!patient_id) return res.status(400).end();

    const { data } = await supabaseAdmin
      .from('face_embeddings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patient_id)
      .maybeSingle();

    return data ? res.status(200).end() : res.status(404).end();
  }

  return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
}
