/* eslint-disable */
// Đọc .env thủ công (không phụ thuộc dotenv)
const fs = require('fs');
const path = require('path');
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

const { Client } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, 'V052_create_messaging_automation.sql'), 'utf8');
const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Thiếu DATABASE_URL. Đặt trong .env hoặc truyền tham số:');
  console.error('  node sql/run_v052.js "postgresql://..."');
  process.exit(1);
}

const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await c.connect();
    console.log('▶ Đang chạy V052 ...');
    await c.query(sql);
    console.log('✅ V052 OK — đã tạo bảng messaging automation');

    // Kiểm tra
    const r = await c.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('clinic_messaging_channels','message_workflows','message_jobs','message_logs')
      ORDER BY table_name
    `);
    console.log('   Bảng tồn tại:', r.rows.map((x) => x.table_name).join(', '));
  } catch (e) {
    console.error('❌ V052 ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
