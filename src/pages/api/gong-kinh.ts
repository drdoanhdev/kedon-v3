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
      const { data, error } = await supabase
        .from('GongKinh')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('trang_thai', true)
        .order('ten_gong');

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { ten_gong, chat_lieu, gia_nhap, gia_ban, mo_ta } = req.body;
      
      const { data, error } = await supabase
        .from('GongKinh')
        .insert({
          ten_gong,
          chat_lieu: chat_lieu || '',
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          mo_ta: mo_ta || '',
          tenant_id: tenantId
        })
        .select();

      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    if (req.method === 'PUT') {
      const { id, ten_gong, chat_lieu, gia_nhap, gia_ban, mo_ta } = req.body;
      
      const { data, error } = await supabase
        .from('GongKinh')
        .update({
          ten_gong,
          chat_lieu: chat_lieu || '',
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          mo_ta: mo_ta || ''
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select();

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
