// API: Giá riêng theo chi nhánh (branch_price_overrides)
// GET  ?branch_id=...&item_type=...  → danh sách override đang có hiệu lực
// POST { branch_id, item_type, item_id, gia_ban_override, gia_von_override, reason } → tạo/cập nhật override
// DELETE ?id=...  → xóa mềm override
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch', 'manage_clinic'))) return;
  const { tenantId, userId } = ctx;

  try {
    // GET: Lấy danh sách override cho 1 chi nhánh
    if (req.method === 'GET') {
      const { branch_id, item_type } = req.query;
      if (!branch_id) return res.status(400).json({ error: 'Thiếu branch_id' });

      // Verify branch belongs to tenant
      const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('id', branch_id)
        .eq('tenant_id', tenantId)
        .single();
      if (!branch) return res.status(404).json({ error: 'Chi nhánh không tồn tại' });

      let query = supabase
        .from('branch_price_overrides')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branch_id)
        .is('deleted_at', null)
        .is('effective_to', null)
        .order('created_at', { ascending: false });

      if (item_type) query = query.eq('item_type', item_type);

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with item names
      const enriched = await enrichWithItemNames(data || [], tenantId);
      return res.status(200).json(enriched);
    }

    // POST: Tạo/cập nhật override
    if (req.method === 'POST') {
      const { branch_id, item_type, item_id, gia_ban_override, gia_von_override, reason } = req.body;

      if (!branch_id || !item_type || !item_id) {
        return res.status(400).json({ error: 'Thiếu branch_id, item_type hoặc item_id' });
      }
      const VALID_TYPES = ['thuoc', 'hang_trong', 'gong_kinh', 'nhom_gia_gong'];
      if (!VALID_TYPES.includes(item_type)) {
        return res.status(400).json({ error: 'item_type không hợp lệ' });
      }
      if (gia_ban_override == null && gia_von_override == null) {
        return res.status(400).json({ error: 'Cần nhập ít nhất giá bán hoặc giá vốn' });
      }

      // Verify branch belongs to tenant
      const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('id', branch_id)
        .eq('tenant_id', tenantId)
        .single();
      if (!branch) return res.status(404).json({ error: 'Chi nhánh không tồn tại' });

      // Soft-delete existing active override for same item
      await supabase
        .from('branch_price_overrides')
        .update({ deleted_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('branch_id', branch_id)
        .eq('item_type', item_type)
        .eq('item_id', item_id)
        .is('deleted_at', null)
        .is('effective_to', null);

      const { data, error } = await supabase
        .from('branch_price_overrides')
        .insert({
          tenant_id: tenantId,
          branch_id,
          item_type,
          item_id: Number(item_id),
          gia_ban_override: gia_ban_override != null ? Number(gia_ban_override) : null,
          gia_von_override: gia_von_override != null ? Number(gia_von_override) : null,
          source: 'manual',
          reason: reason?.trim() || null,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    // DELETE: Xóa mềm override
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Thiếu id' });

      const { error } = await supabase
        .from('branch_price_overrides')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('price-overrides API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}

// Enrich override list with item names from catalog
async function enrichWithItemNames(overrides: any[], tenantId: string) {
  if (overrides.length === 0) return [];

  const byType: Record<string, number[]> = {};
  for (const o of overrides) {
    if (!byType[o.item_type]) byType[o.item_type] = [];
    byType[o.item_type].push(o.item_id);
  }

  const nameMap: Record<string, Record<number, string>> = {};

  await Promise.all(Object.entries(byType).map(async ([type, ids]) => {
    nameMap[type] = {};
    if (type === 'thuoc') {
      const { data } = await supabase
        .from('Thuoc')
        .select('id, tenthuoc, donvitinh, giaban, gianhap')
        .eq('tenant_id', tenantId)
        .in('id', ids);
      (data || []).forEach((d: any) => {
        nameMap[type][d.id] = d.tenthuoc;
        (d as any)._catalog = d;
      });
      // Store full catalog data
      if (data) {
        for (const d of data) {
          nameMap[`${type}__catalog__${d.id}`] = d as any;
        }
      }
    } else if (type === 'hang_trong') {
      const { data } = await supabase
        .from('HangTrong')
        .select('id, ten_hang, gia_ban, gia_nhap')
        .eq('tenant_id', tenantId)
        .in('id', ids);
      (data || []).forEach((d: any) => { nameMap[type][d.id] = d.ten_hang; });
    } else if (type === 'gong_kinh') {
      const { data } = await supabase
        .from('GongKinh')
        .select('id, ten_gong, gia_ban, gia_nhap')
        .eq('tenant_id', tenantId)
        .in('id', ids);
      (data || []).forEach((d: any) => { nameMap[type][d.id] = d.ten_gong; });
    }
  }));

  return overrides.map(o => ({
    ...o,
    ten_san_pham: nameMap[o.item_type]?.[o.item_id] || `ID ${o.item_id}`,
  }));
}
