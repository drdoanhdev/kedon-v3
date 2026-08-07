// API: Đặt hàng NCC tập trung (gộp tròng cần đặt nhiều CN)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'multi_branch', 'manage_clinic'))) return;
  const { tenantId, userId } = ctx;

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const { data: po, error } = await supabase
          .from('lens_purchase_orders')
          .select('*')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .single();
        if (error) throw error;
        const { data: items } = await supabase
          .from('lens_purchase_order_items')
          .select('*')
          .eq('po_id', id)
          .eq('tenant_id', tenantId);
        return res.status(200).json({ ...po, items: items || [] });
      }

      const { data, error } = await supabase
        .from('lens_purchase_orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        if (error.code === '42P01') return res.status(200).json([]);
        throw error;
      }
      return res.status(200).json(data || []);
    }

    // POST action=draft_from_pending → gom lens_order pending thành PO nháp
    if (req.method === 'POST') {
      const { action } = req.body || {};

      if (action === 'draft_from_pending') {
        const { data: pending, error: pErr } = await supabase
          .from('lens_order')
          .select('id, hang_trong_id, sph, cyl, add_power, mat, so_luong, don_kinh_id, ten_trong, DonKinh(branch_id)')
          .eq('tenant_id', tenantId)
          .in('trang_thai', ['cho_dat', 'pending', 'CAN_DAT', 'DAT_KHI_CO_KHACH'])
          .limit(500);

        // Fallback without status filter if column values differ
        let rows = pending || [];
        if (pErr) {
          const fallback = await supabase
            .from('lens_order')
            .select('id, hang_trong_id, sph, cyl, add_power, mat, so_luong, don_kinh_id, ten_hang, trang_thai, DonKinh(branch_id)')
            .eq('tenant_id', tenantId)
            .limit(200);
          if (fallback.error) {
            if (fallback.error.code === '42P01') {
              return res.status(200).json({ message: 'Chưa có bảng lens_order', items: 0 });
            }
            throw fallback.error;
          }
          rows = (fallback.data || []).filter((r: any) => {
            const st = String(r.trang_thai || '').toLowerCase();
            return !st.includes('nhap') && !st.includes('xong') && !st.includes('huy');
          });
        }

        if (rows.length === 0) {
          return res.status(400).json({ error: 'Không có tròng cần đặt để gộp' });
        }

        const maPo = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
        const { data: po, error: poErr } = await supabase
          .from('lens_purchase_orders')
          .insert({
            tenant_id: tenantId,
            ma_po: maPo,
            trang_thai: 'draft',
            ghi_chu: `Gộp ${rows.length} dòng tròng cần đặt`,
            created_by: userId,
          })
          .select()
          .single();
        if (poErr) throw poErr;

        const items = rows.map((r: any) => ({
          po_id: po.id,
          tenant_id: tenantId,
          branch_id: r.DonKinh?.branch_id || null,
          don_kinh_id: r.don_kinh_id || null,
          hang_trong_id: r.hang_trong_id || null,
          ten_trong: r.ten_trong || r.ten_hang || null,
          sph: r.sph,
          cyl: r.cyl,
          add_power: r.add_power,
          mat: r.mat,
          so_luong: r.so_luong || 1,
          trang_thai: 'pending',
        }));

        const { error: iErr } = await supabase.from('lens_purchase_order_items').insert(items);
        if (iErr) throw iErr;

        return res.status(201).json({ ...po, items_count: items.length });
      }

      if (action === 'mark_ordered') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Thiếu id' });
        const { data, error } = await supabase
          .from('lens_purchase_orders')
          .update({
            trang_thai: 'ordered',
            ordered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (error) throw error;
        await supabase
          .from('lens_purchase_order_items')
          .update({ trang_thai: 'ordered' })
          .eq('po_id', id)
          .eq('tenant_id', tenantId);
        return res.status(200).json(data);
      }

      if (action === 'mark_received') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Thiếu id' });
        const { data, error } = await supabase
          .from('lens_purchase_orders')
          .update({
            trang_thai: 'received',
            received_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (error) throw error;
        await supabase
          .from('lens_purchase_order_items')
          .update({ trang_thai: 'received' })
          .eq('po_id', id)
          .eq('tenant_id', tenantId);
        return res.status(200).json(data);
      }

      return res.status(400).json({ error: 'action không hợp lệ' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('lens-po API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
