//src/pages/api/thuoc/index.ts L1
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';
import { requirePermission } from '../../../lib/permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  const { branchId } = branchAccess;
  const scope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
  const isSharedScope = scope === 'shared';
  const includeEffectivePrice = req.query.effective_price === '1' || req.query.effective_price === 'true';

  const method = req.method;

  // RBAC: viết danh mục (mọi scope) cần manage_categories.
  // Scope shared cho phép ai có manage_categories ở level tenant chỉnh sửa.
  if (method && method !== 'GET') {
    if (!(await requirePermission(ctx, res, 'manage_categories'))) return;
  }

  try {
    if (method === 'GET') {
      let query = supabase
        .from('Thuoc')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('id', { ascending: false });

      if (!isSharedScope && branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

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
            .eq('item_type', 'thuoc')
            .in('item_id', itemIds)
            .is('deleted_at', null)
            .is('effective_to', null);

          // Backward-compatible: if V049 is not applied yet, ignore missing table.
          if (overrideErr && overrideErr.code !== '42P01') {
            console.warn('thuoc effective price query warning:', overrideErr.message);
          } else {
            for (const row of (overrideRows || [])) {
              overrideByItemId.set(Number((row as any).item_id), row);
            }
          }
        }

        const effectiveRows = rows.map((item: any) => {
          const baseSell = Math.max(0, Math.round(Number(item.giaban) || 0));
          const baseCost = Math.max(0, Math.round(Number(item.gianhap) || 0));
          const override = overrideByItemId.get(Number(item.id));
          const effectiveSell = override ? Math.max(0, Math.round(Number(override.gia_ban_override ?? baseSell) || 0)) : baseSell;
          const effectiveCost = override ? Math.max(0, Math.round(Number(override.gia_von_override ?? baseCost) || 0)) : baseCost;

          return {
            ...item,
            giaban: effectiveSell,
            gianhap: effectiveCost,
            giaban_goc: baseSell,
            gianhap_goc: baseCost,
            gia_nguon: override ? 'branch_override' : 'catalog_default',
            gia_override_id: override ? Number(override.id) : null,
          };
        });

        return res.status(200).json({ data: effectiveRows });
      }

      return res.status(200).json({ data });
    }

    if (method === 'POST') {
      console.log('🔍 POST Request Body:', JSON.stringify(req.body, null, 2));
      const { id, ...thuocData } = req.body; // Loại bỏ id khỏi payload
      
      // Validate required fields
      if (!thuocData.tenthuoc || !thuocData.donvitinh) {
        console.log('❌ Missing required fields:', { tenthuoc: thuocData.tenthuoc, donvitinh: thuocData.donvitinh });
        return res.status(400).json({ error: 'Tên thuốc và đơn vị tính là bắt buộc' });
      }
      
      console.log('📝 Data to insert (without id):', JSON.stringify(thuocData, null, 2));
      
      try {
        const { data, error } = await supabase
          .from('Thuoc')
          .insert([{ ...thuocData, tenant_id: tenantId, ...(!isSharedScope && branchId ? { branch_id: branchId } : {}) }])
          .select();
        
        if (error) {
          console.log('❌ Supabase Error:', error);
          return res.status(400).json({ error: error.message });
        }
        
        if (!data || !data[0]) {
          console.log('❌ No data returned from insert');
          return res.status(400).json({ error: 'Không thể tạo thuốc mới' });
        }

        console.log('✅ Successfully created drug:', data[0]);
        return res.status(200).json({ message: 'Đã thêm thuốc', data });
      } catch (insertError) {
        console.log('❌ Insert Exception:', insertError);
        return res.status(500).json({ error: 'Lỗi khi thêm thuốc: ' + String(insertError) });
      }
    }

    if (method === 'PUT') {
      const { id, ...rest } = req.body;
      let query = supabase.from('Thuoc').update(rest).eq('id', id).eq('tenant_id', tenantId);
      if (!isSharedScope && branchId) {
        query = query.eq('branch_id', branchId);
      }
      const { error } = await query;
      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({ message: 'Đã cập nhật thuốc' });
    }

    if (method === 'DELETE') {
      const { id } = req.query;
      let query = supabase.from('Thuoc').delete().eq('id', id).eq('tenant_id', tenantId);
      if (!isSharedScope && branchId) {
        query = query.eq('branch_id', branchId);
      }
      const { error } = await query;
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ message: 'Đã xoá thuốc' });
    }

    return res.status(405).json({ message: 'Phương thức không hỗ trợ' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: 'Lỗi server', error: message });
  }
}
