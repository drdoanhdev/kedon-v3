// API: Nhóm giá gọng kính - CRUD + nhập kho theo nhóm
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  try {
    // GET: Danh sách nhóm giá
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('nhom_gia_gong')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('gia_ban_tu', { ascending: true });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Tạo nhóm giá mới
    if (req.method === 'POST') {
      const { ten_nhom, gia_ban_tu, gia_ban_den, gia_ban_mac_dinh, gia_nhap_trung_binh, mo_ta } = req.body;

      if (!ten_nhom) {
        return res.status(400).json({ error: 'Tên nhóm là bắt buộc' });
      }

      const { data, error } = await supabase
        .from('nhom_gia_gong')
        .insert({
          tenant_id: tenantId,
          ten_nhom,
          gia_ban_tu: parseInt(gia_ban_tu) || 0,
          gia_ban_den: parseInt(gia_ban_den) || 0,
          gia_ban_mac_dinh: parseInt(gia_ban_mac_dinh) || 0,
          gia_nhap_trung_binh: parseInt(gia_nhap_trung_binh) || 0,
          mo_ta: mo_ta || null,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    // PUT: Cập nhật nhóm giá
    if (req.method === 'PUT') {
      const { id, ten_nhom, gia_ban_tu, gia_ban_den, gia_ban_mac_dinh, gia_nhap_trung_binh, mo_ta, trang_thai } = req.body;

      if (!id) return res.status(400).json({ error: 'Thiếu id' });

      const updateData: any = { updated_at: new Date().toISOString() };
      if (ten_nhom !== undefined) updateData.ten_nhom = ten_nhom;
      if (gia_ban_tu !== undefined) updateData.gia_ban_tu = parseInt(gia_ban_tu) || 0;
      if (gia_ban_den !== undefined) updateData.gia_ban_den = parseInt(gia_ban_den) || 0;
      if (gia_ban_mac_dinh !== undefined) updateData.gia_ban_mac_dinh = parseInt(gia_ban_mac_dinh) || 0;
      if (gia_nhap_trung_binh !== undefined) updateData.gia_nhap_trung_binh = parseInt(gia_nhap_trung_binh) || 0;
      if (mo_ta !== undefined) updateData.mo_ta = mo_ta || null;
      if (trang_thai !== undefined) updateData.trang_thai = trang_thai;

      const { data, error } = await supabase
        .from('nhom_gia_gong')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    // DELETE: Xóa nhóm giá
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Thiếu id' });

      const { error } = await supabase
        .from('nhom_gia_gong')
        .delete()
        .eq('id', parseInt(id as string))
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('nhom-gia-gong error:', err);
    return res.status(500).json({ error: err.message });
  }
}
