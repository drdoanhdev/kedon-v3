import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders } from '../../../lib/tenantApi';
import { planHasFeature } from '../../../lib/featureConfig';
import { checkEmbeddingServiceHealth } from '../../../lib/faceEmbeddingService';
import { supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const { data: tenantRow } = await supabaseAdmin
    .from('tenants')
    .select('plan')
    .eq('id', ctx.tenantId)
    .single();

  if (!planHasFeature(tenantRow?.plan, 'face_recognition')) {
    return res.status(403).json({ success: false, error: 'Cần gói Pro để dùng nhận diện khuôn mặt' });
  }

  const health = await checkEmbeddingServiceHealth();
  return res.status(health.ok ? 200 : 503).json({
    success: health.ok,
    ...health,
  });
}
