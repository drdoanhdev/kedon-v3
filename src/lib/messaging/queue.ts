/**
 * Helper enqueue/cancel job nhắn tin tự động dựa trên kịch bản (message_workflows).
 * Dùng từ:
 *  - API tạo lịch hẹn (POST /api/hen-kham-lai)
 *  - API cập nhật trạng thái lịch hẹn (PUT/PATCH)
 *  - API tạo/đóng đơn khám
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type TriggerEvent =
  | 'appointment_confirm'
  | 'appointment_reminder'
  | 'followup_after_visit';

export interface AppointmentLite {
  id: number;
  tenant_id: string;
  branch_id?: string | null;
  benhnhanid?: number | null;
  ten_benhnhan?: string | null;
  dienthoai?: string | null;
  ngay_hen: string;        // 'YYYY-MM-DD'
  gio_hen?: string | null; // 'HH:MM' or 'HH:MM:SS'
}

interface WorkflowRow {
  id: number;
  tenant_id: string;
  trigger_event: TriggerEvent;
  offset_minutes: number;
  channel: 'zalo_oa' | 'sms_http';
  template_text: string;
  zns_template_id: string | null;
  enabled: boolean;
}

/** Render template với biến cơ bản: [Tên], [Ngày], [Giờ] */
export function renderTemplate(text: string, app: AppointmentLite, clinicName?: string): string {
  const ngay = formatDateVi(app.ngay_hen);
  const gio = (app.gio_hen || '').slice(0, 5);
  return (text || '')
    .replaceAll('[Tên]', app.ten_benhnhan || '')
    .replaceAll('[Ngày]', ngay)
    .replaceAll('[Giờ]', gio || 'cả ngày')
    .replaceAll('[PhongKham]', clinicName || '')
    .replaceAll('[Ten]', app.ten_benhnhan || '')
    .replaceAll('[Ngay]', ngay)
    .replaceAll('[Gio]', gio || 'cả ngày');
}

function formatDateVi(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Mốc thời gian mục tiêu (start time) cho từng trigger. */
function getAnchorTime(event: TriggerEvent, app: AppointmentLite): Date {
  // Dùng giờ hẹn nếu có, mặc định 09:00 nếu chỉ có ngày
  const hhmm = (app.gio_hen || '09:00').slice(0, 5);
  const base = new Date(`${app.ngay_hen}T${hhmm}:00`);
  if (event === 'followup_after_visit') {
    // Giả định "sau khám" = sau giờ hẹn
    return base;
  }
  return base;
}

export interface EnqueueResult {
  enqueued: number;
  skipped: number;
  reasons?: string[];
}

/**
 * Tạo job theo kịch bản phù hợp (chỉ kịch bản đã bật).
 * - Tự bỏ qua nếu run_at đã quá khứ và là appointment_confirm (gửi ngay).
 * - Tự bỏ qua nếu thiếu số điện thoại.
 */
export async function enqueueWorkflowJobs(
  supabase: SupabaseClient,
  app: AppointmentLite,
  events: TriggerEvent[],
  opts?: { clinicName?: string }
): Promise<EnqueueResult> {
  const reasons: string[] = [];
  if (!app.dienthoai || !app.dienthoai.trim()) {
    return { enqueued: 0, skipped: 1, reasons: ['Không có số điện thoại'] };
  }

  const { data: workflows, error: wfErr } = await supabase
    .from('message_workflows')
    .select('id, tenant_id, trigger_event, offset_minutes, channel, template_text, zns_template_id, enabled')
    .eq('tenant_id', app.tenant_id)
    .eq('enabled', true)
    .in('trigger_event', events);

  if (wfErr || !workflows || workflows.length === 0) {
    return { enqueued: 0, skipped: 0 };
  }

  // Phải có channel đã connected mới enqueue (tránh job lỗi hàng loạt)
  const { data: channels } = await supabase
    .from('clinic_messaging_channels')
    .select('provider, status, auto_send')
    .eq('tenant_id', app.tenant_id);

  const enabledChannels = new Set(
    (channels || [])
      .filter((c) => c.status === 'connected' && c.auto_send)
      .map((c) => c.provider as string)
  );

  let enqueued = 0;
  let skipped = 0;
  const rows: Record<string, unknown>[] = [];

  for (const wf of workflows as WorkflowRow[]) {
    if (!enabledChannels.has(wf.channel)) {
      skipped++;
      reasons.push(`Kênh ${wf.channel} chưa kết nối hoặc chưa bật auto_send`);
      continue;
    }

    const anchor = getAnchorTime(wf.trigger_event, app);
    const runAt = new Date(anchor.getTime() + wf.offset_minutes * 60_000);

    // Nếu là confirm và quá khứ → vẫn gửi ngay
    // Nếu là reminder và quá khứ → bỏ
    if (wf.trigger_event !== 'appointment_confirm' && runAt.getTime() < Date.now() - 60_000) {
      skipped++;
      reasons.push(`Workflow #${wf.id} đã trễ thời điểm gửi`);
      continue;
    }

    rows.push({
      tenant_id: app.tenant_id,
      branch_id: app.branch_id || null,
      workflow_id: wf.id,
      appointment_id: app.id,
      patient_id: app.benhnhanid || null,
      recipient_phone: app.dienthoai!.trim(),
      recipient_name: app.ten_benhnhan || null,
      channel: wf.channel,
      message_text: renderTemplate(wf.template_text, app, opts?.clinicName),
      zns_template_id: wf.zns_template_id,
      run_at: runAt.toISOString(),
      status: 'pending',
    });
    enqueued++;
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('message_jobs').insert(rows);
    if (insErr) {
      return { enqueued: 0, skipped: rows.length, reasons: [insErr.message] };
    }
  }

  return { enqueued, skipped, reasons };
}

/** Hủy mọi job pending của 1 lịch hẹn (khi lịch bị huỷ). */
export async function cancelJobsForAppointment(
  supabase: SupabaseClient,
  appointmentId: number,
  tenantId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('message_jobs')
    .update({ status: 'cancelled' })
    .eq('tenant_id', tenantId)
    .eq('appointment_id', appointmentId)
    .eq('status', 'pending')
    .select('id');
  if (error) return 0;
  return data?.length || 0;
}
