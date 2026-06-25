/* eslint-disable */
/**
 * Copy ảnh media từ Supabase Storage sang Cloudflare R2.
 *
 * Cách dùng:
 *   node scripts/migrate-media-to-r2.mjs --dry-run
 *   node scripts/migrate-media-to-r2.mjs --limit=50
 *   node scripts/migrate-media-to-r2.mjs --table=don_kinh_media
 *
 * Cần .env: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT (hoặc R2_ACCOUNT_ID)
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

const MEDIA_TABLES = ['don_kinh_media', 'gong_kinh_media', 'don_thuoc_media'];
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const tableArg = args.find((a) => a.startsWith('--table='));
const limit = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : 200;
const tableFilter = tableArg ? tableArg.split('=')[1] : null;

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

function buildCanonicalUri(endpoint, bucket, objectPath) {
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

function buildSignedPutUrl({ endpoint, bucket, objectPath, accessKeyId, secretAccessKey, region, contentType }) {
  const ep = parseEndpoint(endpoint);
  const now = new Date();
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const amzDate = iso.slice(0, 15) + 'Z';
  const dateStamp = iso.slice(0, 8);
  const expires = 900;

  const canonicalUri = buildCanonicalUri(ep, bucket, objectPath);
  const headerMap = {
    host: ep.host.trim().toLowerCase(),
    'content-type': contentType.trim(),
  };
  const keys = Object.keys(headerMap).sort();
  const canonicalHeaders = keys.map((k) => `${k}:${headerMap[k]}\n`).join('');
  const signedHeaders = keys.join(';');
  const credentialScope = `${dateStamp}/${region}/${AWS_V4_SERVICE}/aws4_request`;
  const queryWithoutSignature = {
    'X-Amz-Algorithm': AWS_V4_ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.entries(queryWithoutSignature)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join('&');
  const canonicalRequest = [
    'PUT',
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
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, AWS_V4_SERVICE);
  const signingKey = hmac(kService, 'aws4_request');
  const signature = hmacHex(signingKey, stringToSign);
  return `${ep.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function resolveR2Config() {
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const endpointRaw = (process.env.R2_ENDPOINT || '').trim();
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const region = (process.env.R2_REGION || 'auto').trim() || 'auto';
  const endpoint = endpointRaw || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error('Thiếu R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT (hoặc R2_ACCOUNT_ID)');
  }
  return { accessKeyId, secretAccessKey, endpoint, region };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!connectionString || !supabaseUrl || !supabaseKey) {
    throw new Error('Thiếu DATABASE_URL, SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  }

  const r2 = resolveR2Config();
  const supabase = createClient(supabaseUrl, supabaseKey);
  const pg = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const tables = tableFilter ? [tableFilter] : MEDIA_TABLES;
  let migrated = 0;
  let failed = 0;
  let skipped = 0;

  for (const table of tables) {
    if (!MEDIA_TABLES.includes(table)) {
      console.warn(`Bỏ qua bảng không hỗ trợ: ${table}`);
      continue;
    }

    const { rows } = await pg.query(
      `SELECT id, bucket, object_path, mime_type, storage_driver, status
       FROM ${table}
       WHERE storage_driver = 'supabase' AND status = 'uploaded'
       ORDER BY id ASC
       LIMIT $1`,
      [limit]
    );

    console.log(`\n[${table}] ${rows.length} bản ghi cần migrate`);

    for (const row of rows) {
      const contentType = row.mime_type || 'image/jpeg';
      const label = `${table}#${row.id} ${row.bucket}/${row.object_path}`;

      try {
        if (dryRun) {
          console.log(`  [dry-run] ${label}`);
          skipped += 1;
          continue;
        }

        const { data: blob, error: downloadError } = await supabase.storage
          .from(row.bucket)
          .download(row.object_path);

        if (downloadError || !blob) {
          throw new Error(downloadError?.message || 'Không tải được từ Supabase');
        }

        const buffer = Buffer.from(await blob.arrayBuffer());
        const signedUrl = buildSignedPutUrl({
          endpoint: r2.endpoint,
          bucket: row.bucket,
          objectPath: row.object_path,
          accessKeyId: r2.accessKeyId,
          secretAccessKey: r2.secretAccessKey,
          region: r2.region,
          contentType,
        });

        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: buffer,
        });

        if (!uploadRes.ok) {
          const details = await uploadRes.text().catch(() => '');
          throw new Error(`Upload R2 thất bại (${uploadRes.status})${details ? `: ${details}` : ''}`);
        }

        await pg.query(
          `UPDATE ${table}
           SET storage_driver = 'r2', updated_at = now()
           WHERE id = $1`,
          [row.id]
        );

        console.log(`  OK ${label} (${buffer.length} bytes)`);
        migrated += 1;
      } catch (error) {
        failed += 1;
        console.error(`  FAIL ${label}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  await pg.end();
  console.log(`\nHoàn tất. migrated=${migrated}, failed=${failed}, skipped=${skipped}${dryRun ? ' (dry-run)' : ''}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
