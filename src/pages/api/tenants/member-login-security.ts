import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';

type LoginSecurityPolicy = {
  enabled: boolean;
  single_device_only: boolean;
  enforce_store_network: boolean;
  allowed_ips: string[];
  enforce_working_hours: boolean;
  allowed_weekdays: number[];
  start_time: string;
  end_time: string;
  timezone: string;
};

const DEFAULT_POLICY: LoginSecurityPolicy = {
  enabled: false,
  single_device_only: false,
  enforce_store_network: false,
  allowed_ips: [],
  enforce_working_hours: false,
  allowed_weekdays: [1, 2, 3, 4, 5, 6],
  start_time: '08:00',
  end_time: '20:00',
  timezone: 'Asia/Ho_Chi_Minh',
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function sanitizePolicy(input: any): LoginSecurityPolicy {
  const merged: LoginSecurityPolicy = {
    ...DEFAULT_POLICY,
    ...(input || {}),
  };

  const allowedIpsRaw = Array.isArray(merged.allowed_ips) ? merged.allowed_ips : [];
  const allowedIps = allowedIpsRaw
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 50);

  const weekdaysRaw = Array.isArray(merged.allowed_weekdays) ? merged.allowed_weekdays : DEFAULT_POLICY.allowed_weekdays;
  const weekdays = Array.from(
    new Set(
      weekdaysRaw
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    )
  ).sort((a, b) => a - b);

  const start = String(merged.start_time || DEFAULT_POLICY.start_time);
  const end = String(merged.end_time || DEFAULT_POLICY.end_time);

  return {
    enabled: merged.enabled === true,
    single_device_only: merged.single_device_only === true,
    enforce_store_network: merged.enforce_store_network === true,
    allowed_ips: allowedIps,
    enforce_working_hours: merged.enforce_working_hours === true,
    allowed_weekdays: weekdays.length > 0 ? weekdays : DEFAULT_POLICY.allowed_weekdays,
    start_time: TIME_RE.test(start) ? start : DEFAULT_POLICY.start_time,
    end_time: TIME_RE.test(end) ? end : DEFAULT_POLICY.end_time,
    timezone: String(merged.timezone || DEFAULT_POLICY.timezone).slice(0, 80),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!ctx) return;

  const { tenantId } = ctx;

  if (req.method === 'GET') {
    const membershipId = String(req.query.membershipId || '').trim();
    if (!membershipId) {
      return res.status(400).json({ message: 'Thieu membershipId' });
    }

    const { data, error } = await supabaseAdmin
      .from('tenantmembership')
      .select('id, user_id, role, login_security, locked_device_id, locked_device_label, locked_device_at')
      .eq('tenant_id', tenantId)
      .eq('id', membershipId)
      .maybeSingle();

    if (error) {
      if (/login_security|locked_device_id|locked_device_label|locked_device_at/i.test(error.message || '')) {
        return res.status(501).json({ message: 'Chua cap nhat CSDL cho tinh nang khoa dang nhap. Vui long chay migration V048.' });
      }
      return res.status(500).json({ message: 'Loi lay cai dat bao mat', error: error.message });
    }
    if (!data) {
      return res.status(404).json({ message: 'Khong tim thay thanh vien' });
    }

    return res.status(200).json({
      data: {
        ...data,
        login_security: sanitizePolicy((data as any).login_security),
      },
    });
  }

  if (req.method === 'PUT') {
    const { membershipId, login_security, reset_device_lock } = req.body || {};
    if (!membershipId) {
      return res.status(400).json({ message: 'Thieu membershipId' });
    }

    const { data: member, error: memberError } = await supabaseAdmin
      .from('tenantmembership')
      .select('id, role')
      .eq('tenant_id', tenantId)
      .eq('id', membershipId)
      .maybeSingle();

    if (memberError) {
      return res.status(500).json({ message: 'Loi kiem tra thanh vien', error: memberError.message });
    }
    if (!member) {
      return res.status(404).json({ message: 'Khong tim thay thanh vien' });
    }

    if (member.role === 'owner') {
      return res.status(403).json({ message: 'Khong the cai dat khoa dang nhap cho chu cua hang' });
    }

    const policy = sanitizePolicy(login_security);
    const patch: Record<string, unknown> = {
      login_security: policy,
    };

    if (reset_device_lock === true || policy.single_device_only !== true) {
      patch.locked_device_id = null;
      patch.locked_device_label = null;
      patch.locked_device_at = null;
    }

    const { error: updateError } = await supabaseAdmin
      .from('tenantmembership')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', membershipId);

    if (updateError) {
      if (/login_security|locked_device_id|locked_device_label|locked_device_at/i.test(updateError.message || '')) {
        return res.status(501).json({ message: 'Chua cap nhat CSDL cho tinh nang khoa dang nhap. Vui long chay migration V048.' });
      }
      return res.status(500).json({ message: 'Loi luu cai dat bao mat', error: updateError.message });
    }

    return res.status(200).json({ message: 'Da cap nhat cai dat bao mat dang nhap' });
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).json({ message: `Phuong thuc ${req.method} khong duoc phep` });
}
