export const MEDIA_IMAGE_KINDS = ['don_kinh', 'gong_da_cat', 'ket_qua_khuc_xa'] as const;

export type MediaImageKind = (typeof MEDIA_IMAGE_KINDS)[number];

export const MEDIA_UPLOAD_STATUSES = ['pending', 'uploaded', 'failed'] as const;

export type MediaUploadStatus = (typeof MEDIA_UPLOAD_STATUSES)[number];

export const DEFAULT_MEDIA_BUCKET = 'don-kinh-media';
export const DEFAULT_MEDIA_MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
export const DEFAULT_MEDIA_UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DEFAULT_MEDIA_READ_URL_TTL_SECONDS = 15 * 60;
export const MAX_MEDIA_ITEMS_PER_PRESCRIPTION = 6;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const MEDIA_LIMIT_PER_KIND: Record<MediaImageKind, number> = {
  don_kinh: 5,
  gong_da_cat: 3,
  ket_qua_khuc_xa: 4,
};

export function normalizeMediaImageKind(value: unknown): MediaImageKind | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if ((MEDIA_IMAGE_KINDS as readonly string[]).includes(normalized)) {
    return normalized as MediaImageKind;
  }
  return null;
}

export function isAllowedImageMimeType(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase().split(';')[0].trim();
  return ALLOWED_IMAGE_MIME_TYPES.has(normalized);
}

export function getMediaLimitPerKind(kind: MediaImageKind): number {
  return MEDIA_LIMIT_PER_KIND[kind];
}
