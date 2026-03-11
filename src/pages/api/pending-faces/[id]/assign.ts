/**
 * API endpoint để gán pending face cho bệnh nhân
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin } from '../../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const supabase = supabaseAdmin;

  const { id } = req.query;
  const { patient_id } = req.body;

  if (!id || !patient_id) {
    return res.status(400).json({ success: false, error: 'Missing id or patient_id' });
  }

  try {
    // 1. Lấy thông tin pending face
    const { data: pendingFace, error: fetchError } = await supabase
      .from('PendingFaces')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !pendingFace) {
      return res.status(404).json({ success: false, error: 'Pending face not found' });
    }

    if (pendingFace.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Pending face đã được xử lý' });
    }

    // 2. Copy embedding sang bảng insightface_embeddings
    if (pendingFace.embedding) {
      // Xóa embedding cũ nếu có
      await supabase
        .from('insightface_embeddings')
        .delete()
        .eq('patient_id', patient_id);

      // Thêm embedding mới
      const { error: insertError } = await supabase
        .from('insightface_embeddings')
        .insert({
          patient_id: parseInt(patient_id as string),
          embedding: pendingFace.embedding,
        });

      if (insertError) {
        console.error('Error inserting embedding:', insertError);
        return res.status(500).json({ success: false, error: 'Không thể lưu embedding' });
      }
    }

    // 3. Cập nhật pending face status
    const { error: updateError } = await supabase
      .from('PendingFaces')
      .update({
        status: 'assigned',
        assigned_to: parseInt(patient_id as string),
        assigned_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      return res.status(500).json({ success: false, error: updateError.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Đã gán khuôn mặt cho bệnh nhân',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
}