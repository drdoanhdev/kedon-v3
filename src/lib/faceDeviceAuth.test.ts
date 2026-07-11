import { describe, expect, it } from 'vitest';
import { generateDeviceToken, hashDeviceToken } from './faceDeviceAuth';

describe('faceDeviceAuth', () => {
  it('hash token ổn định', () => {
    const token = 'fd_abc123def456';
    expect(hashDeviceToken(token)).toBe(hashDeviceToken(token));
    expect(hashDeviceToken(token)).toHaveLength(64);
  });

  it('generateDeviceToken tạo token fd_ prefix', () => {
    const { token, hash, prefix } = generateDeviceToken();
    expect(token.startsWith('fd_')).toBe(true);
    expect(prefix).toBe(token.slice(0, 12));
    expect(hash).toBe(hashDeviceToken(token));
  });
});
