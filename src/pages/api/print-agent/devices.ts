// API: Đăng ký Print Agent theo chi nhánh
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'print_config'))) return;
  const { tenantId, userId, branchId } = ctx;

  try {
    if (req.method === 'GET') {
      let query = supabase
        .from('print_agent_devices')
        .select('*, branch:branches(id, ten_chi_nhanh)')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (req.query.branch_id) {
        query = query.eq('branch_id', req.query.branch_id as string);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === '42P01') return res.status(200).json([]);
        throw error;
      }
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const {
        device_label,
        device_fingerprint,
        agent_version,
        branch_id: bodyBranchId,
      } = req.body || {};

      const targetBranchId = bodyBranchId || branchId || null;
      if (!device_label?.trim()) {
        return res.status(400).json({ error: 'Thiếu device_label' });
      }

      if (targetBranchId) {
        const { data: br } = await supabase
          .from('branches')
          .select('id')
          .eq('id', targetBranchId)
          .eq('tenant_id', tenantId)
          .single();
        if (!br) return res.status(400).json({ error: 'Chi nhánh không hợp lệ' });
      }

      const fingerprint = device_fingerprint?.trim() || null;

      if (fingerprint) {
        const { data: existing } = await supabase
          .from('print_agent_devices')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('device_fingerprint', fingerprint)
          .maybeSingle();

        if (existing) {
          const { data, error } = await supabase
            .from('print_agent_devices')
            .update({
              device_label: device_label.trim(),
              branch_id: targetBranchId,
              agent_version: agent_version || null,
              last_seen_at: new Date().toISOString(),
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select('*, branch:branches(id, ten_chi_nhanh)')
            .single();
          if (error) throw error;
          return res.status(200).json(data);
        }
      }

      const { data, error } = await supabase
        .from('print_agent_devices')
        .insert({
          tenant_id: tenantId,
          branch_id: targetBranchId,
          device_label: device_label.trim(),
          device_fingerprint: fingerprint,
          agent_version: agent_version || null,
          last_seen_at: new Date().toISOString(),
          created_by: userId,
        })
        .select('*, branch:branches(id, ten_chi_nhanh)')
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, branch_id, device_label, is_active } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Thiếu id' });

      const update: any = { updated_at: new Date().toISOString(), last_seen_at: new Date().toISOString() };
      if (branch_id !== undefined) update.branch_id = branch_id || null;
      if (device_label !== undefined) update.device_label = device_label.trim();
      if (is_active !== undefined) update.is_active = !!is_active;

      const { data, error } = await supabase
        .from('print_agent_devices')
        .update(update)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*, branch:branches(id, ten_chi_nhanh)')
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Thiếu id' });
      const { error } = await supabase
        .from('print_agent_devices')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('print-agent devices API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
