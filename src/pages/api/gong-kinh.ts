// API endpoint cho gọng kính
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  try {
    if (req.method === 'GET') {
      const { show_inactive } = req.query;
      let query = supabase
        .from('GongKinh')
        .select('*, NhaCungCap:nha_cung_cap_id(id, ten)')
        .eq('tenant_id', tenantId)
        .order('ten_gong');

      if (!show_inactive) {
        query = query.eq('trang_thai', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { ten_gong, chat_lieu, gia_nhap, gia_ban, mo_ta, ma_gong, mau_sac, kich_co, nha_cung_cap_id, ton_kho, muc_ton_can_co } = req.body;
      
      const { data, error } = await supabase
        .from('GongKinh')
        .insert({
          ten_gong,
          chat_lieu: chat_lieu || '',
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          mo_ta: mo_ta || '',
          ma_gong: ma_gong || null,
          mau_sac: mau_sac || null,
          kich_co: kich_co || null,
          nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
          ton_kho: parseInt(ton_kho) || 0,
          muc_ton_can_co: parseInt(muc_ton_can_co) || 2,
          tenant_id: tenantId
        })
        .select('*, NhaCungCap:nha_cung_cap_id(id, ten)');

      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    if (req.method === 'PUT') {
      const { id, ten_gong, chat_lieu, gia_nhap, gia_ban, mo_ta, ma_gong, mau_sac, kich_co, nha_cung_cap_id, muc_ton_can_co } = req.body;
      
      const { data, error } = await supabase
        .from('GongKinh')
        .update({
          ten_gong,
          chat_lieu: chat_lieu || '',
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          mo_ta: mo_ta || '',
          ma_gong: ma_gong || null,
          mau_sac: mau_sac || null,
          kich_co: kich_co || null,
          nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
          muc_ton_can_co: parseInt(muc_ton_can_co) || 2,
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*, NhaCungCap:nha_cung_cap_id(id, ten)');

      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      
      const { error } = await supabase
        .from('GongKinh')
        .update({ trang_thai: false })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return res.status(200).json({ message: 'Đã xóa gọng kính' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
