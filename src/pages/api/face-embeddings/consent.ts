import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders, supabaseAdmin } from '../../../lib/tenantApi';
import { planHasFeature } from '../../../lib/featureConfig';
import {
  grantConsent,
  hasActiveConsent,
  revokeConsent,
} from '../../../lib/faceBiometricGovernance';
import { deleteFaceBiometrics } from '../../../lib/faceRecognition';

async function assertFeature(tenantId: string, res: NextApiResponse): Promise<boolean> {
  const { data } = await supabaseAdmin.from('tenants').select('plan').eq('id', tenantId).single();
  if (!planHasFeature(data?.plan, 'face_recognition')) {
    res.status(403).json({ success: false, error: 'Cần gói Pro để dùng nhận diện khuôn mặt' });
    return false;
  }
  return true;
}

function parsePatientId(req: NextApiRequest): number | null {
  const raw = req.body?.patient_id ?? req.query?.patient_id;
  const id = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res, { allowedRoles: ['owner', 'admin', 'doctor', 'staff'] });
  if (!ctx) return;
  if (!(await assertFeature(ctx.tenantId, res))) return;

  const patientId = parsePatientId(req);
  if (!patientId) {
    return res.status(400).json({ success: false, error: 'Thiếu patient_id hợp lệ' });
  }

  if (req.method === 'GET') {
    const check = await hasActiveConsent(ctx.tenantId, patientId);
    return res.status(200).json({
      success: true,
      consented: check.ok,
      needs_migration: check.tableMissing,
    });
  }

  if (req.method === 'POST') {
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : undefined;
    const result = await grantConsent(ctx.tenantId, patientId, ctx.userId, note);
    if (!result.ok) return res.status(500).json({ success: false, error: result.error });
    return res.status(200).json({ success: true, message: 'Đã ghi nhận đồng ý sinh trắc' });
  }

  if (req.method === 'DELETE') {
    const result = await revokeConsent(ctx.tenantId, patientId, ctx.userId);
    if (!result.ok) return res.status(500).json({ success: false, error: result.error });

    // Thu hồi đồng ý → xóa dữ liệu sinh trắc đã lưu (embedding + pending faces).
    await deleteFaceBiometrics(ctx.tenantId, patientId, {
      actor: ctx.userId,
      reason: 'consent_revoked',
    });

    return res.status(200).json({
      success: true,
      message: 'Đã thu hồi đồng ý và xóa dữ liệu sinh trắc của bệnh nhân',
    });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
