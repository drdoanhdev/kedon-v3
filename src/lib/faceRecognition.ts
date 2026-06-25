/**
 * Logic nghiệp vụ nhận diện khuôn mặt & check-in phòng chờ.
 */
import { supabaseAdmin } from './tenantApi';

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

export async function upsertFaceEmbedding(
  tenantId: string,
  patientId: number,
  embedding: number[]
): Promise<void> {
  if (!Array.isArray(embedding) || embedding.length < 128) {
    throw new Error('Embedding không hợp lệ');
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

  const now = new Date().toISOString();
  const baseRow = {
    tenant_id: tenantId,
    patient_id: patientId,
    embedding,
    model: 'insightface_arcface',
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
}
