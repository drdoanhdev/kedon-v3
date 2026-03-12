// API endpoint cho hãng tròng kính
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
        .from('HangTrong')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('trang_thai', true)
        .order('ten_hang');

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { ten_hang, gia_nhap, gia_ban, mo_ta } = req.body;
      
      const { data, error } = await supabase
        .from('HangTrong')
        .insert({
          ten_hang,
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          mo_ta,
          tenant_id: tenantId
        })
        .select();

      if (error) {
        if (error.code === '23505') return res.status(409).json({ message: `Hãng tròng "${ten_hang}" đã tồn tại` });
        throw error;
      }
      return res.status(200).json(data[0]);
    }

    if (req.method === 'PUT') {
      const { id, ten_hang, gia_nhap, gia_ban, mo_ta } = req.body;
      
      const { data, error } = await supabase
        .from('HangTrong')
        .update({
          ten_hang,
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          mo_ta
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select();

      if (error) {
        if (error.code === '23505') return res.status(409).json({ message: `Hãng tròng "${ten_hang}" đã tồn tại` });
        throw error;
      }
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      // Hỗ trợ lấy id từ cả body hoặc query (?id=)
      const id = (req.body && req.body.id) || (req.query && req.query.id);

      if (!id) {
        return res.status(400).json({ message: 'Thiếu id hãng tròng cần xóa' });
      }

      // Đảm bảo id là số nguyên
      const parsedId = Array.isArray(id) ? parseInt(id[0] as string, 10) : parseInt(id as string, 10);
      if (isNaN(parsedId)) {
        return res.status(400).json({ message: 'id không hợp lệ' });
      }

      const { data, error } = await supabase
        .from('HangTrong')
        .update({ trang_thai: false })
        .eq('id', parsedId)
        .eq('tenant_id', tenantId)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy hãng tròng để xóa' });
      }

      return res.status(200).json({ message: 'Đã xóa (ẩn) hãng tròng', id: parsedId });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
