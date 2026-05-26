// API: Nhập kho gọng kính - GET lịch sử, POST nhập mới
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_lens', 'manage_inventory'))) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  const { branchId } = branchAccess;
  try {
    // GET: Lịch sử nhập kho gọng
    if (req.method === 'GET') {
      const { gong_kinh_id, limit = '50' } = req.query;

      let query = supabase
        .from('frame_import')
        .select('*, GongKinh:gong_kinh_id(id, ten_gong, ma_gong), NhaCungCap:nha_cung_cap_id(ten)')
        .eq('tenant_id', tenantId)
        .order('ngay_nhap', { ascending: false })
        .limit(parseInt(limit as string));

      if (branchId) {
        const { data: branchGongs, error: branchGongsErr } = await supabase
          .from('GongKinh')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('branch_id', branchId);
        if (branchGongsErr) throw branchGongsErr;

        const allowedGongIds = (branchGongs || []).map((g) => g.id);
        if (allowedGongIds.length === 0) {
          return res.status(200).json([]);
        }
        query = query.in('gong_kinh_id', allowedGongIds);
      }

      if (gong_kinh_id) query = query.eq('gong_kinh_id', gong_kinh_id);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Nhập kho gọng (trigger tự động cập nhật tồn)
    if (req.method === 'POST') {
      const { gong_kinh_id, so_luong, don_gia, nha_cung_cap_id, ghi_chu } = req.body;
      const gongKinhId = parseInt(String(gong_kinh_id), 10);
      const soLuong = parseInt(String(so_luong), 10);
      const donGia = parseInt(String(don_gia), 10) || 0;
      const nhaCungCapId = nha_cung_cap_id ? parseInt(String(nha_cung_cap_id), 10) : null;

      if (!Number.isFinite(gongKinhId) || gongKinhId <= 0 || !Number.isFinite(soLuong) || soLuong <= 0) {
        return res.status(400).json({ error: 'gong_kinh_id và so_luong > 0 là bắt buộc' });
      }

      // Kiểm tra gọng thuộc tenant
      let gongCheckQuery = supabase
        .from('GongKinh')
        .select('id, branch_id')
        .eq('id', gongKinhId)
        .eq('tenant_id', tenantId);
      if (branchId) {
        gongCheckQuery = gongCheckQuery.eq('branch_id', branchId);
      }
      const { data: gong } = await gongCheckQuery.single();

      if (!gong) {
        return res.status(404).json({ error: 'Không tìm thấy gọng kính này' });
      }

      // Luôn tạo phiếu nhập + chi tiết cho nhập nhanh để truy vết chặt chẽ.
      const receiptNote = [
        'Nhập nhanh gọng kính',
        typeof ghi_chu === 'string' ? ghi_chu.trim() : '',
      ].filter(Boolean).join(' | ');

      const { data: receipt, error: receiptError } = await supabase
        .from('import_receipt')
        .insert({
          tenant_id: tenantId,
          ma_phieu: null,
          nha_cung_cap_id: nhaCungCapId,
          tong_tien: soLuong * donGia,
          ghi_chu: receiptNote || null,
        })
        .select('id')
        .single();

      if (receiptError || !receipt) {
        throw new Error(`Không tạo được phiếu nhập nhanh: ${receiptError?.message || 'Unknown error'}`);
      }

      const { error: detailError } = await supabase
        .from('import_receipt_detail')
        .insert({
          import_receipt_id: receipt.id,
          loai_hang: 'gong_kinh',
          gong_kinh_id: gongKinhId,
          so_luong: soLuong,
          don_gia: donGia,
        });

      if (detailError) {
        await supabase.from('import_receipt').delete().eq('id', receipt.id).eq('tenant_id', tenantId);
        throw new Error(`Không lưu được chi tiết phiếu nhập nhanh: ${detailError.message}`);
      }

      const { data, error } = await supabase
        .from('frame_import')
        .insert({
          tenant_id: tenantId,
          branch_id: gong.branch_id || branchId || null,
          gong_kinh_id: gongKinhId,
          so_luong: soLuong,
          don_gia: donGia,
          nha_cung_cap_id: nhaCungCapId,
          ghi_chu: ghi_chu || null,
        })
        .select()
        .single();

      if (error) {
        await supabase.from('import_receipt').delete().eq('id', receipt.id).eq('tenant_id', tenantId);
        throw error;
      }

      // Lấy lại tồn kho mới nhất (trigger đã cập nhật)
      let updatedGongQuery = supabase
        .from('GongKinh')
        .select('ton_kho')
        .eq('id', gongKinhId)
        .eq('tenant_id', tenantId);
      if (branchId) {
        updatedGongQuery = updatedGongQuery.eq('branch_id', branchId);
      }
      const { data: updatedGong } = await updatedGongQuery.single();

      return res.status(201).json({ ...data, stock: updatedGong, receipt_id: receipt.id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('frame-import error:', err);
    return res.status(500).json({ error: err.message });
  }
}
