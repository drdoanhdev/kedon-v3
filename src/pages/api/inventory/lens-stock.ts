// API: Kho tròng kính theo độ (lens_stock)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_lens', 'manage_inventory'))) return;
  const { tenantId } = ctx;

  try {
    // GET: Lấy danh sách tồn kho tròng
    if (req.method === 'GET') {
      const { hang_trong_id, trang_thai_ton, search, show_inactive } = req.query;

      // Mặc định chỉ hiện hãng tròng đang kinh doanh (trang_thai=true)
      // Nếu show_inactive=1 thì hiện cả hãng đã ngưng
      const selectHangTrong = show_inactive === '1'
        ? '*, HangTrong(id, ten_hang, loai_trong, kieu_quan_ly, gia_nhap, gia_ban, trang_thai)'
        : '*, HangTrong!inner(id, ten_hang, loai_trong, kieu_quan_ly, gia_nhap, gia_ban, trang_thai)';

      let query = supabase
        .from('lens_stock')
        .select(selectHangTrong)
        .eq('tenant_id', tenantId)
        .order('hang_trong_id')
        .order('sph')
        .order('cyl');

      if (show_inactive !== '1') {
        query = query.eq('HangTrong.trang_thai', true);
      }

      if (hang_trong_id) query = query.eq('hang_trong_id', hang_trong_id);
      if (trang_thai_ton) query = query.eq('trang_thai_ton', trang_thai_ton);

      const { data, error } = await query;
      if (error) throw error;

      // Tính thêm số lượng cần nhập
      const result = (data || []).map((item: any) => ({
        ...item,
        can_nhap_them: item.ton_hien_tai < item.muc_ton_can_co
          ? Math.max(item.muc_ton_can_co - item.ton_hien_tai, 0)
          : 0,
      }));

      return res.status(200).json(result);
    }

    // POST: Tạo dòng kho mới (1 tổ hợp độ)
    if (req.method === 'POST') {
      const { hang_trong_id, sph, cyl, add_power, mat, ton_dau_ky, muc_ton_can_co } = req.body;

      if (!hang_trong_id || sph === undefined) {
        return res.status(400).json({ error: 'hang_trong_id và sph là bắt buộc' });
      }

      const insertData: any = {
        tenant_id: tenantId,
        hang_trong_id: parseInt(hang_trong_id),
        sph: parseFloat(sph),
        cyl: parseFloat(cyl) || 0,
        add_power: add_power ? parseFloat(add_power) : null,
        ton_dau_ky: parseInt(ton_dau_ky) || 0,
        ton_hien_tai: parseInt(ton_dau_ky) || 0,
        muc_ton_can_co: parseInt(muc_ton_can_co) || 10,
      };
      // mat chỉ dùng cho đa tròng (khi có add_power)
      if (mat && ['trai', 'phai'].includes(mat)) insertData.mat = mat;

      const { data, error } = await supabase
        .from('lens_stock')
        .insert(insertData)
        .select('*, HangTrong(id, ten_hang, loai_trong, kieu_quan_ly)')
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Tổ hợp độ này đã tồn tại trong kho' });
        }
        throw error;
      }
      return res.status(201).json(data);
    }

    // PUT: Cập nhật tất cả thông tin lens_stock
    if (req.method === 'PUT') {
      const { id, hang_trong_id, sph, cyl, add_power, mat, ton_dau_ky, muc_ton_can_co } = req.body;

      if (!id) return res.status(400).json({ error: 'Thiếu id' });

      // Lấy record hiện tại để tính delta tồn đầu kỳ
      const { data: current } = await supabase
        .from('lens_stock')
        .select('ton_dau_ky, ton_hien_tai')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (!current) return res.status(404).json({ error: 'Không tìm thấy dòng kho' });

      const updateFields: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      // Thông số kho
      if (muc_ton_can_co !== undefined) updateFields.muc_ton_can_co = parseInt(muc_ton_can_co) || 10;

      // Tồn đầu kỳ: điều chỉnh tồn hiện tại theo delta
      if (ton_dau_ky !== undefined) {
        const newTonDauKy = parseInt(ton_dau_ky) || 0;
        const delta = newTonDauKy - current.ton_dau_ky;
        updateFields.ton_dau_ky = newTonDauKy;
        updateFields.ton_hien_tai = current.ton_hien_tai + delta;
      }

      // Thông tin tròng (hãng, độ)
      if (hang_trong_id !== undefined) updateFields.hang_trong_id = parseInt(hang_trong_id);
      if (sph !== undefined) updateFields.sph = parseFloat(sph);
      if (cyl !== undefined) updateFields.cyl = parseFloat(cyl) || 0;
      if (add_power !== undefined) updateFields.add_power = add_power === '' || add_power === null ? null : parseFloat(add_power);
      if (mat !== undefined) updateFields.mat = (mat && ['trai', 'phai'].includes(mat)) ? mat : null;

      const { data, error } = await supabase
        .from('lens_stock')
        .update(updateFields)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*, HangTrong(id, ten_hang, loai_trong, kieu_quan_ly, gia_nhap, gia_ban, trang_thai)')
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Tổ hợp độ này đã tồn tại trong kho (trùng hãng + SPH + CYL + ADD)' });
        }
        throw error;
      }
      return res.status(200).json(data);
    }

    // DELETE: Chỉ cho xóa nếu chưa có giao dịch
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Thiếu id' });

      const stockId = parseInt(id as string);

      // Kiểm tra có giao dịch nhập/xuất không
      const [imports, exports, damaged] = await Promise.all([
        supabase.from('lens_import').select('id', { count: 'exact', head: true }).eq('lens_stock_id', stockId),
        supabase.from('lens_export_sale').select('id', { count: 'exact', head: true }).eq('lens_stock_id', stockId),
        supabase.from('lens_export_damaged').select('id', { count: 'exact', head: true }).eq('lens_stock_id', stockId),
      ]);

      const totalTx = (imports.count || 0) + (exports.count || 0) + (damaged.count || 0);
      if (totalTx > 0) {
        return res.status(400).json({
          error: `Không thể xóa: đã có ${totalTx} giao dịch (${imports.count || 0} nhập, ${exports.count || 0} xuất bán, ${damaged.count || 0} hỏng). Hãy sửa thông tin thay vì xóa.`,
        });
      }

      const { error } = await supabase
        .from('lens_stock')
        .delete()
        .eq('id', stockId)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('lens-stock error:', err);
    return res.status(500).json({ error: err.message });
  }
}
