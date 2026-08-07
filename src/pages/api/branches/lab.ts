// API: Lab / gia công trung tâm cho đơn kính
// GET ?status=&branch_id=  → danh sách đơn theo lab_status
// POST { don_kinh_id, action, lab_branch_id?, note? }
//   action: send | start | ready | deliver | cancel
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

const LAB_FLOW: Record<string, string> = {
  send: 'cho_gia_cong',
  start: 'dang_cat',
  ready: 'san_sang',
  deliver: 'da_giao',
  cancel: '',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch'))) return;
  const { tenantId, branchId } = ctx;

  try {
    if (req.method === 'GET') {
      const { status, lab_branch_id, store_branch_id } = req.query;
      let query = supabase
        .from('DonKinh')
        .select(`
          id, ngay_kham, benhnhanid, sph_mp, cyl_mp, sph_mt, cyl_mt, gong,
          lab_status, lab_branch_id, lab_sent_at, lab_ready_at, lab_delivered_at, lab_note,
          branch_id,
          branch:branches!DonKinh_branch_id_fkey(id, ten_chi_nhanh),
          BenhNhan:benhnhanid(id, ten, mabenhnhan, dienthoai)
        `)
        .eq('tenant_id', tenantId)
        .not('lab_status', 'is', null)
        .order('lab_sent_at', { ascending: false })
        .limit(200);

      if (status) query = query.eq('lab_status', status as string);
      if (lab_branch_id) query = query.eq('lab_branch_id', lab_branch_id as string);
      if (store_branch_id) query = query.eq('branch_id', store_branch_id as string);

      const { data, error } = await query;
      if (error) {
        // Fallback if FK name differs
        if (error.message?.includes('DonKinh_branch_id_fkey') || error.code === 'PGRST200') {
          const fallback = await supabase
            .from('DonKinh')
            .select('id, ngay_kham, benhnhanid, sph_mp, cyl_mp, sph_mt, cyl_mt, gong, lab_status, lab_branch_id, lab_sent_at, lab_ready_at, lab_delivered_at, lab_note, branch_id')
            .eq('tenant_id', tenantId)
            .not('lab_status', 'is', null)
            .order('created_at', { ascending: false })
            .limit(200);
          if (fallback.error) throw fallback.error;
          return res.status(200).json(fallback.data || []);
        }
        throw error;
      }
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { don_kinh_id, action, lab_branch_id, note } = req.body || {};
      if (!don_kinh_id || !action || !LAB_FLOW[action] && action !== 'cancel') {
        return res.status(400).json({ error: 'Thiếu don_kinh_id hoặc action không hợp lệ' });
      }

      const { data: don, error: donErr } = await supabase
        .from('DonKinh')
        .select('id, branch_id, lab_status')
        .eq('id', don_kinh_id)
        .eq('tenant_id', tenantId)
        .single();

      if (donErr || !don) return res.status(404).json({ error: 'Không tìm thấy đơn kính' });

      const now = new Date().toISOString();
      const update: any = { lab_note: note?.trim() || null };

      if (action === 'cancel') {
        update.lab_status = null;
        update.lab_branch_id = null;
        update.lab_sent_at = null;
        update.lab_ready_at = null;
        update.lab_delivered_at = null;
      } else {
        update.lab_status = LAB_FLOW[action];
        if (action === 'send') {
          // Lab mặc định = chi nhánh chính hoặc lab_branch_id chỉ định
          let labId = lab_branch_id || null;
          if (!labId) {
            const { data: main } = await supabase
              .from('branches')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('is_main', true)
              .eq('status', 'active')
              .maybeSingle();
            labId = main?.id || branchId || don.branch_id;
          }
          update.lab_branch_id = labId;
          update.lab_sent_at = now;
        }
        if (action === 'ready') update.lab_ready_at = now;
        if (action === 'deliver') update.lab_delivered_at = now;
      }

      const { data, error } = await supabase
        .from('DonKinh')
        .update(update)
        .eq('id', don_kinh_id)
        .eq('tenant_id', tenantId)
        .select('id, lab_status, lab_branch_id, lab_sent_at, lab_ready_at, lab_delivered_at, lab_note')
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('lab API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
