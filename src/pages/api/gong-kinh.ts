// API endpoint cho gọng kính
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, supabaseAdmin as supabase, setNoCacheHeaders } from '../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  let { branchId } = branchAccess;
  const scope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
  const isSharedScope = scope === 'shared';
  const includeEffectivePrice = req.query.effective_price === '1' || req.query.effective_price === 'true';

  if (isSharedScope && req.method !== 'GET' && ctx.role !== 'owner' && ctx.role !== 'admin') {
    return res.status(403).json({ message: 'Chỉ owner/admin mới được chỉnh sửa danh mục dùng chung' });
  }

  // Safety fallback: nếu thiếu x-branch-id nhưng tenant đã có chi nhánh,
  // mặc định khóa vào chi nhánh chính để tránh trả dữ liệu gọng toàn tenant.
  if (!isSharedScope && !branchId) {
    const { data: mainBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('is_main', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (mainBranch?.id) {
      branchId = mainBranch.id;
    }
  }

  try {
    if (req.method === 'GET') {
      const { show_inactive } = req.query;
      let query = supabase
        .from('GongKinh')
        .select('*, NhaCungCap:nha_cung_cap_id(id, ten)')
        .eq('tenant_id', tenantId)
        .order('ten_gong');

      if (!isSharedScope && branchId) {
        query = query.eq('branch_id', branchId);
      }

      if (!show_inactive) {
        query = query.eq('trang_thai', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (includeEffectivePrice) {
        const rows = Array.isArray(data) ? data : [];
        const itemIds = rows.map((item: any) => Number(item.id)).filter((id: number) => Number.isFinite(id));

        const overrideByItemId = new Map<number, any>();
        if (branchId && itemIds.length > 0) {
          const { data: overrideRows, error: overrideErr } = await supabase
            .from('branch_price_overrides')
            .select('id, item_id, gia_ban_override, gia_von_override')
            .eq('tenant_id', tenantId)
            .eq('branch_id', branchId)
            .eq('item_type', 'gong_kinh')
            .in('item_id', itemIds)
            .is('deleted_at', null)
            .is('effective_to', null);

          if (overrideErr && overrideErr.code !== '42P01') {
            console.warn('gong-kinh effective price query warning:', overrideErr.message);
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
      const { ten_gong, chat_lieu, gia_nhap, gia_ban, mo_ta, ma_gong, mau_sac, kich_co, nha_cung_cap_id, ton_kho, muc_ton_can_co } = req.body;
      
      const { data, error } = await supabase
        .from('GongKinh')
        .insert({
          ten_gong,
          chat_lieu: chat_lieu || '',
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          mo_ta: mo_ta || '',
          ma_gong: ma_gong || null,
          mau_sac: mau_sac || null,
          kich_co: kich_co || null,
          nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
          ton_kho: parseInt(ton_kho) || 0,
          muc_ton_can_co: parseInt(muc_ton_can_co) || 2,
          tenant_id: tenantId,
          ...(!isSharedScope && branchId ? { branch_id: branchId } : {}),
        })
        .select('*, NhaCungCap:nha_cung_cap_id(id, ten)');

      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    if (req.method === 'PUT') {
      const { id, ten_gong, chat_lieu, gia_nhap, gia_ban, mo_ta, ma_gong, mau_sac, kich_co, nha_cung_cap_id, muc_ton_can_co } = req.body;
      
      const { data, error } = await supabase
        .from('GongKinh')
        .update({
          ten_gong,
          chat_lieu: chat_lieu || '',
          gia_nhap: parseInt(gia_nhap) || 0,
          gia_ban: parseInt(gia_ban) || 0,
          mo_ta: mo_ta || '',
          ma_gong: ma_gong || null,
          mau_sac: mau_sac || null,
          kich_co: kich_co || null,
          nha_cung_cap_id: nha_cung_cap_id ? parseInt(nha_cung_cap_id) : null,
          muc_ton_can_co: parseInt(muc_ton_can_co) || 2,
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .match(!isSharedScope && branchId ? { branch_id: branchId } : {})
        .select('*, NhaCungCap:nha_cung_cap_id(id, ten)');

      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      
      const { error } = await supabase
        .from('GongKinh')
        .update({ trang_thai: false })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .match(!isSharedScope && branchId ? { branch_id: branchId } : {});

      if (error) throw error;
      return res.status(200).json({ message: 'Đã xóa gọng kính' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
