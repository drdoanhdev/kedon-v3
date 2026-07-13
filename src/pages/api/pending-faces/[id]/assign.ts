/**
 * API endpoint để gán pending face cho bệnh nhân
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin } from '../../../../lib/tenantApi';
import { upsertFaceEmbedding } from '../../../../lib/faceRecognition';
import { logFaceAudit } from '../../../../lib/faceBiometricGovernance';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const { id } = req.query;
  const { patient_id, suggested_similarity, from_suggestion } = req.body;

  if (!id || !patient_id) {
    return res.status(400).json({ success: false, error: 'Missing id or patient_id' });
  }

  try {
    const { data: pendingFace, error: fetchError } = await supabaseAdmin
      .from('PendingFaces')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (fetchError || !pendingFace) {
      return res.status(404).json({ success: false, error: 'Pending face not found' });
    }

    if (pendingFace.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Pending face đã được xử lý' });
    }

    if (pendingFace.embedding) {
      try {
        await upsertFaceEmbedding(
          ctx.tenantId,
          parseInt(String(patient_id), 10),
          pendingFace.embedding as number[],
          { actor: ctx.userId, source: 'pending_assign' }
        );
      } catch (embErr: unknown) {
        const message = embErr instanceof Error ? embErr.message : 'Lỗi lưu embedding';
        // Thiếu đồng ý sinh trắc → trả 400 rõ ràng thay vì 500.
        return res.status(400).json({ success: false, error: message });
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('PendingFaces')
      .update({
        status: 'assigned',
        assigned_to: parseInt(String(patient_id), 10),
        assigned_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    if (updateError) {
      return res.status(500).json({ success: false, error: updateError.message });
    }

    await logFaceAudit(ctx.tenantId, 'assign', {
      patientId: parseInt(String(patient_id), 10),
      actor: ctx.userId,
      detail: {
        pending_face_id: id,
        from_suggestion: Boolean(from_suggestion),
        suggested_similarity:
          typeof suggested_similarity === 'number' ? suggested_similarity : undefined,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Đã gán khuôn mặt cho bệnh nhân',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
}
