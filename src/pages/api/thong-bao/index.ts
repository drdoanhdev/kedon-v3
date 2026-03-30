import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId, userId, isOwner } = ctx;

  try {
    // GET: Lấy thông báo (cá nhân + broadcast)
    if (req.method === 'GET') {
      const { unread_only, limit: rawLimit, offset: rawOffset } = req.query;
      const limit = Math.min(Number(rawLimit) || 20, 50);
      const offset = Number(rawOffset) || 0;

      // Count unread (nhẹ, dùng partial index)
      const { count: unreadCount } = await supabase
        .from('thong_bao')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .or(`user_id.eq.${userId},user_id.is.null`)
        .eq('da_doc', false);

      // Fetch list
      let query = supabase
        .from('thong_bao')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(`user_id.eq.${userId},user_id.is.null`)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (unread_only === 'true') {
        query = query.eq('da_doc', false);
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json({ data, unreadCount: unreadCount || 0 });
    }

    // POST: Tạo thông báo (chỉ owner/admin)
    if (req.method === 'POST') {
      if (!isOwner) {
        return res.status(403).json({ message: 'Chỉ quản trị viên mới có quyền tạo thông báo' });
      }

      const { tieu_de, noi_dung, loai, user_id: targetUserId } = req.body;

      if (!tieu_de?.trim() || !noi_dung?.trim()) {
        return res.status(400).json({ message: 'Tiêu đề và nội dung là bắt buộc' });
      }

      const validLoai = ['system', 'admin', 'reminder', 'warning'];
      const finalLoai = validLoai.includes(loai) ? loai : 'admin';

      const { data, error } = await supabase
        .from('thong_bao')
        .insert([{
          tenant_id: tenantId,
          user_id: targetUserId || null, // null = broadcast
          tieu_de: tieu_de.trim(),
          noi_dung: noi_dung.trim(),
          loai: finalLoai,
          created_by: userId,
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ data });
    }

    // PATCH: Đánh dấu đã đọc
    if (req.method === 'PATCH') {
      const { id, mark_all_read } = req.body;

      if (mark_all_read) {
        // Đánh dấu tất cả đã đọc
        const { error } = await supabase
          .from('thong_bao')
          .update({ da_doc: true })
          .eq('tenant_id', tenantId)
          .or(`user_id.eq.${userId},user_id.is.null`)
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
        .eq('tenant_id', tenantId)
        .or(`user_id.eq.${userId},user_id.is.null`);

      if (error) throw error;
      return res.status(200).json({ message: 'Đã đánh dấu đã đọc' });
    }

    // DELETE: Xóa thông báo (chỉ owner/admin)
    if (req.method === 'DELETE') {
      if (!isOwner) {
        return res.status(403).json({ message: 'Chỉ quản trị viên mới có quyền xóa thông báo' });
      }

      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ message: 'Thiếu ID thông báo' });
      }

      const { error } = await supabase
        .from('thong_bao')
        .delete()
        .eq('id', Number(id))
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return res.status(200).json({ message: 'Đã xóa thông báo' });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: 'Lỗi server', details: message });
  }
}
