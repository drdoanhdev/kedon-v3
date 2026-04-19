// API: Tròng cần đặt (lens_order)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_lens', 'manage_inventory'))) return;
  const { tenantId } = ctx;
  try {
    // GET: Danh sách tròng cần đặt
    if (req.method === 'GET') {
      const { trang_thai, group } = req.query;

      // Nếu muốn group summary
      if (group === 'true') {
        const { data, error } = await supabase
          .rpc('get_lens_order_summary', { p_tenant_id: tenantId });

        // Fallback: query trực tiếp nếu chưa có RPC
        if (error) {
          let query = supabase
            .from('lens_order')
            .select('*, HangTrong(ten_hang), DonKinh(id, BenhNhan(ten))')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

          if (trang_thai) query = query.eq('trang_thai', trang_thai);
          else query = query.in('trang_thai', ['cho_dat', 'da_dat']);

          const { data: fallbackData, error: fbError } = await query;
          if (fbError) throw fbError;
          return res.status(200).json(fallbackData || []);
        }
        return res.status(200).json(data || []);
      }

      // Query chi tiết
      let query = supabase
        .from('lens_order')
        .select('*, HangTrong(ten_hang, loai_trong), DonKinh(id, BenhNhan(ten)), NhaCungCap(ten)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (trang_thai) query = query.eq('trang_thai', trang_thai);
      else query = query.in('trang_thai', ['cho_dat', 'da_dat']);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // PUT: Cập nhật trạng thái (đánh dấu đã đặt / đã nhận)
    if (req.method === 'PUT') {
      const { id, ids, trang_thai, nha_cung_cap_id, ghi_chu } = req.body;

      if (!trang_thai || !['da_dat', 'da_nhan', 'huy'].includes(trang_thai)) {
        return res.status(400).json({ error: 'trang_thai không hợp lệ' });
      }

      const updateData: any = {
        trang_thai,
        updated_at: new Date().toISOString(),
      };
      if (trang_thai === 'da_dat') {
        updateData.ngay_dat = new Date().toISOString();
        if (nha_cung_cap_id) updateData.nha_cung_cap_id = parseInt(nha_cung_cap_id);
      }
      if (trang_thai === 'da_nhan') {
        updateData.ngay_nhan = new Date().toISOString();
      }
      if (ghi_chu) updateData.ghi_chu = ghi_chu;

      // Hỗ trợ cập nhật hàng loạt
      const targetIds = ids || [id];
      const { data, error } = await supabase
        .from('lens_order')
        .update(updateData)
        .in('id', targetIds)
        .eq('tenant_id', tenantId)
        .select();

      if (error) throw error;
      return res.status(200).json(data);
    }

    // DELETE: Xóa lens order (chỉ khi cho_dat)
    if (req.method === 'DELETE') {
      const { id } = req.query;

      const { error } = await supabase
        .from('lens_order')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .eq('trang_thai', 'cho_dat');

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('lens-order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
