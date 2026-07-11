/**
 * Rate limiter đơn giản (in-memory, fixed window) cho các API nhạy cảm
 * như ghép nối thiết bị và xác thực device token.
 *
 * Lưu ý: bộ nhớ theo tiến trình — trên môi trường serverless nhiều instance,
 * giới hạn áp dụng theo từng instance. Đủ để chặn brute-force cơ bản và
 * đồng bộ với cách các cache in-memory khác trong tenantApi.ts.
 */
import type { NextApiRequest } from 'next';

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowState>();

let lastSweep = 0;
const SWEEP_INTERVAL = 60_000;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL) return;
  lastSweep = now;
  for (const [key, state] of buckets) {
    if (state.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Ghi nhận 1 lượt truy cập và kiểm tra giới hạn.
 * @param key Khóa định danh (vd `pair:1.2.3.4`)
 * @param limit Số lượt tối đa trong cửa sổ
 * @param windowMs Độ dài cửa sổ (ms)
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const state = buckets.get(key);
  if (!state || state.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (state.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
    };
  }

  state.count += 1;
  return { allowed: true, remaining: limit - state.count, retryAfterSec: 0 };
}

/** Xóa bộ đếm cho 1 khóa (vd sau khi xác thực thành công). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Lấy IP client từ header proxy (Vercel) — dùng làm khóa rate-limit. */
export function getRateLimitIp(req: NextApiRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const forwarded = Array.isArray(xff) ? xff[0] : xff;
  const candidate =
    forwarded?.split(',')[0]?.trim() ||
    (Array.isArray(req.headers['x-real-ip'])
      ? req.headers['x-real-ip'][0]
      : req.headers['x-real-ip']
    )?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  return candidate.replace(/^::ffff:/, '').trim();
}
