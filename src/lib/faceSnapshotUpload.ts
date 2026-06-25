import { randomUUID } from 'crypto';
import { getMediaStorageProvider, getMediaStorageProviderForRow } from './media/storage';
import { resolveMediaBucket } from './media/types';

const SNAPSHOT_PREFIX = 'storage://don_thuoc/';
const INLINE_PREFIX = 'inline://jpeg/';
const MAX_INLINE_BYTES = 400 * 1024;

export function isStoredSnapshotRef(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(SNAPSHOT_PREFIX);
}

export function isInlineSnapshotRef(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(INLINE_PREFIX);
}

export function stripSnapshotRef(value: string): string {
  return value.startsWith(SNAPSHOT_PREFIX) ? value.slice(SNAPSHOT_PREFIX.length) : value;
}

export async function uploadPendingFaceSnapshot(
  tenantId: string,
  jpegBuffer: Buffer
): Promise<string> {
  const provider = getMediaStorageProvider('don_thuoc');
  const token = randomUUID().replace(/-/g, '');
  const objectPath = `tenant/${tenantId}/face-pending/${token}.jpg`;
  await provider.putObject(objectPath, jpegBuffer, 'image/jpeg');
  return `${SNAPSHOT_PREFIX}${objectPath}`;
}

/** Cloud upload; fallback lưu base64 trong DB khi dev/local chưa cấu hình R2. */
export async function storePendingFaceSnapshot(
  tenantId: string,
  jpegBuffer: Buffer
): Promise<string | null> {
  if (!jpegBuffer.length) return null;

  for (const driver of ['r2', 'supabase'] as const) {
    try {
      const bucket = resolveMediaBucket('don_thuoc');
      const provider = getMediaStorageProviderForRow(driver, bucket);
      const token = randomUUID().replace(/-/g, '');
      const objectPath = `tenant/${tenantId}/face-pending/${token}.jpg`;
      await provider.putObject(objectPath, jpegBuffer, 'image/jpeg');
      return `${SNAPSHOT_PREFIX}${objectPath}`;
    } catch (err) {
      console.warn(`pending face snapshot upload (${driver}) failed:`, err);
    }
  }

  if (jpegBuffer.length > MAX_INLINE_BYTES) {
    console.warn(`pending face snapshot too large for inline (${jpegBuffer.length} bytes)`);
    return null;
  }

  return `${INLINE_PREFIX}${jpegBuffer.toString('base64')}`;
}

export async function readSnapshotJpeg(snapshotRef: string | null | undefined): Promise<Buffer | null> {
  if (!snapshotRef) return null;

  if (snapshotRef.startsWith('data:image/')) {
    const comma = snapshotRef.indexOf(',');
    if (comma < 0) return null;
    return Buffer.from(snapshotRef.slice(comma + 1), 'base64');
  }

  if (isInlineSnapshotRef(snapshotRef)) {
    return Buffer.from(snapshotRef.slice(INLINE_PREFIX.length), 'base64');
  }

  if (isStoredSnapshotRef(snapshotRef)) {
    const path = stripSnapshotRef(snapshotRef);
    for (const driver of ['r2', 'supabase'] as const) {
      try {
        const bucket = resolveMediaBucket('don_thuoc');
        const provider = getMediaStorageProviderForRow(driver, bucket);
        const signedUrl = await provider.createSignedReadUrl(path, 120);
        const res = await fetch(signedUrl);
        if (!res.ok) continue;
        return Buffer.from(await res.arrayBuffer());
      } catch {
        // thử driver kế tiếp
      }
    }
  }

  if (snapshotRef.startsWith('http://') || snapshotRef.startsWith('https://')) {
    try {
      const res = await fetch(snapshotRef);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  return null;
}

export async function resolveSnapshotDisplayUrl(
  snapshotRef: string | null | undefined
): Promise<string | null> {
  if (!snapshotRef) return null;

  if (
    snapshotRef.startsWith('http://') ||
    snapshotRef.startsWith('https://') ||
    snapshotRef.startsWith('data:')
  ) {
    return snapshotRef;
  }

  if (isInlineSnapshotRef(snapshotRef)) {
    const buf = await readSnapshotJpeg(snapshotRef);
    if (!buf) return null;
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  }

  if (!isStoredSnapshotRef(snapshotRef)) return snapshotRef;

  for (const driver of ['r2', 'supabase'] as const) {
    try {
      const bucket = resolveMediaBucket('don_thuoc');
      const provider = getMediaStorageProviderForRow(driver, bucket);
      return await provider.createSignedReadUrl(stripSnapshotRef(snapshotRef), 60 * 60);
    } catch {
      // thử driver kế tiếp
    }
  }

  return null;
}
