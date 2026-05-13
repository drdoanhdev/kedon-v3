import { createHash, createHmac } from 'crypto';
import { supabaseAdmin } from '../tenantApi';
import {
  DEFAULT_MEDIA_BUCKET,
  DEFAULT_MEDIA_READ_URL_TTL_SECONDS,
  DEFAULT_MEDIA_UPLOAD_URL_TTL_SECONDS,
} from './types';

export type MediaStorageDriver = 'supabase' | 'r2';

export interface MediaSignedUploadTarget {
  driver: MediaStorageDriver;
  bucket: string;
  path: string;
  signedUrl: string;
  token?: string;
  method: 'PUT';
  expiresInSeconds: number;
  contentType: string;
}

export interface MediaStorageProvider {
  readonly driver: MediaStorageDriver;
  readonly bucket: string;
  createSignedUpload(path: string, contentType: string): Promise<MediaSignedUploadTarget>;
  createSignedReadUrl(path: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(path: string): Promise<void>;
}

interface AwsSigV4Input {
  method: 'GET' | 'PUT' | 'DELETE';
  endpoint: string;
  bucket: string;
  objectPath: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  expiresInSeconds: number;
  contentType?: string;
}

interface AwsSigV4Endpoint {
  origin: string;
  host: string;
  basePath: string;
}

interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

const AWS_V4_ALGORITHM = 'AWS4-HMAC-SHA256';
const AWS_V4_SERVICE = 's3';
const MAX_PRESIGNED_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function toAmzDateParts(dt: Date): { amzDate: string; dateStamp: string } {
  const iso = dt.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso.slice(0, 15) + 'Z',
    dateStamp: iso.slice(0, 8),
  };
}

function sha256Hex(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacHex(key: Buffer | string, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function sanitizeObjectPath(path: string): string {
  return path.replace(/^\/+/, '').split('/').filter(Boolean).join('/');
}

function parseEndpoint(endpoint: string): AwsSigV4Endpoint {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('R2 endpoint khong hop le. Hay dat R2_ENDPOINT dung dinh dang https://...');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('R2 endpoint phai dung https');
  }

  const basePathRaw = parsed.pathname.replace(/\/+$/, '');
  const basePath = basePathRaw && basePathRaw !== '/' ? basePathRaw : '';

  return {
    origin: `${parsed.protocol}//${parsed.host}`,
    host: parsed.host,
    basePath,
  };
}

function buildCanonicalUri(endpoint: AwsSigV4Endpoint, bucket: string, objectPath: string): string {
  const baseSegments = endpoint.basePath
    ? endpoint.basePath.replace(/^\//, '').split('/').filter(Boolean).map(encodeRfc3986)
    : [];
  const bucketSegment = encodeRfc3986(bucket);
  const objectSegments = sanitizeObjectPath(objectPath)
    .split('/')
    .filter(Boolean)
    .map(encodeRfc3986);

  return '/' + [...baseSegments, bucketSegment, ...objectSegments].join('/');
}

function clampExpires(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MEDIA_UPLOAD_URL_TTL_SECONDS;
  return Math.max(1, Math.min(MAX_PRESIGNED_EXPIRES_SECONDS, Math.floor(value)));
}

function buildCanonicalQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join('&');
}

function buildSignedHeaders(
  host: string,
  contentType?: string
): { signedHeaders: string; canonicalHeaders: string } {
  const headerMap: Record<string, string> = {
    host: host.trim().toLowerCase(),
  };

  if (contentType) {
    headerMap['content-type'] = contentType.trim();
  }

  const keys = Object.keys(headerMap).sort();
  const canonicalHeaders = keys.map((k) => `${k}:${headerMap[k]}\n`).join('');
  const signedHeaders = keys.join(';');
  return { signedHeaders, canonicalHeaders };
}

function buildAwsV4SignedUrl(input: AwsSigV4Input): string {
  const endpoint = parseEndpoint(input.endpoint);
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDateParts(now);

  const canonicalUri = buildCanonicalUri(endpoint, input.bucket, input.objectPath);
  const { canonicalHeaders, signedHeaders } = buildSignedHeaders(endpoint.host, input.contentType);
  const expires = clampExpires(input.expiresInSeconds);

  const credentialScope = `${dateStamp}/${input.region}/${AWS_V4_SERVICE}/aws4_request`;
  const queryWithoutSignature: Record<string, string> = {
    'X-Amz-Algorithm': AWS_V4_ALGORITHM,
    'X-Amz-Credential': `${input.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders,
  };

  const canonicalQuery = buildCanonicalQuery(queryWithoutSignature);
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    AWS_V4_ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, AWS_V4_SERVICE);
  const signingKey = hmac(kService, 'aws4_request');
  const signature = hmacHex(signingKey, stringToSign);

  return `${endpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function resolveR2Config(): R2Config {
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const endpointRaw = (process.env.R2_ENDPOINT || '').trim();
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const region = (process.env.R2_REGION || 'auto').trim() || 'auto';

  const endpoint = endpointRaw || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      'Thieu cau hinh R2. Can dat R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY va R2_ENDPOINT (hoac R2_ACCOUNT_ID).'
    );
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    region,
  };
}

function createProvider(driver: MediaStorageDriver, bucket: string): MediaStorageProvider {
  return driver === 'r2'
    ? new R2MediaStorageProvider(bucket)
    : new SupabaseMediaStorageProvider(bucket);
}

class SupabaseMediaStorageProvider implements MediaStorageProvider {
  readonly driver: MediaStorageDriver = 'supabase';

  constructor(public readonly bucket: string) {}

  async createSignedUpload(path: string, contentType: string): Promise<MediaSignedUploadTarget> {
    const { data, error } = await supabaseAdmin.storage
      .from(this.bucket)
      .createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      throw new Error(`Khong tao duoc signed upload URL: ${error?.message || 'Unknown error'}`);
    }

    return {
      driver: this.driver,
      bucket: this.bucket,
      path: data.path || path,
      signedUrl: data.signedUrl,
      token: data.token,
      method: 'PUT',
      expiresInSeconds: DEFAULT_MEDIA_UPLOAD_URL_TTL_SECONDS,
      contentType,
    };
  }

  async createSignedReadUrl(path: string, expiresInSeconds = DEFAULT_MEDIA_READ_URL_TTL_SECONDS): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(`Khong tao duoc signed read URL: ${error?.message || 'Unknown error'}`);
    }

    return data.signedUrl;
  }

  async deleteObject(path: string): Promise<void> {
    const { error } = await supabaseAdmin.storage
      .from(this.bucket)
      .remove([path]);

    if (error && !/not found/i.test(error.message || '')) {
      throw new Error(`Khong xoa duoc object: ${error.message}`);
    }
  }
}

class R2MediaStorageProvider implements MediaStorageProvider {
  readonly driver: MediaStorageDriver = 'r2';

  constructor(public readonly bucket: string) {}

  private signedUrl(method: 'GET' | 'PUT' | 'DELETE', path: string, expiresInSeconds: number, contentType?: string): string {
    const cfg = resolveR2Config();
    return buildAwsV4SignedUrl({
      method,
      endpoint: cfg.endpoint,
      bucket: this.bucket,
      objectPath: path,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      expiresInSeconds,
      contentType,
    });
  }

  async createSignedUpload(path: string, contentType: string): Promise<MediaSignedUploadTarget> {
    const signedUrl = this.signedUrl('PUT', path, DEFAULT_MEDIA_UPLOAD_URL_TTL_SECONDS, contentType);
    return {
      driver: this.driver,
      bucket: this.bucket,
      path,
      signedUrl,
      method: 'PUT',
      expiresInSeconds: DEFAULT_MEDIA_UPLOAD_URL_TTL_SECONDS,
      contentType,
    };
  }

  async createSignedReadUrl(path: string, expiresInSeconds = DEFAULT_MEDIA_READ_URL_TTL_SECONDS): Promise<string> {
    return this.signedUrl('GET', path, expiresInSeconds);
  }

  async deleteObject(path: string): Promise<void> {
    const signedUrl = this.signedUrl('DELETE', path, 300);
    const res = await fetch(signedUrl, { method: 'DELETE' });
    if (res.ok || res.status === 404) return;

    let details = '';
    try {
      details = await res.text();
    } catch {
      details = '';
    }
    throw new Error(`Khong xoa duoc object tren R2 (${res.status})${details ? `: ${details}` : ''}`);
  }
}

let cachedProvider: MediaStorageProvider | null = null;
let cachedProviderKey = '';

function resolveDriver(): MediaStorageDriver {
  const raw = (process.env.MEDIA_STORAGE_DRIVER || 'supabase').trim().toLowerCase();
  return raw === 'r2' ? 'r2' : 'supabase';
}

function resolveBucket(): string {
  const raw = process.env.MEDIA_BUCKET_NAME?.trim();
  return raw || DEFAULT_MEDIA_BUCKET;
}

export function getMediaStorageProvider(): MediaStorageProvider {
  const driver = resolveDriver();
  const bucket = resolveBucket();
  const key = `${driver}:${bucket}`;

  if (cachedProvider && cachedProviderKey === key) {
    return cachedProvider;
  }

  cachedProvider = createProvider(driver, bucket);
  cachedProviderKey = key;

  return cachedProvider;
}

export function getMediaStorageProviderForRow(driverRaw: unknown, bucketRaw: unknown): MediaStorageProvider {
  const driver = typeof driverRaw === 'string' && driverRaw.trim().toLowerCase() === 'r2'
    ? 'r2'
    : 'supabase';
  const bucket = typeof bucketRaw === 'string' && bucketRaw.trim()
    ? bucketRaw.trim()
    : resolveBucket();

  return createProvider(driver, bucket);
}
