import { randomUUID } from 'crypto';
import type { MediaImageKind } from './types';

interface BuildPrescriptionMediaPathInput {
  tenantId: string;
  branchId: string | null;
  benhnhanId: number;
  prescriptionId: number;
  folderName: string;
  kind: MediaImageKind;
  mimeType: string;
  originalFilename?: string | null;
  capturedAt?: Date;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function normalizeMimeType(mimeType: string): string {
  return mimeType.toLowerCase().split(';')[0].trim();
}

function toPathSafeSegment(value: string): string {
  const normalized = value.toLowerCase().trim();
  const safe = normalized.replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return safe || 'unknown';
}

function extractFilenameExtension(originalFilename?: string | null): string | null {
  if (!originalFilename) return null;
  const base = originalFilename.trim().split('/').pop() || '';
  const match = base.match(/\.([a-zA-Z0-9]{2,8})$/);
  if (!match) return null;
  return match[1].toLowerCase();
}

function resolveFileExtension(mimeType: string, originalFilename?: string | null): string {
  const mapped = MIME_EXTENSION_MAP[normalizeMimeType(mimeType)];
  if (mapped) return mapped;

  const fromName = extractFilenameExtension(originalFilename);
  if (fromName) return fromName;

  return 'jpg';
}

function resolveCapturedAt(capturedAt?: Date): Date {
  if (!capturedAt) return new Date();
  if (Number.isNaN(capturedAt.getTime())) return new Date();
  return capturedAt;
}

function buildPrescriptionMediaObjectPath(input: BuildPrescriptionMediaPathInput): string {
  const capturedAt = resolveCapturedAt(input.capturedAt);
  const year = String(capturedAt.getUTCFullYear());
  const month = String(capturedAt.getUTCMonth() + 1).padStart(2, '0');

  const extension = resolveFileExtension(input.mimeType, input.originalFilename);
  const token = randomUUID().replace(/-/g, '');

  const tenantSegment = toPathSafeSegment(input.tenantId);
  const branchSegment = input.branchId ? toPathSafeSegment(input.branchId) : 'unassigned';

  return [
    `tenant/${tenantSegment}`,
    `branch/${branchSegment}`,
    `benhnhan/${input.benhnhanId}`,
    `${input.folderName}/${input.prescriptionId}`,
    input.kind,
    year,
    month,
    `${token}.${extension}`,
  ].join('/');
}

export function buildDonKinhMediaObjectPath(input: Omit<BuildPrescriptionMediaPathInput, 'folderName' | 'prescriptionId'> & { donKinhId: number }): string {
  return buildPrescriptionMediaObjectPath({
    ...input,
    folderName: 'donkinh',
    prescriptionId: input.donKinhId,
  });
}

export function buildDonThuocMediaObjectPath(input: Omit<BuildPrescriptionMediaPathInput, 'folderName' | 'prescriptionId'> & { donThuocId: number }): string {
  return buildPrescriptionMediaObjectPath({
    ...input,
    folderName: 'donthuoc',
    prescriptionId: input.donThuocId,
  });
}
