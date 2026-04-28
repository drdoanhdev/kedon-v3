// API: Chuyển khách hàng giữa chi nhánh + Tìm kiếm khách cross-branch
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch'))) return;
  const { tenantId, userId } = ctx;

  try {
    // GET: Tìm kiếm khách hàng cross-branch (nâng cao)
    if (req.method === 'GET') {
      const { search, branch_id, page = '1', limit = '50' } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(100, parseInt(limit as string));
      const offset = (pageNum - 1) * limitNum;

      let query = supabase
        .from('BenhNhan')
        .select(`
          id, ten, mabenhnhan, namsinh, dienthoai, diachi, gioitinh, ghichu, branch_id,
          branch:branches(id, ten_chi_nhanh)
        `, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('ten')
        .range(offset, offset + limitNum - 1);

      // Filter theo chi nhánh (nếu cần)
      if (branch_id) query = query.eq('branch_id', branch_id);

      // Tìm kiếm nâng cao: tên, SĐT, mã BN
      if (search) {
        const searchTerm = (search as string).trim();
        query = query.or(`ten.ilike.%${searchTerm}%,dienthoai.ilike.%${searchTerm}%,mabenhnhan.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // Thêm thông tin tổng đơn & doanh thu cho mỗi bệnh nhân
      const enrichedData = await Promise.all((data || []).map(async (bn: any) => {
        const [donThuocRes, donKinhRes] = await Promise.all([
          supabase
            .from('DonThuoc')
            .select('id, tongtien, branch_id', { count: 'exact' })
            .eq('benhnhanid', bn.id)
            .eq('tenant_id', tenantId),
          supabase
            .from('DonKinh')
            .select('id, branch_id', { count: 'exact' })
            .eq('benhnhanid', bn.id)
            .eq('tenant_id', tenantId),
        ]);

        return {
          ...bn,
          tong_don_thuoc: donThuocRes.count || 0,
          tong_don_kinh: donKinhRes.count || 0,
        };
      }));

      return res.status(200).json({
        data: enrichedData,
        total: count || 0,
        page: pageNum,
        limit: limitNum,
      });
    }

    // POST: Chuyển khách hàng sang chi nhánh khác
    if (req.method === 'POST') {
      const { benhnhan_id, to_branch_id, ly_do } = req.body;

      if (!benhnhan_id || !to_branch_id) {
        return res.status(400).json({ error: 'Thiếu benhnhan_id và to_branch_id' });
      }

      // Lấy thông tin BN hiện tại
      const { data: bn } = await supabase
        .from('BenhNhan')
        .select('id, branch_id, ten')
        .eq('id', benhnhan_id)
        .eq('tenant_id', tenantId)
        .single();

      if (!bn) return res.status(404).json({ error: 'Không tìm thấy bệnh nhân' });

      const fromBranchId = bn.branch_id;

      if (fromBranchId === to_branch_id) {
        return res.status(400).json({ error: 'Bệnh nhân đã ở chi nhánh này' });
      }

      // Kiểm tra chi nhánh đích thuộc tenant
      const { data: destBranch } = await supabase
        .from('branches')
        .select('id, ten_chi_nhanh')
        .eq('id', to_branch_id)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .single();

      if (!destBranch) return res.status(400).json({ error: 'Chi nhánh đích không hợp lệ' });

      // Ghi log chuyển
      if (fromBranchId) {
        await supabase
          .from('patient_transfers')
          .insert({
            tenant_id: tenantId,
            benhnhan_id,
            from_branch_id: fromBranchId,
            to_branch_id,
            ly_do: ly_do || null,
            nguoi_chuyen: userId,
          });
      }

      // Cập nhật branch_id cho BN (KHÔNG thay đổi đơn cũ)
      const { data: updated, error } = await supabase
        .from('BenhNhan')
        .update({ branch_id: to_branch_id })
        .eq('id', benhnhan_id)
        .eq('tenant_id', tenantId)
        .select('id, ten, branch_id')
        .single();

      if (error) throw error;

      return res.status(200).json({
        ...updated,
        message: `Đã chuyển ${bn.ten} sang ${destBranch.ten_chi_nhanh}`,
      });
    }

    // GET history: Lịch sử chuyển khách (query param action=history)
    if (req.method === 'PATCH') {
      const { benhnhan_id } = req.body;

      const query = supabase
        .from('patient_transfers')
        .select(`
          *,
          from_branch:branches!patient_transfers_from_branch_id_fkey(ten_chi_nhanh),
          to_branch:branches!patient_transfers_to_branch_id_fkey(ten_chi_nhanh)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (benhnhan_id) query.eq('benhnhan_id', benhnhan_id);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('branch-patients API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
