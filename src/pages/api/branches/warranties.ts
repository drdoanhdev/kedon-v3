// API: Bảo hành / đổi trả liên chi nhánh
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch'))) return;
  const { tenantId, userId, branchId } = ctx;

  try {
    if (req.method === 'GET') {
      const { benhnhan_id, trang_thai } = req.query;
      let query = supabase
        .from('branch_warranties')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (benhnhan_id) query = query.eq('benhnhan_id', Number(benhnhan_id));
      if (trang_thai) query = query.eq('trang_thai', trang_thai as string);

      const { data, error } = await query;
      if (error) {
        if (error.code === '42P01') return res.status(200).json([]);
        throw error;
      }

      const branchIds = new Set<string>();
      const patientIds = new Set<number>();
      for (const w of data || []) {
        if (w.sale_branch_id) branchIds.add(w.sale_branch_id);
        if (w.service_branch_id) branchIds.add(w.service_branch_id);
        patientIds.add(w.benhnhan_id);
      }

      const [brRes, bnRes] = await Promise.all([
        branchIds.size
          ? supabase.from('branches').select('id, ten_chi_nhanh').in('id', [...branchIds])
          : Promise.resolve({ data: [] as any[] }),
        patientIds.size
          ? supabase.from('BenhNhan').select('id, ten, mabenhnhan').eq('tenant_id', tenantId).in('id', [...patientIds])
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const brMap = new Map((brRes.data || []).map((b: any) => [b.id, b.ten_chi_nhanh]));
      const bnMap = new Map((bnRes.data || []).map((b: any) => [b.id, b]));

      return res.status(200).json(
        (data || []).map((w: any) => ({
          ...w,
          sale_branch: w.sale_branch_id ? brMap.get(w.sale_branch_id) : null,
          service_branch: w.service_branch_id ? brMap.get(w.service_branch_id) : null,
          patient: bnMap.get(w.benhnhan_id) || null,
        }))
      );
    }

    if (req.method === 'POST') {
      const {
        benhnhan_id,
        don_kinh_id,
        sale_branch_id,
        service_branch_id,
        loai,
        ly_do,
        chi_phi,
      } = req.body || {};

      if (!benhnhan_id) return res.status(400).json({ error: 'Thiếu benhnhan_id' });

      let saleBranch = sale_branch_id || null;
      if (!saleBranch && don_kinh_id) {
        const { data: don } = await supabase
          .from('DonKinh')
          .select('branch_id')
          .eq('id', don_kinh_id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        saleBranch = don?.branch_id || null;
      }

      const { data, error } = await supabase
        .from('branch_warranties')
        .insert({
          tenant_id: tenantId,
          benhnhan_id: Number(benhnhan_id),
          don_kinh_id: don_kinh_id ? Number(don_kinh_id) : null,
          sale_branch_id: saleBranch,
          service_branch_id: service_branch_id || branchId || null,
          loai: loai || 'bao_hanh',
          ly_do: ly_do?.trim() || null,
          chi_phi: Number(chi_phi) || 0,
          trang_thai: 'tiep_nhan',
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, trang_thai, ly_do, chi_phi } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Thiếu id' });
      const update: any = { updated_at: new Date().toISOString() };
      if (trang_thai) {
        update.trang_thai = trang_thai;
        if (trang_thai === 'hoan_tat') update.completed_at = new Date().toISOString();
      }
      if (ly_do !== undefined) update.ly_do = ly_do;
      if (chi_phi !== undefined) update.chi_phi = Number(chi_phi) || 0;

      const { data, error } = await supabase
        .from('branch_warranties')
        .update(update)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('warranties API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
