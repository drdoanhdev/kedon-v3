import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

const VALID_LOAI = ['general', 'policy', 'training', 'inventory', 'other'];
const VALID_UU_TIEN = ['low', 'normal', 'high', 'urgent'];
const VALID_TRANG_THAI = ['chua_lam', 'dang_lam', 'hoan_thanh', 'da_huy'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId, userId, role } = ctx;
  const isAdminOrOwner = role === 'owner' || role === 'admin';

  // ── GET ───────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { trang_thai, assigned_to_me, branch_id } = req.query;

    let query = supabase
      .from('nhac_viec')
      .select(`
        id, tieu_de, mo_ta, loai, do_uu_tien, trang_thai,
        assigned_to, created_by, han_chot, hoan_thanh_luc, created_at, updated_at, branch_id
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (trang_thai && VALID_TRANG_THAI.includes(String(trang_thai))) {
      query = query.eq('trang_thai', trang_thai);
    }
    if (assigned_to_me === 'true') {
      query = query.or(`assigned_to.eq.${userId},assigned_to.is.null`);
    }
    if (branch_id) {
      query = query.or(`branch_id.eq.${branch_id},branch_id.is.null`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ message: 'Lỗi tải danh sách', details: error.message });
    return res.status(200).json({ data: data || [] });
  }

  // ── POST ──────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { tieu_de, mo_ta, loai, do_uu_tien, assigned_to, han_chot, branch_id } = req.body;

    if (!tieu_de?.trim()) {
      return res.status(400).json({ message: 'Tiêu đề là bắt buộc' });
    }

    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      tieu_de: tieu_de.trim(),
      mo_ta: mo_ta?.trim() || null,
      loai: VALID_LOAI.includes(loai) ? loai : 'general',
      do_uu_tien: VALID_UU_TIEN.includes(do_uu_tien) ? do_uu_tien : 'normal',
      trang_thai: 'chua_lam',
      assigned_to: assigned_to || null,
      created_by: userId,
      han_chot: han_chot || null,
      branch_id: branch_id || null,
    };

    const { data, error } = await supabase
      .from('nhac_viec')
      .insert([payload])
      .select()
      .single();

    if (error) return res.status(500).json({ message: 'Lỗi tạo nhắc việc', details: error.message });

    // Tự động push thông báo nếu giao cho người cụ thể
    if (assigned_to && assigned_to !== userId) {
      await supabase.from('thong_bao').insert([{
        tenant_id: tenantId,
        user_id: assigned_to,
        tieu_de: `Nhắc việc mới: ${tieu_de.trim()}`,
        noi_dung: mo_ta?.trim() || 'Bạn được giao một công việc mới.',
        loai: 'reminder',
        created_by: userId,
      }]).select().maybeSingle();
    }

    return res.status(200).json({ data });
  }

  // ── PATCH ─────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id, trang_thai, tieu_de, mo_ta, loai, do_uu_tien, assigned_to, han_chot } = req.body;
    if (!id) return res.status(400).json({ message: 'Thiếu id' });

    // Kiểm tra record thuộc tenant
    const { data: existing, error: fetchErr } = await supabase
      .from('nhac_viec')
      .select('id, created_by, trang_thai')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ message: 'Không tìm thấy nhắc việc' });

    // Staff chỉ được cập nhật trang_thai (không được sửa nội dung người khác tạo)
    const canEdit = isAdminOrOwner || existing.created_by === userId;
    const canChangeStatus = true; // mọi staff đều có thể mark hoàn thành

    if (!canEdit && tieu_de !== undefined) {
      return res.status(403).json({ message: 'Không có quyền sửa nội dung việc này' });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (trang_thai !== undefined && VALID_TRANG_THAI.includes(trang_thai) && canChangeStatus) {
      updates.trang_thai = trang_thai;
      if (trang_thai === 'hoan_thanh') {
        updates.hoan_thanh_luc = new Date().toISOString();
      } else {
        updates.hoan_thanh_luc = null;
      }
    }
    if (canEdit) {
      if (tieu_de !== undefined) updates.tieu_de = tieu_de.trim();
      if (mo_ta !== undefined) updates.mo_ta = mo_ta?.trim() || null;
      if (loai !== undefined && VALID_LOAI.includes(loai)) updates.loai = loai;
      if (do_uu_tien !== undefined && VALID_UU_TIEN.includes(do_uu_tien)) updates.do_uu_tien = do_uu_tien;
      if (assigned_to !== undefined) updates.assigned_to = assigned_to || null;
      if (han_chot !== undefined) updates.han_chot = han_chot || null;
    }

    const { data, error } = await supabase
      .from('nhac_viec')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) return res.status(500).json({ message: 'Lỗi cập nhật', details: error.message });
    return res.status(200).json({ data });
  }

  // ── DELETE ────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ message: 'Thiếu id' });

    const { data: existing } = await supabase
      .from('nhac_viec')
      .select('id, created_by')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();

    if (!existing) return res.status(404).json({ message: 'Không tìm thấy nhắc việc' });
    if (!isAdminOrOwner && existing.created_by !== userId) {
      return res.status(403).json({ message: 'Không có quyền xóa việc này' });
    }

    const { error } = await supabase
      .from('nhac_viec')
      .delete()
      .eq('id', Number(id))
      .eq('tenant_id', tenantId);

    if (error) return res.status(500).json({ message: 'Lỗi xóa', details: error.message });
    return res.status(200).json({ message: 'Đã xóa' });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
