/**
 * Gợi ý bệnh nhân tương tự với pending face (cosine similarity trên embedding).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin } from '../../../../lib/tenantApi';
import { FACE_EMBEDDING_DIM, validateFaceEmbedding } from '../../../../lib/faceRecognition';
import { dot, normalize } from '../../../../lib/faceSmartLearning';

/** Ngưỡng thấp hơn check-in (0.5) để gợi ý rộng hơn cho nhân viên chọn. */
const SUGGEST_MIN_SIMILARITY = 0.35;
const SUGGEST_TOP_N = 5;

interface Suggestion {
  patient_id: number;
  ten: string;
  dienthoai: string | null;
  mabenhnhan: string | null;
  similarity: number;
  similarity_pct: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing id' });
  }

  try {
    const { data: pendingFace, error: fetchError } = await supabaseAdmin
      .from('PendingFaces')
      .select('id, embedding, tenant_id')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (fetchError || !pendingFace) {
      return res.status(404).json({ success: false, error: 'Pending face not found' });
    }

    const embeddingError = validateFaceEmbedding(pendingFace.embedding);
    if (embeddingError) {
      return res.status(200).json({
        success: true,
        data: [] as Suggestion[],
        message: 'Pending face không có embedding hợp lệ để so sánh',
      });
    }

    const queryVec = normalize(pendingFace.embedding as number[]);

    const { data: rows, error: embError } = await supabaseAdmin
      .from('face_embeddings')
      .select('patient_id, embedding')
      .eq('tenant_id', ctx.tenantId);

    if (embError) {
      return res.status(500).json({ success: false, error: embError.message });
    }

    const scored: { patient_id: number; similarity: number }[] = [];
    for (const row of rows || []) {
      const emb = row.embedding as number[] | null;
      if (!Array.isArray(emb) || emb.length !== FACE_EMBEDDING_DIM) continue;
      const sim = dot(queryVec, normalize(emb));
      if (sim >= SUGGEST_MIN_SIMILARITY) {
        scored.push({ patient_id: row.patient_id, similarity: sim });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    const top = scored.slice(0, SUGGEST_TOP_N);

    if (top.length === 0) {
      return res.status(200).json({ success: true, data: [] as Suggestion[] });
    }

    const patientIds = top.map((t) => t.patient_id);
    const { data: patients, error: patientError } = await supabaseAdmin
      .from('BenhNhan')
      .select('id, ten, dienthoai, mabenhnhan')
      .eq('tenant_id', ctx.tenantId)
      .in('id', patientIds);

    if (patientError) {
      return res.status(500).json({ success: false, error: patientError.message });
    }

    const byId = new Map((patients || []).map((p) => [p.id as number, p]));
    const suggestions: Suggestion[] = top
      .map((t) => {
        const p = byId.get(t.patient_id);
        if (!p) return null;
        return {
          patient_id: t.patient_id,
          ten: p.ten as string,
          dienthoai: (p.dienthoai as string | null) ?? null,
          mabenhnhan: (p.mabenhnhan as string | null) ?? null,
          similarity: Math.round(t.similarity * 1000) / 1000,
          similarity_pct: Math.round(t.similarity * 100),
        };
      })
      .filter((s): s is Suggestion => s !== null);

    return res.status(200).json({ success: true, data: suggestions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
}
