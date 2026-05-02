// API endpoint cho Nhà Cung Cấp
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
      const includeInactive = req.query.include_inactive === 'true';
      let query = supabase.from('NhaCungCap').select('*').eq('tenant_id', tenantId).order('ten');
      if (!includeInactive) {
        // trang_thai is TEXT 'active'/'inactive' (V034) — exclude only explicit 'inactive'
        // (NULL or 'active' → visible). Fallback if column missing.
        const { data, error } = await query.or('trang_thai.is.null,trang_thai.neq.inactive');
        if (error) {
          if (error.message?.toLowerCase().includes('trang_thai')) {
            const { data: fallbackData, error: fbError } = await supabase
              .from('NhaCungCap')
              .select('*')
              .eq('tenant_id', tenantId)
              .order('ten');
            if (fbError) throw fbError;
            return res.status(200).json({ data: fallbackData, warning: 'Thiếu cột trang_thai – trả về tất cả bản ghi' });
          }
          throw error;
        }
        return res.status(200).json({ data });
      } else {
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ data });
      }
    }

    if (req.method === 'POST') {
      const { ten, dia_chi, dien_thoai, facebook, ghi_chu, zalo_phone } = req.body;
      if (!ten) return res.status(400).json({ message: 'Thiếu tên' });
      const { data, error } = await supabase
        .from('NhaCungCap')
        .insert({ ten, dia_chi, dien_thoai, facebook, ghi_chu, zalo_phone: zalo_phone || null, tenant_id: tenantId })
        .select();
      if (error) throw error;
      return res.status(200).json({ data: data?.[0] });
    }

    if (req.method === 'PUT') {
      const { id, ten, dia_chi, dien_thoai, ghi_chu, facebook, zalo_phone } = req.body;
      if (!id) return res.status(400).json({ message: 'Thiếu id' });
      const updateData: any = { ten, dia_chi, dien_thoai, ghi_chu, facebook };
      if (zalo_phone !== undefined) updateData.zalo_phone = zalo_phone || null;
      const { data, error } = await supabase
        .from('NhaCungCap')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select();
      if (error) throw error;
      return res.status(200).json({ data: data?.[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query; // delete?id=123
      if (!id) return res.status(400).json({ message: 'Thiếu id' });
      // Soft delete: trang_thai TEXT 'inactive' (V034 schema)
      const { error: softErr } = await supabase
        .from('NhaCungCap')
        .update({ trang_thai: 'inactive' })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (softErr) {
        if (softErr.message?.toLowerCase().includes('trang_thai')) {
          const { error: hardErr } = await supabase
            .from('NhaCungCap')
            .delete()
            .eq('id', id);
          if (hardErr) throw hardErr;
          return res.status(200).json({ message: 'Đã xóa (hard delete vì thiếu cột trang_thai)' });
        }
        throw softErr;
      }
      return res.status(200).json({ message: 'Đã xóa (soft delete)' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error: any) {
    console.error('API NhaCungCap Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
