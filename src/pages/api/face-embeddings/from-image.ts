import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders, supabaseAdmin } from '../../../lib/tenantApi';
import { upsertFaceEmbedding, validateFaceEmbedding } from '../../../lib/faceRecognition';
import { planHasFeature } from '../../../lib/featureConfig';
import { checkEmbeddingServiceHealth, getEmbeddingServiceUrl } from '../../../lib/faceEmbeddingService';
import { normalize } from '../../../lib/faceSmartLearning';

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

async function fetchEmbeddingFromService(
  imageBase64: string
): Promise<{ embedding: number[]; quality: number | null }> {
  const health = await checkEmbeddingServiceHealth();
  if (!health.ok) {
    throw new Error(health.message);
  }

  const serviceUrl = getEmbeddingServiceUrl();

  let response: Response;
  try {
    response = await fetch(`${serviceUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64 }),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new Error(
      'Không kết nối được dịch vụ embedding. Trên PC camera chạy chay-agent.bat (hoặc dùng dang-ky-khuon-mat.bat để đăng ký trực tiếp).'
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    embedding?: number[];
    error?: string;
    quality?: number;
  };

  if (!response.ok) {
    throw new Error(payload.error || 'Dịch vụ embedding trả lỗi');
  }

  const embeddingError = validateFaceEmbedding(payload.embedding);
  if (embeddingError) {
    throw new Error('Không trích xuất được embedding từ ảnh. Thử lại với ánh sáng tốt hơn.');
  }

  return { embedding: payload.embedding, quality: payload.quality ?? null };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const { tenantId } = ctx;
  if (!(await assertTenantFeature(tenantId, res))) return;

  const { patient_id, image_base64, images_base64 } = req.body || {};
  const patientId = parseInt(String(patient_id), 10);

  const images: string[] = Array.isArray(images_base64)
    ? images_base64.filter((x: unknown) => typeof x === 'string' && (x as string).length >= 100)
    : typeof image_base64 === 'string' && image_base64.length >= 100
      ? [image_base64]
      : [];

  if (!patientId || images.length === 0) {
    return res.status(400).json({ success: false, error: 'Thiếu patient_id hoặc ảnh' });
  }

  if (images.length > 5) {
    return res.status(400).json({ success: false, error: 'Tối đa 5 ảnh mỗi lần đăng ký' });
  }

  try {
    const results = [];
    for (const img of images) {
      results.push(await fetchEmbeddingFromService(img));
    }

    // Trung bình các embedding rồi chuẩn hóa L2 → centroid ổn định hơn 1 góc
    const dim = results[0].embedding.length;
    const avg = new Array(dim).fill(0);
    for (const r of results) {
      for (let i = 0; i < dim; i++) avg[i] += r.embedding[i];
    }
    for (let i = 0; i < dim; i++) avg[i] /= results.length;
    const embedding = normalize(avg);
    const quality =
      results.reduce((s, r) => s + (r.quality ?? 0.5), 0) / results.length;

    await upsertFaceEmbedding(tenantId, patientId, embedding, {
      actor: ctx.userId,
      source: images.length > 1 ? 'web_enroll_multi_angle' : 'web_enroll',
    });
    return res.status(200).json({
      success: true,
      message: `Đã đăng ký khuôn mặt cho bệnh nhân #${patientId} (${images.length} góc)`,
      quality,
      angles: images.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi xử lý ảnh';
    return res.status(400).json({ success: false, error: message });
  }
}
