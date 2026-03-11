//src/pages/api/nhom-thuoc/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('NhomThuoc').select('*').eq('tenant_id', tenantId).order('id');
      if (error) return res.status(400).json({ message: 'Lỗi lấy nhóm thuốc', error: error.message });
      return res.status(200).json({ data });
    }

    else if (req.method === 'POST') {
      const { ten } = req.body;
      if (!ten) return res.status(400).json({ message: 'Thiếu tên nhóm' });

      const { data, error } = await supabase.from('NhomThuoc').insert([{ ten, tenant_id: tenantId }]).select();
      if (error) return res.status(400).json({ message: 'Lỗi khi thêm', error: error.message });
      return res.status(200).json({ message: 'Đã thêm nhóm thuốc', data });
    }

    else if (req.method === 'PUT') {
      const { id, ten } = req.body;
      if (!id || !ten) return res.status(400).json({ message: 'Thiếu thông tin' });

      const { error } = await supabase.from('NhomThuoc').update({ ten }).eq('id', id).eq('tenant_id', tenantId);
      if (error) return res.status(400).json({ message: 'Cập nhật thất bại', error: error.message });
      return res.status(200).json({ message: 'Đã cập nhật nhóm thuốc' });
    }

    else if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ message: 'Thiếu id nhóm' });

      const { error } = await supabase.from('NhomThuoc').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) return res.status(400).json({ message: 'Xoá thất bại', error: error.message });
      return res.status(200).json({ message: 'Đã xoá nhóm thuốc' });
    }

    else {
      return res.status(405).json({ message: 'Phương thức không được hỗ trợ' });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: 'Lỗi server', error: message });
  }
}
