/**
 * GET    /api/messaging/workflows
 * POST   /api/messaging/workflows           — tạo mới
 * PUT    /api/messaging/workflows           — cập nhật (cần id)
 * DELETE /api/messaging/workflows?id=...    — xóa
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireTenant,
  requireFeature,
  supabaseAdmin,
  setNoCacheHeaders,
} from '../../../lib/tenantApi';

const TRIGGERS = ['appointment_confirm', 'appointment_reminder', 'followup_after_visit'] as const;
const CHANNELS = ['zalo_oa', 'sms_http'] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'messaging_automation', 'manage_messaging'))) return;

  const { tenantId } = ctx;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('message_workflows')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true });
    if (error) return res.status(500).json({ message: error.message });
    return res.status(200).json({ data: data || [] });
  }

  if (req.method === 'POST') {
    const { name, trigger_event, offset_minutes, channel, template_text, zns_template_id, enabled } = req.body || {};
    if (!name || !trigger_event || !channel || !template_text) {
      return res.status(400).json({ message: 'Thiếu tham số bắt buộc' });
    }
    if (!TRIGGERS.includes(trigger_event)) return res.status(400).json({ message: 'trigger_event không hợp lệ' });
    if (!CHANNELS.includes(channel)) return res.status(400).json({ message: 'channel không hợp lệ' });

    const { data, error } = await supabaseAdmin
      .from('message_workflows')
      .insert({
        tenant_id: tenantId,
        name: String(name).slice(0, 200),
        trigger_event,
        offset_minutes: Number.isInteger(offset_minutes) ? offset_minutes : 0,
        channel,
        template_text: String(template_text).slice(0, 2000),
        zns_template_id: zns_template_id || null,
        enabled: enabled !== false,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'PUT') {
    const { id, name, trigger_event, offset_minutes, channel, template_text, zns_template_id, enabled } = req.body || {};
    if (!id) return res.status(400).json({ message: 'Thiếu id' });

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = String(name).slice(0, 200);
    if (trigger_event !== undefined) {
      if (!TRIGGERS.includes(trigger_event)) return res.status(400).json({ message: 'trigger_event không hợp lệ' });
      update.trigger_event = trigger_event;
    }
    if (offset_minutes !== undefined) update.offset_minutes = Number(offset_minutes) || 0;
    if (channel !== undefined) {
      if (!CHANNELS.includes(channel)) return res.status(400).json({ message: 'channel không hợp lệ' });
      update.channel = channel;
    }
    if (template_text !== undefined) update.template_text = String(template_text).slice(0, 2000);
    if (zns_template_id !== undefined) update.zns_template_id = zns_template_id || null;
    if (enabled !== undefined) update.enabled = !!enabled;

    const { data, error } = await supabaseAdmin
      .from('message_workflows')
      .update(update)
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ message: 'Thiếu id' });
    const { error } = await supabaseAdmin
      .from('message_workflows')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) return res.status(400).json({ message: error.message });
    return res.status(200).json({ message: 'Đã xóa' });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).end();
}
