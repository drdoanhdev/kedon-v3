/* eslint-disable */
import fs from 'fs';
import path from 'path';
import { createHash, createHmac } from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envText = fs.readFileSync(path.join(root, '.env'), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const AWS_V4_ALGORITHM = 'AWS4-HMAC-SHA256';
const AWS_V4_SERVICE = 's3';

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
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

function buildSignedUrl(method, { endpoint, bucket, objectPath, accessKeyId, secretAccessKey, region, contentType }) {
  const parsed = new URL(endpoint);
  const ep = { origin: parsed.origin, host: parsed.host, basePath: parsed.pathname.replace(/\/+$/, '') };
  const now = new Date();
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const amzDate = iso.slice(0, 15) + 'Z';
  const dateStamp = iso.slice(0, 8);
  const expires = 900;
  const baseSegments = ep.basePath ? ep.basePath.replace(/^\//, '').split('/').filter(Boolean).map(encodeRfc3986) : [];
  const canonicalUri = '/' + [...baseSegments, encodeRfc3986(bucket), ...objectPath.split('/').filter(Boolean).map(encodeRfc3986)].join('/');
  const headerMap = { host: ep.host.toLowerCase() };
  if (contentType) headerMap['content-type'] = contentType;
  const keys = Object.keys(headerMap).sort();
  const canonicalHeaders = keys.map((k) => `${k}:${headerMap[k]}\n`).join('');
  const signedHeaders = keys.join(';');
  const credentialScope = `${dateStamp}/${region}/${AWS_V4_SERVICE}/aws4_request`;
  const q = {
    'X-Amz-Algorithm': AWS_V4_ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.entries(q).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join('&');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = [AWS_V4_ALGORITHM, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), AWS_V4_SERVICE), 'aws4_request');
  const signature = hmacHex(signingKey, stringToSign);
  return `${ep.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

const cfg = {
  endpoint: process.env.R2_ENDPOINT,
  bucket: process.env.MEDIA_BUCKET_DON_KINH,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: process.env.R2_REGION || 'auto',
};

console.log('R2 endpoint:', cfg.endpoint);
console.log('Bucket:', cfg.bucket);

const testPath = `_diag/${Date.now()}.txt`;
const contentType = 'text/plain';
const putUrl = buildSignedUrl('PUT', { ...cfg, objectPath: testPath, contentType });
const putRes = await fetch(putUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: 'hello-r2' });
console.log('PUT', putRes.status, putRes.statusText);
if (!putRes.ok) console.log('PUT error:', (await putRes.text()).slice(0, 400));

const getUrl = buildSignedUrl('GET', { ...cfg, objectPath: testPath });
const getRes = await fetch(getUrl);
console.log('GET', getRes.status, await getRes.text());

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(
  `SELECT id, status, storage_driver, bucket, object_path, mime_type, created_at
   FROM don_kinh_media ORDER BY id DESC LIMIT 8`
);
console.log('\nRecent don_kinh_media:');
for (const r of rows) console.log(JSON.stringify({ ...r, object_path: r.object_path?.slice(0, 80) }));

const latest = rows[0];
if (latest?.status === 'failed' && latest.storage_driver === 'r2') {
  console.log('\nLatest FAILED — testing CORS preflight for browser PUT...');
  const putUrl2 = buildSignedUrl('PUT', {
    ...cfg,
    bucket: latest.bucket,
    objectPath: latest.object_path,
    contentType: latest.mime_type || 'image/jpeg',
  });
  const opt = await fetch(putUrl2.split('?')[0], {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:3000',
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  console.log('OPTIONS status:', opt.status);
  console.log('Access-Control-Allow-Origin:', opt.headers.get('access-control-allow-origin'));
  console.log('Access-Control-Allow-Methods:', opt.headers.get('access-control-allow-methods'));
}

await client.end();
