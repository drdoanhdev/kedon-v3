/**
 * Logic nghiệp vụ nhận diện khuôn mặt & check-in phòng chờ.
 */
import { supabaseAdmin } from './tenantApi';
import { assertConsentForEnroll, logFaceAudit } from './faceBiometricGovernance';
import { deletePendingFaceSnapshot } from './faceSnapshotUpload';

/**
 * Ngưỡng tin cậy tối thiểu để tự động check-in bằng khuôn mặt.
 * Đồng bộ với `match_threshold` mặc định trong services/face-agent/config.example.json.
 * Dưới ngưỡng này, rủi ro nhận nhầm bệnh nhân tăng đáng kể (ArcFace cosine similarity).
 */
export const MIN_CHECKIN_CONFIDENCE = 0.5;

/** Chiều dài vector embedding của InsightFace buffalo_l / ArcFace. */
export const FACE_EMBEDDING_DIM = 512;

export const FACE_EMBEDDING_MODEL = 'insightface_arcface';

/**
 * Kiểm tra embedding hợp lệ (đúng model buffalo_l, không NaN/Infinity).
 * Trả về thông báo lỗi hoặc null nếu OK.
 */
export function validateFaceEmbedding(embedding: unknown): string | null {
  if (!Array.isArray(embedding)) {
    return 'Embedding phải là mảng số';
  }
  if (embedding.length !== FACE_EMBEDDING_DIM) {
    return `Embedding phải có ${FACE_EMBEDDING_DIM} chiều (buffalo_l), nhận được ${embedding.length}`;
  }
  for (let i = 0; i < embedding.length; i++) {
    const v = embedding[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return `Embedding chứa giá trị không hợp lệ tại vị trí ${i}`;
    }
  }
  return null;
}

function getTodayStartVN(): string {
  const now = new Date();
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const vnDateStr = vnNow.toISOString().split('T')[0];
  return new Date(`${vnDateStr}T00:00:00+07:00`).toISOString();
}

export interface CheckInParams {
  tenantId: string;
  branchId: string | null;
  patientId: number;
  avatar?: string | null;
  source?: string;
}

export interface CheckInResult {
  success: boolean;
  status: 'added_to_queue' | 'already_in_queue' | 'patient_not_found';
  message: string;
  data?: Record<string, unknown>;
}

export async function checkInPatientToQueue(params: CheckInParams): Promise<CheckInResult> {
  const { tenantId, branchId, patientId, avatar } = params;
  const supabase = supabaseAdmin;

  const { data: patient, error: patientError } = await supabase
    .from('BenhNhan')
    .select('id, ten, dienthoai')
    .eq('id', patientId)
    .eq('tenant_id', tenantId)
    .single();

  if (patientError || !patient) {
    return {
      success: false,
      status: 'patient_not_found',
      message: `Bệnh nhân #${patientId} không thuộc phòng khám này`,
    };
  }

  const todayStart = getTodayStartVN();

  let existingQuery = supabase
    .from('ChoKham')
    .select('id, thoigian')
    .eq('benhnhanid', patientId)
    .eq('tenant_id', tenantId)
    .gte('thoigian', todayStart)
    .in('trangthai', ['chờ', 'đang_khám']);

  if (branchId) {
    existingQuery = existingQuery.eq('branch_id', branchId);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    if (avatar) {
      await supabase.from('ChoKham').update({ avatar_url: avatar }).eq('id', existing.id);
    }
    return {
      success: true,
      status: 'already_in_queue',
      message: `${patient.ten} đã có trong danh sách chờ`,
      data: {
        patient_id: patient.id,
        name: patient.ten,
        queue_id: existing.id,
      },
    };
  }

  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const thoigianVN = vnNow.toISOString().replace('Z', '+07:00');

  const checkInSource = params.source || null;

  const insertPayload: Record<string, unknown> = {
    benhnhanid: patientId,
    thoigian: thoigianVN,
    trangthai: 'chờ',
    done_at: null,
    avatar_url: avatar || null,
    tenant_id: tenantId,
    ...(branchId ? { branch_id: branchId } : {}),
  };
  if (checkInSource) insertPayload.check_in_source = checkInSource;

  let { data: newRecord, error: insertError } = await supabase
    .from('ChoKham')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError?.message?.includes('check_in_source')) {
    delete insertPayload.check_in_source;
    const retry = await supabase.from('ChoKham').insert(insertPayload).select().single();
    newRecord = retry.data;
    insertError = retry.error;
  }

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    success: true,
    status: 'added_to_queue',
    message: `Đã thêm ${patient.ten} vào danh sách chờ khám`,
    data: {
      patient_id: patient.id,
      name: patient.ten,
      phone: patient.dienthoai,
      queue_id: newRecord.id,
      received_at: new Date().toISOString(),
    },
  };
}

export interface UpsertEmbeddingOptions {
  /** Bỏ qua kiểm tra đồng ý (chỉ dùng cho luồng nội bộ đã kiểm tra trước). */
  skipConsent?: boolean;
  /** Thông tin phục vụ nhật ký kiểm toán. */
  actor?: string | null;
  ip?: string | null;
  deviceId?: string | null;
  source?: string;
}

export async function upsertFaceEmbedding(
  tenantId: string,
  patientId: number,
  embedding: number[],
  options: UpsertEmbeddingOptions = {}
): Promise<void> {
  const embeddingError = validateFaceEmbedding(embedding);
  if (embeddingError) {
    throw new Error(embeddingError);
  }

  const { data: patient } = await supabaseAdmin
    .from('BenhNhan')
    .select('id')
    .eq('id', patientId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!patient) {
    throw new Error('Bệnh nhân không thuộc phòng khám này');
  }

  if (!options.skipConsent) {
    const consentError = await assertConsentForEnroll(tenantId, patientId);
    if (consentError) {
      throw new Error(consentError);
    }
  }

  const now = new Date().toISOString();
  const baseRow = {
    tenant_id: tenantId,
    patient_id: patientId,
    embedding,
    model: FACE_EMBEDDING_MODEL,
    updated_at: now,
  };
  const extendedRow = {
    ...baseRow,
    embedding_count: 1,
    quality_score: 0.5,
    learn_count_today: 0,
    learn_date: now.split('T')[0],
  };

  let { error } = await supabaseAdmin
    .from('face_embeddings')
    .upsert(extendedRow, { onConflict: 'tenant_id,patient_id' });

  if (error?.message?.includes('embedding_count')) {
    ({ error } = await supabaseAdmin
      .from('face_embeddings')
      .upsert(baseRow, { onConflict: 'tenant_id,patient_id' }));
  }

  if (error) throw new Error(error.message);

  await logFaceAudit(tenantId, 'enroll', {
    patientId,
    actor: options.actor ?? null,
    ip: options.ip ?? null,
    deviceId: options.deviceId ?? null,
    detail: { source: options.source ?? 'unknown', dim: embedding.length },
  });
}

export interface DeleteBiometricsOptions {
  actor?: string | null;
  reason?: string;
}

export interface DeleteBiometricsResult {
  embeddingsDeleted: number;
  pendingDeleted: number;
}

/**
 * Xóa toàn bộ dữ liệu sinh trắc của 1 bệnh nhân: embedding + pending faces (kèm snapshot).
 * Dùng khi bệnh nhân rút đồng ý hoặc bị xóa hồ sơ.
 */
export async function deleteFaceBiometrics(
  tenantId: string,
  patientId: number,
  options: DeleteBiometricsOptions = {}
): Promise<DeleteBiometricsResult> {
  const { data: deletedEmbeddings } = await supabaseAdmin
    .from('face_embeddings')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('patient_id', patientId)
    .select('id');

  // Pending faces đã gán cho bệnh nhân này — xóa kèm snapshot storage.
  const { data: pendingRows } = await supabaseAdmin
    .from('PendingFaces')
    .select('id, snapshot_url')
    .eq('tenant_id', tenantId)
    .eq('assigned_to', patientId);

  let pendingDeleted = 0;
  if (pendingRows && pendingRows.length > 0) {
    for (const row of pendingRows) {
      await deletePendingFaceSnapshot(row.snapshot_url as string | null);
    }
    const { data: deletedPending } = await supabaseAdmin
      .from('PendingFaces')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('assigned_to', patientId)
      .select('id');
    pendingDeleted = deletedPending?.length || 0;
  }

  await logFaceAudit(tenantId, 'delete', {
    patientId,
    actor: options.actor ?? null,
    detail: {
      reason: options.reason ?? 'manual',
      embeddings: deletedEmbeddings?.length || 0,
      pending: pendingDeleted,
    },
  });

  return {
    embeddingsDeleted: deletedEmbeddings?.length || 0,
    pendingDeleted,
  };
}
