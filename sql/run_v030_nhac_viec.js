const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
// Load .env manually
try {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  });
} catch {}

const connectionString = process.argv[2] || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Thiếu DATABASE_URL. Đặt trong .env hoặc truyền tham số:');
  console.error('  node sql/run_v030_nhac_viec.js "postgresql://..."');
  process.exit(1);
}

const sql = fs.readFileSync(path.join(__dirname, 'V030_create_nhac_viec.sql'), 'utf8');
const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await c.connect();
    console.log('▶ Đang chạy V030 ...');
    await c.query(sql);
    console.log('✅ V030 OK — đã tạo bảng nhac_viec');
    const r = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='nhac_viec'`);
    console.log('   Bảng tồn tại:', r.rows.length > 0 ? 'nhac_viec ✓' : 'KHÔNG TÌM THẤY ✗');
  } catch (e) {
    console.error('❌ V030 ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();

