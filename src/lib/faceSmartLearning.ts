/**
 * Smart Learning — cập nhật centroid embedding qua EMA khi nhận diện thành công.
 * Tham khảo từ Nhan-dien/services/smart_learning_service.py
 */
import { supabaseAdmin } from './tenantApi';

const DEFAULT_CONFIG = {
  alpha: 0.15,
  minScoreToLearn: 0.55,
  maxScoreToLearn: 0.95,
  minDifference: 0.02,
  maxLearnsPerDay: 10,
  learnCooldownMinutes: 5,
  minLearnsForHighQuality: 10,
};

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) + 1e-8;
  return vec.map((v) => v / norm);
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function emaCentroid(oldVec: number[], newVec: number[], alpha: number): number[] {
  const oldNorm = normalize(oldVec);
  const newNorm = normalize(newVec);
  const blended = oldNorm.map((v, i) => alpha * newNorm[i] + (1 - alpha) * v);
  return normalize(blended);
}

function todayVN(): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return vn.toISOString().split('T')[0];
}

export interface SmartLearningResult {
  updated: boolean;
  reason: string;
}

export async function trySmartLearningUpdate(
  tenantId: string,
  patientId: number,
  newEmbedding: number[],
  recognitionScore: number
): Promise<SmartLearningResult> {
  if (!Array.isArray(newEmbedding) || newEmbedding.length < 128) {
    return { updated: false, reason: 'embedding không hợp lệ' };
  }

  const cfg = DEFAULT_CONFIG;

  if (recognitionScore < cfg.minScoreToLearn) {
    return { updated: false, reason: `score thấp (${recognitionScore.toFixed(3)})` };
  }
  if (recognitionScore > cfg.maxScoreToLearn) {
    return { updated: false, reason: 'score quá cao — có thể trùng khung hình' };
  }

  const { data: row, error } = await supabaseAdmin
    .from('face_embeddings')
    .select('embedding, embedding_count, quality_score, last_learned_at, learn_count_today, learn_date')
    .eq('tenant_id', tenantId)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (error?.message?.includes('embedding_count')) {
    return { updated: false, reason: 'chưa chạy migration V084' };
  }
  if (error || !row?.embedding) {
    return { updated: false, reason: 'không tìm thấy embedding' };
  }

  const currentEmbedding = row.embedding as number[];
  const learnCountToday =
    row.learn_date === todayVN() ? Number(row.learn_count_today || 0) : 0;

  if (learnCountToday >= cfg.maxLearnsPerDay) {
    return { updated: false, reason: 'đã học đủ lần trong ngày' };
  }

  if (row.last_learned_at) {
    const last = new Date(row.last_learned_at).getTime();
    const cooldownMs = cfg.learnCooldownMinutes * 60 * 1000;
    if (Date.now() - last < cooldownMs) {
      return { updated: false, reason: 'đang trong cooldown học' };
    }
  }

  const similarity = dot(normalize(newEmbedding), normalize(currentEmbedding));
  const difference = 1 - similarity;
  if (difference < cfg.minDifference) {
    return { updated: false, reason: 'embedding quá giống centroid hiện tại' };
  }

  const embeddingCount = Number(row.embedding_count || 1) + 1;
  const newCentroid = emaCentroid(currentEmbedding, newEmbedding, cfg.alpha);
  const newQuality = Math.min(
    0.95,
    0.5 + (embeddingCount / cfg.minLearnsForHighQuality) * 0.45
  );
  const now = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from('face_embeddings')
    .update({
      embedding: newCentroid,
      embedding_count: embeddingCount,
      quality_score: newQuality,
      last_learned_at: now,
      learn_count_today: learnCountToday + 1,
      learn_date: todayVN(),
      updated_at: now,
    })
    .eq('tenant_id', tenantId)
    .eq('patient_id', patientId);

  if (updateError) {
    return { updated: false, reason: updateError.message };
  }

  return { updated: true, reason: `đã cập nhật centroid (lần ${embeddingCount})` };
}
