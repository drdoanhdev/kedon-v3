import { randomUUID } from 'crypto';
import { getMediaStorageProvider } from './media/storage';

const SNAPSHOT_PREFIX = 'storage://don_thuoc/';

export function isStoredSnapshotRef(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(SNAPSHOT_PREFIX);
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

export async function resolveSnapshotDisplayUrl(
  snapshotRef: string | null | undefined
): Promise<string | null> {
  if (!snapshotRef) return null;
  if (snapshotRef.startsWith('http://') || snapshotRef.startsWith('https://') || snapshotRef.startsWith('data:')) {
    return snapshotRef;
  }
  if (!isStoredSnapshotRef(snapshotRef)) return snapshotRef;

  try {
    const provider = getMediaStorageProvider('don_thuoc');
    return await provider.createSignedReadUrl(stripSnapshotRef(snapshotRef), 60 * 60);
  } catch {
    return null;
  }
}
