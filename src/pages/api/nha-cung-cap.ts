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
        // Attempt soft-delete filter; fall back if column doesn't exist
        const { data, error } = await query.eq('trang_thai', true);
        if (error) {
          if (error.message?.toLowerCase().includes('trang_thai')) {
            // Fallback without filter
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
      const { ten, dia_chi, dien_thoai, facebook, ghi_chu } = req.body;
      if (!ten) return res.status(400).json({ message: 'Thiếu tên' });
      const { data, error } = await supabase
        .from('NhaCungCap')
        .insert({ ten, dia_chi, dien_thoai, facebook, ghi_chu, tenant_id: tenantId })
        .select();
      if (error) throw error;
      return res.status(200).json({ data: data?.[0] });
    }

    if (req.method === 'PUT') {
      const { id, ten, dia_chi, dien_thoai, ghi_chu, facebook } = req.body;
      if (!id) return res.status(400).json({ message: 'Thiếu id' });
      const { data, error } = await supabase
        .from('NhaCungCap')
        .update({ ten, dia_chi, dien_thoai, ghi_chu, facebook })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select();
      if (error) throw error;
      return res.status(200).json({ data: data?.[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query; // delete?id=123
      if (!id) return res.status(400).json({ message: 'Thiếu id' });
      // Try soft delete first
      const { error: softErr } = await supabase
        .from('NhaCungCap')
        .update({ trang_thai: false })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (softErr) {
        if (softErr.message?.toLowerCase().includes('trang_thai')) {
          // Hard delete fallback when column missing
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
