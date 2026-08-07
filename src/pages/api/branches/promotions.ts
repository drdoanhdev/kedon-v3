// API: Khuyến mãi / voucher theo chi nhánh
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch', 'manage_clinic'))) return;
  const { tenantId, userId, branchId } = ctx;

  try {
    if (req.method === 'GET') {
      const { branch_id, active_only } = req.query;
      let query = supabase
        .from('branch_promotions')
        .select('*, branch:branches(id, ten_chi_nhanh)')
        .eq('tenant_id', tenantId)
        .order('tu_ngay', { ascending: false });

      if (branch_id === 'chain') {
        query = query.is('branch_id', null);
      } else if (branch_id) {
        query = query.or(`branch_id.eq.${branch_id},branch_id.is.null`);
      } else if (branchId) {
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }
      if (active_only === '1') query = query.eq('is_active', true);

      const { data, error } = await query;
      if (error) {
        if (error.code === '42P01') return res.status(200).json([]);
        throw error;
      }
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const {
        ten_chuong_trinh,
        mo_ta,
        loai,
        gia_tri,
        ma_voucher,
        ap_dung_cho,
        tu_ngay,
        den_ngay,
        branch_id,
        is_active,
      } = req.body || {};

      if (!ten_chuong_trinh?.trim() || !tu_ngay || !den_ngay) {
        return res.status(400).json({ error: 'Thiếu tên chương trình hoặc thời gian' });
      }

      const { data, error } = await supabase
        .from('branch_promotions')
        .insert({
          tenant_id: tenantId,
          branch_id: branch_id || null,
          ten_chuong_trinh: ten_chuong_trinh.trim(),
          mo_ta: mo_ta?.trim() || null,
          loai: loai || 'percent',
          gia_tri: Number(gia_tri) || 0,
          ma_voucher: ma_voucher?.trim() || null,
          ap_dung_cho: ap_dung_cho || 'all',
          tu_ngay,
          den_ngay,
          is_active: is_active !== false,
          created_by: userId,
        })
        .select('*, branch:branches(id, ten_chi_nhanh)')
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Thiếu id' });
      const update: any = { updated_at: new Date().toISOString() };
      for (const key of [
        'ten_chuong_trinh',
        'mo_ta',
        'loai',
        'gia_tri',
        'ma_voucher',
        'ap_dung_cho',
        'tu_ngay',
        'den_ngay',
        'branch_id',
        'is_active',
      ]) {
        if (rest[key] !== undefined) update[key] = rest[key];
      }
      const { data, error } = await supabase
        .from('branch_promotions')
        .update(update)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*, branch:branches(id, ten_chi_nhanh)')
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Thiếu id' });
      const { error } = await supabase
        .from('branch_promotions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('promotions API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
