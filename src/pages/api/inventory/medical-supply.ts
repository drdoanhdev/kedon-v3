// API: Vật tư y tế (medical_supply)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('medical_supply')
        .select('*, NhaCungCap(ten)')
        .eq('tenant_id', tenantId)
        .eq('trang_thai', 'active')
        .order('ten_vat_tu');

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { ma_vat_tu, ten_vat_tu, don_vi_tinh, gia_nhap, gia_ban, ton_kho, muc_ton_toi_thieu, nha_cung_cap_id, mo_ta } = req.body;

      if (!ten_vat_tu) {
        return res.status(400).json({ error: 'ten_vat_tu là bắt buộc' });
      }

      const { data, error } = await supabase
        .from('medical_supply')
        .insert({
          tenant_id: tenantId,
          ma_vat_tu: ma_vat_tu || null,
          ten_vat_tu,
          don_vi_tinh: don_vi_tinh || 'cái',
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          ton_kho: parseInt(ton_kho) || 0,
          muc_ton_toi_thieu: parseInt(muc_ton_toi_thieu) || 5,
          nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
          mo_ta: mo_ta || null,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;

      const { data, error } = await supabase
        .from('medical_supply')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;

      // Soft delete
      const { error } = await supabase
        .from('medical_supply')
        .update({ trang_thai: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('medical-supply error:', err);
    return res.status(500).json({ error: err.message });
  }
}
