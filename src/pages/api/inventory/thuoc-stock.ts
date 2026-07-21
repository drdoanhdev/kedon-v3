// API: Danh sách tồn kho thuốc + cảnh báo
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_drug', 'manage_inventory'))) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  const { branchId } = branchAccess;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { search, filter, show_inactive } = req.query;
    const searchText = typeof search === 'string' ? search.trim().toLowerCase() : '';
    const showInactive = show_inactive === '1' || show_inactive === 'true';

    // Lấy theo tenant, lọc branch/thủ thuật/ngừng KD trên server JS
    // (tránh chuỗi .or() PostgREST bị ghi đè / lỗi parse UUID)
    const { data, error } = await supabase
      .from('Thuoc')
      .select('id, mathuoc, tenthuoc, donvitinh, hoatchat, cachdung, giaban, gianhap, tonkho, muc_ton_can_co, ngung_kinh_doanh, la_thu_thuat, soluongmacdinh, nhomthuoc, nha_cung_cap_id, branch_id')
      .eq('tenant_id', tenantId)
      .order('tenthuoc', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    let rows = Array.isArray(data) ? data : [];

    // Chi nhánh hiện tại + danh mục shared (branch_id null)
    if (branchId) {
      rows = rows.filter((item: any) => !item.branch_id || item.branch_id === branchId);
    }

    // Chỉ thuốc, không lấy thủ thuật (trừ khi tìm kiếm mở rộng sau này)
    rows = rows.filter((item: any) => !item.la_thu_thuat);

    if (!showInactive) {
      rows = rows.filter((item: any) => !item.ngung_kinh_doanh);
    }

    if (searchText) {
      rows = rows.filter((item: any) => {
        const hay = `${item.tenthuoc || ''} ${item.mathuoc || ''} ${item.hoatchat || ''} ${item.cachdung || ''}`.toLowerCase();
        return hay.includes(searchText);
      });
    }

    const items = rows.map((item: any) => {
      const tonkho = item.tonkho ?? 0;
      const mucMin = item.muc_ton_can_co ?? 10;
      let trang_thai = 'DU';
      if (tonkho <= 0) trang_thai = 'HET';
      else if (tonkho <= mucMin) trang_thai = 'SAP_HET';
      return { ...item, trang_thai };
    });

    const filtered = filter && filter !== 'all'
      ? items.filter((i: any) => i.trang_thai === filter)
      : items;

    const summary = {
      total: items.length,
      het: items.filter((i: any) => i.trang_thai === 'HET').length,
      sap_het: items.filter((i: any) => i.trang_thai === 'SAP_HET').length,
      du: items.filter((i: any) => i.trang_thai === 'DU').length,
    };

    return res.status(200).json({ data: filtered, summary });
  } catch (err: any) {
    console.error('thuoc-stock error:', err);
    return res.status(500).json({ error: err.message });
  }
}
