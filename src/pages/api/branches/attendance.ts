// API: Chấm công nhân viên theo chi nhánh
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'staff_attendance'))) return;
  const { tenantId, userId, branchId, role } = ctx;

  try {
    if (req.method === 'GET') {
      const { from, to, branch_id, user_id } = req.query;
      const fromDate = from
        ? new Date(from as string).toISOString()
        : new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const toDate = to
        ? new Date(to as string).toISOString()
        : new Date().toISOString();

      let query = supabase
        .from('staff_attendance')
        .select('*, branch:branches(id, ten_chi_nhanh)')
        .eq('tenant_id', tenantId)
        .gte('check_in_at', fromDate)
        .lte('check_in_at', toDate)
        .order('check_in_at', { ascending: false })
        .limit(500);

      if (branch_id) query = query.eq('branch_id', branch_id as string);
      if (user_id) query = query.eq('user_id', user_id as string);
      // Staff chỉ xem của mình trừ owner/admin
      if (role !== 'owner' && role !== 'admin') {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === '42P01') return res.status(200).json([]);
        throw error;
      }

      const userIds = [...new Set((data || []).map((d: any) => d.user_id))];
      const nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', userIds);
        for (const p of profiles || []) nameMap.set(p.id, p.full_name || p.id);
      }

      return res.status(200).json(
        (data || []).map((r: any) => ({
          ...r,
          full_name: nameMap.get(r.user_id) || r.user_id.slice(0, 8),
        }))
      );
    }

    if (req.method === 'POST') {
      const { action, branch_id: bodyBranchId, note, source } = req.body || {};
      const targetBranch = bodyBranchId || branchId;
      if (!targetBranch) {
        return res.status(400).json({ error: 'Chưa chọn chi nhánh để chấm công' });
      }

      if (action === 'check_in') {
        // Đóng phiên đang mở nếu có
        await supabase
          .from('staff_attendance')
          .update({ check_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
          .eq('user_id', userId)
          .is('check_out_at', null);

        const { data, error } = await supabase
          .from('staff_attendance')
          .insert({
            tenant_id: tenantId,
            user_id: userId,
            branch_id: targetBranch,
            source: source || 'manual',
            note: note?.trim() || null,
          })
          .select('*, branch:branches(id, ten_chi_nhanh)')
          .single();

        if (error) throw error;
        return res.status(201).json(data);
      }

      if (action === 'check_out') {
        const { data: open } = await supabase
          .from('staff_attendance')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('user_id', userId)
          .is('check_out_at', null)
          .order('check_in_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!open) return res.status(400).json({ error: 'Không có phiên chấm công đang mở' });

        const { data, error } = await supabase
          .from('staff_attendance')
          .update({
            check_out_at: new Date().toISOString(),
            note: note?.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', open.id)
          .select('*, branch:branches(id, ten_chi_nhanh)')
          .single();

        if (error) throw error;
        return res.status(200).json(data);
      }

      return res.status(400).json({ error: 'action phải là check_in hoặc check_out' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('attendance API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
