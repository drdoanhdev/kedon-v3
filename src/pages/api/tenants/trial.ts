import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  setNoCacheHeaders(res);

  const { supabase, tenantId } = tenant;

  // 1. Lấy thông tin tenant (trial info)
  const { data: tenantData, error: tenantErr } = await supabase
    .from('tenants')
    .select('plan, trial_start, trial_days, trial_max_prescriptions, plan_expires_at, created_at')
    .eq('id', tenantId)
    .single();

  if (tenantErr || !tenantData) {
    return res.status(404).json({ error: 'Không tìm thấy phòng khám' });
  }

  // 2. Đếm số đơn thuốc + đơn kính đã tạo
  const [donThuocResult, donKinhResult] = await Promise.all([
    supabase.from('DonThuoc').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('DonKinh').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ]);

  const totalPrescriptions = (donThuocResult.count || 0) + (donKinhResult.count || 0);

  // 3. Tính ngày trial còn lại
  const trialStart = new Date(tenantData.trial_start || tenantData.created_at);
  const trialDays = tenantData.trial_days || 90;
  const trialEnd = new Date(trialStart.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const maxPrescriptions = tenantData.trial_max_prescriptions || 1000;
  const prescriptionsRemaining = Math.max(0, maxPrescriptions - totalPrescriptions);

  // 4. Kiểm tra trial hết hạn
  const plan = tenantData.plan || 'trial';
  const isTrialExpired = plan === 'trial' && (daysRemaining <= 0 || prescriptionsRemaining <= 0);

  return res.status(200).json({
    plan,
    trial: {
      startDate: trialStart.toISOString(),
      endDate: trialEnd.toISOString(),
      totalDays: trialDays,
      daysRemaining,
      maxPrescriptions,
      usedPrescriptions: totalPrescriptions,
      prescriptionsRemaining,
      isExpired: isTrialExpired,
    },
    planExpiresAt: tenantData.plan_expires_at,
  });
}
