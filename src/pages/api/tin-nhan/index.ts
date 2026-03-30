import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId, userId, isOwner, role } = ctx;

  try {
    // GET: Lấy tin nhắn trong tenant
    if (req.method === 'GET') {
      const { limit: rawLimit, before_id } = req.query;
      const limit = Math.min(Number(rawLimit) || 30, 50);

      // Lấy tin nhắn + thông tin sender
      let query = supabase
        .from('tin_nhan')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (before_id) {
        query = query.lt('id', Number(before_id));
      }

      const { data, error } = await query;
      if (error) throw error;

      // Đếm tin chưa đọc (cho user hiện tại)
      // User thường: đếm tin từ admin chưa đọc
      // Admin: đếm tin từ user chưa đọc
      const { count: unreadCount } = await supabase
        .from('tin_nhan')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_from_admin', !isOwner) // user đếm tin admin, admin đếm tin user
        .eq('da_doc', false);

      // Lấy email mapping cho sender_ids
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      let senderMap: Record<string, string> = {};

      if (senderIds.length > 0) {
        // Lấy email từ tenantmembership + auth
        const { data: members } = await supabase
          .from('tenantmembership')
          .select('user_id, role')
          .eq('tenant_id', tenantId)
          .in('user_id', senderIds);

        // Lấy email từ user_profiles hoặc auth.users
        for (const sid of senderIds) {
          const { data: userData } = await supabase.auth.admin.getUserById(sid);
          if (userData?.user?.email) {
            const memberInfo = members?.find(m => m.user_id === sid);
            const roleLabel = memberInfo?.role === 'owner' ? ' (Chủ PK)' : memberInfo?.role === 'admin' ? ' (Admin)' : '';
            senderMap[sid] = (userData.user.email.split('@')[0] || 'User') + roleLabel;
          }
        }
      }

      // Reverse để hiển thị từ cũ → mới
      const messages = (data || []).reverse().map(m => ({
        ...m,
        sender_name: senderMap[m.sender_id] || 'Unknown',
      }));

      return res.status(200).json({ data: messages, unreadCount: unreadCount || 0 });
    }

    // POST: Gửi tin nhắn
    if (req.method === 'POST') {
      const { noi_dung } = req.body;

      if (!noi_dung?.trim()) {
        return res.status(400).json({ message: 'Nội dung tin nhắn là bắt buộc' });
      }

      if (noi_dung.trim().length > 2000) {
        return res.status(400).json({ message: 'Tin nhắn tối đa 2000 ký tự' });
      }

      const { data, error } = await supabase
        .from('tin_nhan')
        .insert([{
          tenant_id: tenantId,
          sender_id: userId,
          noi_dung: noi_dung.trim(),
          is_from_admin: isOwner, // owner/admin gửi = true
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ data });
    }

    // PATCH: Đánh dấu đã đọc
    if (req.method === 'PATCH') {
      const { mark_all_read } = req.body;

      if (mark_all_read) {
        // User đánh dấu đã đọc tin từ admin, admin đánh dấu đã đọc tin từ user
        const { error } = await supabase
          .from('tin_nhan')
          .update({ da_doc: true })
          .eq('tenant_id', tenantId)
          .eq('is_from_admin', !isOwner)
          .eq('da_doc', false);

        if (error) throw error;
        return res.status(200).json({ message: 'Đã đánh dấu tất cả đã đọc' });
      }

      return res.status(400).json({ message: 'Thiếu tham số' });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: 'Lỗi server', details: message });
  }
}
