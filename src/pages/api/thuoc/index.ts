//src/pages/api/thuoc/index.ts L1
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

type NhomThuoc = { id: number };
type Thuoc = {
  id: number;
  [key: string]: unknown;
  nhomthuocs: NhomThuoc[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  const method = req.method;

  try {
    if (method === 'GET') {
      const { data, error } = await supabase
        .from('Thuoc')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('id', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });

      // Chuyển đổi nhomthuoc string thành array để frontend sử dụng
      const parsed = data.map((item: any) => ({
        ...item,
        nhomthuocs: item.nhomthuoc ? item.nhomthuoc.split(',').map((id: string) => parseInt(id.trim())).filter((id: number) => !isNaN(id)) : [],
      }));
      return res.status(200).json({ data: parsed });
    }

    if (method === 'POST') {
      console.log('🔍 POST Request Body:', JSON.stringify(req.body, null, 2));
      const { id, ...thuocData } = req.body; // Loại bỏ id khỏi payload
      
      // Validate required fields
      if (!thuocData.tenthuoc || !thuocData.donvitinh) {
        console.log('❌ Missing required fields:', { tenthuoc: thuocData.tenthuoc, donvitinh: thuocData.donvitinh });
        return res.status(400).json({ error: 'Tên thuốc và đơn vị tính là bắt buộc' });
      }
      
      console.log('📝 Data to insert (without id):', JSON.stringify(thuocData, null, 2));
      
      try {
        const { data, error } = await supabase.from('Thuoc').insert([{ ...thuocData, tenant_id: tenantId }]).select();
        
        if (error) {
          console.log('❌ Supabase Error:', error);
          return res.status(400).json({ error: error.message });
        }
        
        if (!data || !data[0]) {
          console.log('❌ No data returned from insert');
          return res.status(400).json({ error: 'Không thể tạo thuốc mới' });
        }

        console.log('✅ Successfully created drug:', data[0]);
        return res.status(200).json({ message: 'Đã thêm thuốc', data });
      } catch (insertError) {
        console.log('❌ Insert Exception:', insertError);
        return res.status(500).json({ error: 'Lỗi khi thêm thuốc: ' + String(insertError) });
      }
    }

    if (method === 'PUT') {
      const { id, ...rest } = req.body;
      const { error } = await supabase.from('Thuoc').update(rest).eq('id', id).eq('tenant_id', tenantId);
      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({ message: 'Đã cập nhật thuốc' });
    }

    if (method === 'DELETE') {
      const { id } = req.query;
      const { error } = await supabase.from('Thuoc').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ message: 'Đã xoá thuốc' });
    }

    return res.status(405).json({ message: 'Phương thức không hỗ trợ' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: 'Lỗi server', error: message });
  }
}
