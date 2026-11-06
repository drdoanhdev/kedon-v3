/* eslint-disable */
/**
 * Xóa snapshot khuôn mặt lạ (prefix tenant/*/face-pending/) trước khi chạy V094.
 *
 * Cách dùng:
 *   node scripts/purge-face-pending-storage.mjs --dry-run
 *   node scripts/purge-face-pending-storage.mjs
 *
 * Cần .env: DATABASE_URL (hoặc SUPABASE DB URL),
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT (hoặc R2_ACCOUNT_ID),
 * tùy chọn SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY để xóa trên bucket supabase.
 */
import fs from 'fs';
import path from 'path';
import { createHash, createHmac } from 'crypto';
import { fileURLToPath } from 'url';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

for (const envFile of ['.env', '.env.local']) {
  try {
    const env = fs.readFileSync(path.join(rootDir, envFile), 'utf8');
    env.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    });
  } catch {}
}

const dryRun = process.argv.includes('--dry-run');
const SNAPSHOT_PREFIX = 'storage://don_thuoc/';
const AWS_V4_ALGORITHM = 'AWS4-HMAC-SHA256';
const AWS_V4_SERVICE = 's3';

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
function sha256Hex(payload) {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
function hmac(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}
function hmacHex(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}
function sanitizeObjectPath(objectPath) {
  return objectPath.replace(/^\/+/, '').split('/').filter(Boolean).join('/');
}

function parseEndpoint(endpoint) {
  const parsed = new URL(endpoint);
  const basePathRaw = parsed.pathname.replace(/\/+$/, '');
  const basePath = basePathRaw && basePathRaw !== '/' ? basePathRaw : '';
  return {
    origin: `${parsed.protocol}//${parsed.host}`,
    host: parsed.host,
    basePath,
  };
}

function resolveR2() {
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const endpointRaw = (process.env.R2_ENDPOINT || '').trim();
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const region = (process.env.R2_REGION || 'auto').trim() || 'auto';
  const bucket = (process.env.R2_BUCKET_DON_THUOC || process.env.MEDIA_BUCKET_DON_THUOC || 'don_thuoc').trim();
  const endpoint = endpointRaw || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  if (!accessKeyId || !secretAccessKey || !endpoint) return null;
  return { accessKeyId, secretAccessKey, endpoint, region, bucket };
}

async function r2DeleteObject(cfg, objectPath) {
  const clean = sanitizeObjectPath(objectPath);
  const ep = parseEndpoint(cfg.endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${cfg.region}/${AWS_V4_SERVICE}/aws4_request`;
  const canonicalUri = `${ep.basePath}/${cfg.bucket}/${clean.split('/').map(encodeRfc3986).join('/')}`;
  const payloadHash = sha256Hex('');
  const canonicalHeaders = `host:${ep.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['DELETE', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = [AWS_V4_ALGORITHM, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, AWS_V4_SERVICE);
  const signingKey = hmac(kService, 'aws4_request');
  const signature = hmacHex(signingKey, stringToSign);
  const authorization =
    `${AWS_V4_ALGORITHM} Credential=${cfg.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`${ep.origin}${canonicalUri}`, {
    method: 'DELETE',
    headers: {
      Authorization: authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE ${clean} failed: ${res.status} ${await res.text()}`);
  }
}

function stripSnapshotRef(value) {
  return value.startsWith(SNAPSHOT_PREFIX) ? value.slice(SNAPSHOT_PREFIX.length) : value;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
  if (!dbUrl) {
    console.error('Thiếu DATABASE_URL (hoặc SUPABASE_DB_URL)');
    process.exit(1);
  }

  const r2 = resolveR2();
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let rows = [];
  try {
    const res = await client.query(
      `SELECT id, tenant_id, snapshot_url FROM "PendingFaces" WHERE snapshot_url IS NOT NULL`
    );
    rows = res.rows;
  } catch (err) {
    console.warn('Không đọc được PendingFaces (có thể đã drop):', err.message);
  }

  let deleted = 0;
  let skipped = 0;
  let failed = 0;
  const warnings = [];

  console.log(`Found ${rows.length} PendingFaces snapshot refs${dryRun ? ' (dry-run)' : ''}`);

  for (const row of rows) {
    const ref = row.snapshot_url;
    if (!ref || typeof ref !== 'string') {
      skipped += 1;
      continue;
    }
    if (!ref.startsWith(SNAPSHOT_PREFIX)) {
      skipped += 1; // inline / http — không cần xóa object
      continue;
    }
    const objectPath = stripSnapshotRef(ref);
    if (!objectPath.includes('/face-pending/')) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would delete ${objectPath}`);
      deleted += 1;
      continue;
    }

    let ok = false;
    if (r2) {
      try {
        await r2DeleteObject(r2, objectPath);
        ok = true;
      } catch (err) {
        warnings.push(`r2 ${objectPath}: ${err.message}`);
      }
    }
    if (!ok && supabase) {
      try {
        const { error } = await supabase.storage.from('don_thuoc').remove([objectPath]);
        if (error) throw error;
        ok = true;
      } catch (err) {
        warnings.push(`supabase ${objectPath}: ${err.message || err}`);
      }
    }
    if (ok) deleted += 1;
    else failed += 1;
  }

  await client.end();

  console.log(JSON.stringify({ deleted, skipped, failed, dryRun, warnings: warnings.slice(0, 20) }, null, 2));
  if (failed > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
