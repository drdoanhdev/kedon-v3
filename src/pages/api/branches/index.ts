// API: Quản lý chi nhánh (branches)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch', 'manage_clinic'))) return;
  const { tenantId } = ctx;

  try {
    // GET: Lấy danh sách chi nhánh
    if (req.method === 'GET') {
      const { status } = req.query;
      let query = supabase
        .from('branches')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('is_main', { ascending: false })
        .order('created_at');

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Tạo chi nhánh mới
    if (req.method === 'POST') {
      const { ten_chi_nhanh, dia_chi, dien_thoai } = req.body;
      if (!ten_chi_nhanh?.trim()) {
        return res.status(400).json({ error: 'Tên chi nhánh là bắt buộc' });
      }

      // Kiểm tra đã có branch chính chưa, nếu chưa thì tạo mặc định trước
      const { data: existing } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(1);

      if (!existing || existing.length === 0) {
        // Tạo branch chính bằng function
        await supabase.rpc('create_default_branch_for_tenant', { p_tenant_id: tenantId });
      }

      const { data, error } = await supabase
        .from('branches')
        .insert({
          tenant_id: tenantId,
          ten_chi_nhanh: ten_chi_nhanh.trim(),
          dia_chi: dia_chi?.trim() || null,
          dien_thoai: dien_thoai?.trim() || null,
          is_main: false,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    // PUT: Cập nhật chi nhánh
    if (req.method === 'PUT') {
      const { id, ten_chi_nhanh, dia_chi, dien_thoai, status: branchStatus } = req.body;
      if (!id) return res.status(400).json({ error: 'Thiếu id' });

      const updateData: any = {};
      if (ten_chi_nhanh !== undefined) updateData.ten_chi_nhanh = ten_chi_nhanh.trim();
      if (dia_chi !== undefined) updateData.dia_chi = dia_chi?.trim() || null;
      if (dien_thoai !== undefined) updateData.dien_thoai = dien_thoai?.trim() || null;
      if (branchStatus !== undefined) {
        // Không cho tắt chi nhánh chính
        const { data: branch } = await supabase
          .from('branches')
          .select('is_main')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .single();
        if (branch?.is_main && branchStatus === 'inactive') {
          return res.status(400).json({ error: 'Không thể vô hiệu hóa chi nhánh chính' });
        }
        updateData.status = branchStatus;
      }

      const { data, error } = await supabase
        .from('branches')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    // DELETE: Xóa chi nhánh (chỉ nếu không có dữ liệu)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Thiếu id' });

      // Kiểm tra chi nhánh chính
      const { data: branch } = await supabase
        .from('branches')
        .select('is_main')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (branch?.is_main) {
        return res.status(400).json({ error: 'Không thể xóa chi nhánh chính' });
      }

      // Kiểm tra còn dữ liệu không
      const checks = ['BenhNhan', 'DonThuoc', 'DonKinh'];
      for (const table of checks) {
        const { count } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', id)
          .eq('tenant_id', tenantId);
        if (count && count > 0) {
          return res.status(400).json({
            error: `Chi nhánh còn dữ liệu trong ${table}. Hãy chuyển dữ liệu trước khi xóa.`
          });
        }
      }

      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('branches API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
