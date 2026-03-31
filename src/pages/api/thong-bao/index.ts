import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';
import { requireSuperAdmin } from '../../../lib/adminGuard';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // POST & DELETE: chỉ superadmin (cross-tenant)
  if (req.method === 'POST' || req.method === 'DELETE') {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return; // đã trả 401/403

    try {
      if (req.method === 'POST') {
        const { tieu_de, noi_dung, loai } = req.body;

        if (!tieu_de?.trim() || !noi_dung?.trim()) {
          return res.status(400).json({ message: 'Tiêu đề và nội dung là bắt buộc' });
        }

        const validLoai = ['system', 'admin', 'reminder', 'warning'];
        const finalLoai = validLoai.includes(loai) ? loai : 'system';

        // Broadcast: tenant_id = null, user_id = null → tất cả user/tenant đều thấy
        const { data, error } = await supabase
          .from('thong_bao')
          .insert([{
            tenant_id: null,
            user_id: null,
            tieu_de: tieu_de.trim(),
            noi_dung: noi_dung.trim(),
            loai: finalLoai,
            created_by: admin.userId,
          }])
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ data });
      }

      // DELETE
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ message: 'Thiếu ID thông báo' });
      }

      const { error } = await supabase
        .from('thong_bao')
        .delete()
        .eq('id', Number(id));

      if (error) throw error;
      return res.status(200).json({ message: 'Đã xóa thông báo' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: 'Lỗi server', details: message });
    }
  }

  // GET & PATCH: user bình thường (cần tenant context)
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId, userId } = ctx;

  try {
    // GET: Lấy thông báo (tenant + global broadcast)
    if (req.method === 'GET') {
      const { unread_only, limit: rawLimit, offset: rawOffset } = req.query;
      const limit = Math.min(Number(rawLimit) || 20, 50);
      const offset = Number(rawOffset) || 0;

      // Thông báo thuộc tenant hoặc broadcast (tenant_id IS NULL)
      const tenantFilter = `tenant_id.eq.${tenantId},tenant_id.is.null`;
      const userFilter = `user_id.eq.${userId},user_id.is.null`;

      // Count unread
      const { count: unreadCount } = await supabase
        .from('thong_bao')
        .select('id', { count: 'exact', head: true })
        .or(tenantFilter)
        .or(userFilter)
        .eq('da_doc', false);

      // Fetch list
      let query = supabase
        .from('thong_bao')
        .select('*')
        .or(tenantFilter)
        .or(userFilter)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (unread_only === 'true') {
        query = query.eq('da_doc', false);
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json({ data, unreadCount: unreadCount || 0 });
    }

    // PATCH: Đánh dấu đã đọc
    if (req.method === 'PATCH') {
      const { id, mark_all_read } = req.body;
      const tenantFilter = `tenant_id.eq.${tenantId},tenant_id.is.null`;
      const userFilter = `user_id.eq.${userId},user_id.is.null`;

      if (mark_all_read) {
        const { error } = await supabase
          .from('thong_bao')
          .update({ da_doc: true })
          .or(tenantFilter)
          .or(userFilter)
          .eq('da_doc', false);

        if (error) throw error;
        return res.status(200).json({ message: 'Đã đánh dấu tất cả đã đọc' });
      }

      if (!id) {
        return res.status(400).json({ message: 'Thiếu ID thông báo' });
      }

      const { error } = await supabase
        .from('thong_bao')
        .update({ da_doc: true })
        .eq('id', Number(id))
        .or(tenantFilter)
        .or(userFilter);

      if (error) throw error;
      return res.status(200).json({ message: 'Đã đánh dấu đã đọc' });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: 'Lỗi server', details: message });
  }
}
