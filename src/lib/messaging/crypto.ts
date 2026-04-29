/**
 * AES-256-GCM cho credential nhạy cảm (Zalo access_token, SMS API key, ...).
 * Khóa lấy từ ENV: MESSAGING_ENCRYPTION_KEY (base64, 32 bytes).
 * Nếu chưa cấu hình, hệ thống sẽ throw để tránh ghi plain text vào DB.
 */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.MESSAGING_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'MESSAGING_ENCRYPTION_KEY chưa được cấu hình. ' +
      'Hãy tạo bằng: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('MESSAGING_ENCRYPTION_KEY phải là 32 bytes (base64).');
  }
  cachedKey = buf;
  return buf;
}

export interface EncryptedPayload {
  iv: string;   // base64
  tag: string;  // base64
  data: string; // base64 ciphertext
  v: 1;
}

export function encryptString(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
    v: 1,
  };
}

export function decryptString(payload: EncryptedPayload): string {
  if (!payload || payload.v !== 1) throw new Error('Payload mã hóa không hợp lệ');
  const key = getKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

/** Tiện ích cho object credential (lưu nhiều field) */
export function encryptObject(obj: Record<string, unknown>): EncryptedPayload {
  return encryptString(JSON.stringify(obj));
}

export function decryptObject<T = Record<string, unknown>>(payload: EncryptedPayload): T {
  return JSON.parse(decryptString(payload)) as T;
}
