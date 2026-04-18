import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

const ALLOWED_STATUSES = ['chua_lien_he', 'da_goi', 'hen_goi_lai', 'da_chot_lich'] as const;
type CareStatus = typeof ALLOWED_STATUSES[number];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId, userId } = ctx;

  try {
    if (req.method === 'PUT') {
      const { benhnhan_id, status, note, next_call_at } = req.body || {};

      const patientId = Number(benhnhan_id);
      if (!Number.isFinite(patientId) || patientId <= 0) {
        return res.status(400).json({ message: 'benhnhan_id không hợp lệ' });
      }
      if (!ALLOWED_STATUSES.includes(status as CareStatus)) {
        return res.status(400).json({ message: 'status không hợp lệ' });
      }

      const payload: any = {
        tenant_id: tenantId,
        benhnhan_id: patientId,
        status,
        note: note || null,
        next_call_at: next_call_at || null,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('crm_care_status')
        .upsert(payload, { onConflict: 'tenant_id,benhnhan_id' })
        .select('*')
        .single();

      if (error) {
        return res.status(400).json({ message: 'Lỗi cập nhật trạng thái chăm sóc', details: error.message });
      }

      return res.status(200).json({ data });
    }

    if (req.method === 'GET') {
      const idsParam = typeof req.query.ids === 'string' ? req.query.ids : '';
      const ids = idsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);

      let query = supabase
        .from('crm_care_status')
        .select('benhnhan_id, status, note, next_call_at, updated_at')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false });

      if (ids.length > 0) query = query.in('benhnhan_id', ids);

      const { data, error } = await query.limit(200);
      if (error) {
        return res.status(400).json({ message: 'Lỗi lấy trạng thái chăm sóc', details: error.message });
      }

      return res.status(200).json({ data: data || [] });
    }

    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  } catch (error: any) {
    return res.status(500).json({ message: 'Lỗi server', details: error?.message || String(error) });
  }
}
