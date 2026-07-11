import { describe, expect, it } from 'vitest';
import { rateLimit, resetRateLimit } from './rateLimit';

describe('rateLimit', () => {
  it('cho phép trong giới hạn', () => {
    const key = `test-allow-${Date.now()}`;
    const r1 = rateLimit(key, 3, 60_000);
    const r2 = rateLimit(key, 3, 60_000);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
    resetRateLimit(key);
  });

  it('chặn khi vượt giới hạn', () => {
    const key = `test-block-${Date.now()}`;
    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);
    const r3 = rateLimit(key, 2, 60_000);
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfterSec).toBeGreaterThan(0);
    resetRateLimit(key);
  });

  it('reset xóa bộ đếm', () => {
    const key = `test-reset-${Date.now()}`;
    rateLimit(key, 1, 60_000);
    resetRateLimit(key);
    const again = rateLimit(key, 1, 60_000);
    expect(again.allowed).toBe(true);
    resetRateLimit(key);
  });
});
