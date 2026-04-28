// API endpoint cho hãng tròng kính
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, supabaseAdmin as supabase, setNoCacheHeaders } from '../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;
  const includeEffectivePrice = req.query.effective_price === '1' || req.query.effective_price === 'true';

  let effectiveBranchId: string | null = null;
  if (includeEffectivePrice) {
    const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
    if (!branchAccess) return;
    effectiveBranchId = branchAccess.branchId;
  }

  try {
    if (req.method === 'GET') {
      const showInactive = req.query.show_inactive === '1';
      let query = supabase
        .from('HangTrong')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('trang_thai', true)
        .order('ten_hang');
      
      if (!showInactive) {
        query = query.or('ngung_kinh_doanh.is.null,ngung_kinh_doanh.eq.false');
      }

      const { data, error } = await query;
      if (error) throw error;

      if (includeEffectivePrice) {
        const rows = Array.isArray(data) ? data : [];
        const itemIds = rows.map((item: any) => Number(item.id)).filter((id: number) => Number.isFinite(id));

        const overrideByItemId = new Map<number, any>();
        if (effectiveBranchId && itemIds.length > 0) {
          const { data: overrideRows, error: overrideErr } = await supabase
            .from('branch_price_overrides')
            .select('id, item_id, gia_ban_override, gia_von_override')
            .eq('tenant_id', tenantId)
            .eq('branch_id', effectiveBranchId)
            .eq('item_type', 'hang_trong')
            .in('item_id', itemIds)
            .is('deleted_at', null)
            .is('effective_to', null);

          if (overrideErr && overrideErr.code !== '42P01') {
            console.warn('hang-trong effective price query warning:', overrideErr.message);
          } else {
            for (const row of (overrideRows || [])) {
              overrideByItemId.set(Number((row as any).item_id), row);
            }
          }
        }

        const effectiveRows = rows.map((item: any) => {
          const baseSell = Math.max(0, Math.round(Number(item.gia_ban) || 0));
          const baseCost = Math.max(0, Math.round(Number(item.gia_nhap) || 0));
          const override = overrideByItemId.get(Number(item.id));
          return {
            ...item,
            gia_ban: override ? Math.max(0, Math.round(Number(override.gia_ban_override ?? baseSell) || 0)) : baseSell,
            gia_nhap: override ? Math.max(0, Math.round(Number(override.gia_von_override ?? baseCost) || 0)) : baseCost,
            gia_ban_goc: baseSell,
            gia_nhap_goc: baseCost,
            gia_nguon: override ? 'branch_override' : 'catalog_default',
            gia_override_id: override ? Number(override.id) : null,
          };
        });

        return res.status(200).json(effectiveRows);
      }

      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { ten_hang, gia_nhap, gia_ban, mo_ta } = req.body;
      
      const { data, error } = await supabase
        .from('HangTrong')
        .insert({
          ten_hang,
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          mo_ta,
          tenant_id: tenantId
        })
        .select();

      if (error) {
        if (error.code === '23505') return res.status(409).json({ message: `Hãng tròng "${ten_hang}" đã tồn tại` });
        throw error;
      }
      return res.status(200).json(data[0]);
    }

    if (req.method === 'PUT') {
      const { id, ten_hang, gia_nhap, gia_ban, mo_ta, ngung_kinh_doanh } = req.body;
      
      const updateData: any = {
        ten_hang,
        gia_nhap: parseInt(gia_nhap) || 0,
        gia_ban: parseInt(gia_ban) || 0,
        mo_ta
      };
      if (ngung_kinh_doanh !== undefined) {
        updateData.ngung_kinh_doanh = Boolean(ngung_kinh_doanh);
      }

      const { data, error } = await supabase
        .from('HangTrong')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select();

      if (error) {
        if (error.code === '23505') return res.status(409).json({ message: `Hãng tròng "${ten_hang}" đã tồn tại` });
        throw error;
      }
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      // Hỗ trợ lấy id từ cả body hoặc query (?id=)
      const id = (req.body && req.body.id) || (req.query && req.query.id);

      if (!id) {
        return res.status(400).json({ message: 'Thiếu id hãng tròng cần xóa' });
      }

      // Đảm bảo id là số nguyên
      const parsedId = Array.isArray(id) ? parseInt(id[0] as string, 10) : parseInt(id as string, 10);
      if (isNaN(parsedId)) {
        return res.status(400).json({ message: 'id không hợp lệ' });
      }

      const { data, error } = await supabase
        .from('HangTrong')
        .update({ trang_thai: false })
        .eq('id', parsedId)
        .eq('tenant_id', tenantId)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy hãng tròng để xóa' });
      }

      return res.status(200).json({ message: 'Đã xóa (ẩn) hãng tròng', id: parsedId });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
