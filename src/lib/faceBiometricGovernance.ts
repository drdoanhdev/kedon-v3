/**
 * Quản trị dữ liệu sinh trắc học khuôn mặt: đồng ý (consent) + nhật ký kiểm toán.
 * Tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân nhạy cảm.
 */
import { supabaseAdmin } from './tenantApi';

export type FaceAuditAction =
  | 'consent_grant'
  | 'consent_revoke'
  | 'enroll'
  | 'recognize'
  | 'assign'
  | 'delete'
  | 'reject';

export interface ConsentCheck {
  /** Có consent đang hiệu lực hay không. */
  ok: boolean;
  /** Bảng consent chưa tồn tại (migration V086 chưa chạy) — fail-open để không phá vỡ. */
  tableMissing: boolean;
}

function isMissingTable(message: string | undefined): boolean {
  if (!message) return false;
  return /face_biometric_consent|does not exist|relation .* does not exist|schema cache/i.test(message);
}

/**
 * Kiểm tra bệnh nhân đã đồng ý sử dụng dữ liệu sinh trắc chưa.
 * Nếu bảng chưa tồn tại (chưa migrate) → trả tableMissing=true để caller fail-open.
 */
export async function hasActiveConsent(
  tenantId: string,
  patientId: number
): Promise<ConsentCheck> {
  const { data, error } = await supabaseAdmin
    .from('face_biometric_consent')
    .select('id, revoked_at')
    .eq('tenant_id', tenantId)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) {
      return { ok: false, tableMissing: true };
    }
    // Lỗi khác — coi như chưa có consent (fail-closed).
    return { ok: false, tableMissing: false };
  }

  return { ok: Boolean(data && !data.revoked_at), tableMissing: false };
}

/**
 * Đảm bảo có consent trước khi enroll. Trả về null nếu OK, hoặc thông báo lỗi để chặn.
 * Fail-open khi bảng chưa migrate (giữ tương thích ngược).
 */
export async function assertConsentForEnroll(
  tenantId: string,
  patientId: number
): Promise<string | null> {
  const check = await hasActiveConsent(tenantId, patientId);
  if (check.tableMissing || check.ok) return null;
  return 'Bệnh nhân chưa đồng ý sử dụng dữ liệu sinh trắc khuôn mặt. Vui lòng ghi nhận đồng ý trước khi đăng ký.';
}

/** Ghi nhận đồng ý (idempotent — bật lại nếu trước đó đã thu hồi). */
export async function grantConsent(
  tenantId: string,
  patientId: number,
  consentedBy: string | null,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('face_biometric_consent').upsert(
    {
      tenant_id: tenantId,
      patient_id: patientId,
      consented_by: consentedBy,
      consented_at: now,
      revoked_by: null,
      revoked_at: null,
      note: note ?? null,
      updated_at: now,
    },
    { onConflict: 'tenant_id,patient_id' }
  );
  if (error) return { ok: false, error: error.message };

  await logFaceAudit(tenantId, 'consent_grant', { patientId, actor: consentedBy });
  return { ok: true };
}

/** Thu hồi đồng ý. */
export async function revokeConsent(
  tenantId: string,
  patientId: number,
  revokedBy: string | null
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('face_biometric_consent')
    .update({ revoked_by: revokedBy, revoked_at: now, updated_at: now })
    .eq('tenant_id', tenantId)
    .eq('patient_id', patientId);
  if (error) return { ok: false, error: error.message };

  await logFaceAudit(tenantId, 'consent_revoke', { patientId, actor: revokedBy });
  return { ok: true };
}

export interface AuditMeta {
  patientId?: number | null;
  deviceId?: string | null;
  actor?: string | null;
  ip?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Ghi 1 dòng nhật ký kiểm toán. Không ném lỗi (best-effort) để không chặn nghiệp vụ chính.
 */
export async function logFaceAudit(
  tenantId: string,
  action: FaceAuditAction,
  meta: AuditMeta = {}
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('face_audit_log').insert({
      tenant_id: tenantId,
      patient_id: meta.patientId ?? null,
      device_id: meta.deviceId ?? null,
      actor: meta.actor ?? null,
      action,
      ip: meta.ip ?? null,
      detail: meta.detail ?? {},
    });
    if (error && !isMissingTable(error.message)) {
      console.warn('[face-audit] không ghi được log:', error.message);
    }
  } catch (err) {
    console.warn('[face-audit] lỗi ghi log:', err);
  }
}
