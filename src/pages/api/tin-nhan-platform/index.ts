/**
 * API tin nhắn phòng khám ↔ superadmin.
 * 
 * Phòng khám (có tenant context):
 *   GET  — lấy tin nhắn platform của tenant
 *   POST — gửi tin nhắn cho superadmin
 *   PATCH — đánh dấu đã đọc (tenant side)
 * 
 * Superadmin (không cần tenant context):
 *   GET  ?mode=inbox — danh sách tenant có tin nhắn
 *   GET  ?mode=thread&tenant_id=xxx — tin nhắn với 1 tenant
 *   POST ?mode=reply — trả lời cho 1 tenant
 *   PATCH ?mode=admin_read — đánh dấu đã đọc (admin side)
 */
import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

// Helpers
function getBearer(req: NextApiRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const parts = (Array.isArray(h) ? h[0] : h).split(' ');
  return parts.length >= 2 && parts[0].toLowerCase() === 'bearer'
    ? parts.slice(1).join(' ').trim() || null
    : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authenticateUser(req: NextApiRequest, res: NextApiResponse) {
  const token = getBearer(req);
  if (!token) { res.status(401).json({ message: 'Unauthorized' }); return null; }
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) { res.status(401).json({ message: 'Token không hợp lệ' }); return null; }
  return userData.user;
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role === 'superadmin';
}

async function getTenantId(req: NextApiRequest, userId: string): Promise<string | null> {
  // From header
  const h = req.headers['x-tenant-id'];
  const val = Array.isArray(h) ? h[0] : h;
  if (val?.trim() && UUID_RE.test(val.trim())) return val.trim();
  // From query
  if (typeof req.query.tenant_id === 'string' && UUID_RE.test(req.query.tenant_id.trim())) {
    return req.query.tenant_id.trim();
  }
  return null;
}

async function getTenantMemberRole(userId: string, tenantId: string): Promise<string | null> {
  const { data } = await supabase
    .from('tenantmembership')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .maybeSingle();
  return data?.role || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const user = await authenticateUser(req, res);
  if (!user) return;

  const userId = user.id;
  const mode = (req.query.mode as string) || '';
  const isAdmin = await isSuperAdmin(userId);

  try {
    // ==================== SUPERADMIN ROUTES ====================
    if (isAdmin && (mode === 'inbox' || mode === 'thread' || mode === 'reply' || mode === 'admin_read')) {

      // GET ?mode=inbox — danh sách tenant có tin nhắn + đếm chưa đọc
      if (req.method === 'GET' && mode === 'inbox') {
        // Lấy tất cả tenant có tin nhắn platform (chưa bị admin xóa), grouped + counted
        const { data: threads, error } = await supabase
          .from('tin_nhan_platform')
          .select('tenant_id, da_doc_admin, created_at')
          .eq('deleted_by_admin', false)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Group by tenant_id
        const tenantMap = new Map<string, { unreadCount: number; lastMessageAt: string }>();
        for (const row of (threads || [])) {
          const existing = tenantMap.get(row.tenant_id);
          if (!existing) {
            tenantMap.set(row.tenant_id, {
              unreadCount: row.da_doc_admin ? 0 : 1,
              lastMessageAt: row.created_at,
            });
          } else {
            if (!row.da_doc_admin) existing.unreadCount++;
          }
        }

        // Lấy thông tin tenant
        const tenantIds = [...tenantMap.keys()];
        let tenantInfoMap: Record<string, { name: string; code: string | null }> = {};
        if (tenantIds.length > 0) {
          const { data: tenants } = await supabase
            .from('tenants')
            .select('id, name, code')
            .in('id', tenantIds);
          for (const t of (tenants || [])) {
            tenantInfoMap[t.id] = { name: t.name, code: t.code };
          }
        }

        const inbox = tenantIds.map(tid => ({
          tenant_id: tid,
          tenant_name: tenantInfoMap[tid]?.name || 'Unknown',
          tenant_code: tenantInfoMap[tid]?.code || null,
          unread_count: tenantMap.get(tid)!.unreadCount,
          last_message_at: tenantMap.get(tid)!.lastMessageAt,
        })).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

        const totalUnread = inbox.reduce((sum, t) => sum + t.unread_count, 0);
        return res.status(200).json({ data: inbox, totalUnread });
      }

      // GET ?mode=thread&tenant_id=xxx — tin nhắn với 1 tenant
      if (req.method === 'GET' && mode === 'thread') {
        const tenantId = req.query.tenant_id as string;
        if (!tenantId || !UUID_RE.test(tenantId)) {
          return res.status(400).json({ message: 'Thiếu hoặc sai tenant_id' });
        }

        const limit = Math.min(Number(req.query.limit) || 30, 50);
        let query = supabase
          .from('tin_nhan_platform')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('deleted_by_admin', false)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (req.query.before_id) {
          query = query.lt('id', Number(req.query.before_id));
        }

        const { data, error } = await query;
        if (error) throw error;

        // Resolve sender names
        const senderIds = [...new Set((data || []).map(m => m.sender_id))];
        const senderMap: Record<string, string> = {};
        for (const sid of senderIds) {
          const { data: u } = await supabase.auth.admin.getUserById(sid);
          if (u?.user?.email) {
            senderMap[sid] = u.user.email.split('@')[0] || 'User';
          }
        }

        const messages = (data || []).reverse().map(m => ({
          ...m,
          sender_name: m.sender_role === 'superadmin'
            ? `${senderMap[m.sender_id] || 'Admin'} (Superadmin)`
            : senderMap[m.sender_id] || 'User',
        }));

        return res.status(200).json({ data: messages });
      }

      // POST ?mode=reply — superadmin trả lời cho 1 tenant
      if (req.method === 'POST' && mode === 'reply') {
        const { tenant_id, noi_dung } = req.body;
        if (!tenant_id || !UUID_RE.test(tenant_id)) {
          return res.status(400).json({ message: 'Thiếu tenant_id' });
        }
        if (!noi_dung?.trim()) {
          return res.status(400).json({ message: 'Nội dung là bắt buộc' });
        }
        if (noi_dung.trim().length > 2000) {
          return res.status(400).json({ message: 'Tối đa 2000 ký tự' });
        }

        const { data, error } = await supabase
          .from('tin_nhan_platform')
          .insert([{
            tenant_id,
            sender_id: userId,
            sender_role: 'superadmin',
            noi_dung: noi_dung.trim(),
            da_doc_admin: true,     // admin tự gửi thì đánh dấu đã đọc
            da_doc_tenant: false,
          }])
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ data });
      }

      // PATCH ?mode=admin_read — superadmin đánh dấu đã đọc tin của 1 tenant
      if (req.method === 'PATCH' && mode === 'admin_read') {
        const { tenant_id } = req.body;
        if (!tenant_id || !UUID_RE.test(tenant_id)) {
          return res.status(400).json({ message: 'Thiếu tenant_id' });
        }

        const { error } = await supabase
          .from('tin_nhan_platform')
          .update({ da_doc_admin: true })
          .eq('tenant_id', tenant_id)
          .eq('da_doc_admin', false);

        if (error) throw error;
        return res.status(200).json({ message: 'OK' });
      }
    }

    // ==================== TENANT (PHÒNG KHÁM) ROUTES ====================
    const tenantId = await getTenantId(req, userId);

    if (!tenantId) {
      return res.status(400).json({ message: 'Thiếu x-tenant-id' });
    }
    const memberRole = await getTenantMemberRole(userId, tenantId);
    if (!memberRole) {
      return res.status(403).json({ message: 'Không có quyền truy cập phòng khám này' });
    }
    // Chỉ chủ phòng khám (owner) mới được dùng tính năng nhắn tin hỗ trợ nền tảng
    if (memberRole !== 'owner') {
      return res.status(403).json({ message: 'Chỉ chủ phòng khám mới có thể nhắn tin với hỗ trợ nền tảng' });
    }

    // GET — lấy tin nhắn platform của tenant
    if (req.method === 'GET') {
      const limit = Math.min(Number(req.query.limit) || 30, 50);
      let query = supabase
        .from('tin_nhan_platform')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('deleted_by_tenant', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (req.query.before_id) {
        query = query.lt('id', Number(req.query.before_id));
      }

      const { data, error } = await query;
      if (error) throw error;

      // Count unread (tin từ superadmin mà tenant chưa đọc)
      const { count: unreadCount } = await supabase
        .from('tin_nhan_platform')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('sender_role', 'superadmin')
        .eq('da_doc_tenant', false)
        .eq('deleted_by_tenant', false);

      // Resolve sender names
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      const senderMap: Record<string, string> = {};
      for (const sid of senderIds) {
        const { data: u } = await supabase.auth.admin.getUserById(sid);
        if (u?.user?.email) {
          senderMap[sid] = u.user.email.split('@')[0] || 'User';
        }
      }

      const messages = (data || []).reverse().map(m => ({
        ...m,
        sender_name: m.sender_role === 'superadmin'
          ? `${senderMap[m.sender_id] || 'Admin'} (Hỗ trợ)`
          : senderMap[m.sender_id] || 'User',
      }));

      return res.status(200).json({ data: messages, unreadCount: unreadCount || 0 });
    }

    // POST — phòng khám gửi tin nhắn cho superadmin
    if (req.method === 'POST') {
      const { noi_dung } = req.body;
      if (!noi_dung?.trim()) {
        return res.status(400).json({ message: 'Nội dung là bắt buộc' });
      }
      if (noi_dung.trim().length > 2000) {
        return res.status(400).json({ message: 'Tối đa 2000 ký tự' });
      }

      const { data, error } = await supabase
        .from('tin_nhan_platform')
        .insert([{
          tenant_id: tenantId,
          sender_id: userId,
          sender_role: 'tenant',
          noi_dung: noi_dung.trim(),
          da_doc_tenant: true,     // tenant tự gửi → đã đọc
          da_doc_admin: false,
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ data });
    }

    // PATCH — phòng khám đánh dấu đã đọc tin từ superadmin
    if (req.method === 'PATCH') {
      const { error } = await supabase
        .from('tin_nhan_platform')
        .update({ da_doc_tenant: true })
        .eq('tenant_id', tenantId)
        .eq('sender_role', 'superadmin')
        .eq('da_doc_tenant', false);

      if (error) throw error;
      return res.status(200).json({ message: 'OK' });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: 'Lỗi server', details: message });
  }
}
