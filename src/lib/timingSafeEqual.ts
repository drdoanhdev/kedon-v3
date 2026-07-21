/**
 * So sánh chuỗi bí mật không bị timing side-channel.
 * Trả về false nếu độ dài khác nhau (không leak nội dung).
 */
import { timingSafeEqual } from 'crypto';

export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
