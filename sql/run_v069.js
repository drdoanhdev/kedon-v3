/* eslint-disable */
// Runner cho V069_create_family_groups.sql
// Cách dùng:
//   node sql/run_v069.js                          # dùng DATABASE_URL trong .env
//   node sql/run_v069.js "postgresql://..."       # truyền connection string
//   node sql/run_v069.js --with-seed              # chạy thêm V069b seed (chỉ dev)
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

const args = process.argv.slice(2);
const withSeed = args.includes('--with-seed');
const connectionString =
  args.find((a) => a.startsWith('postgres')) || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Thiếu DATABASE_URL. Đặt trong .env hoặc truyền tham số:');
  console.error('  node sql/run_v069.js "postgresql://..."');
  process.exit(1);
}

const sqlMain = fs.readFileSync(path.join(__dirname, 'V069_create_family_groups.sql'), 'utf8');
const sqlSeed = withSeed
  ? fs.readFileSync(path.join(__dirname, 'V069b_seed_family_groups_dev.sql'), 'utf8')
  : null;

const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await c.connect();
    console.log('▶ Đang chạy V069 (family_groups + family_members) ...');
    await c.query(sqlMain);
    console.log('✅ V069 OK — đã tạo bảng family_groups, family_members + RLS');

    // Kiểm tra
    const r = await c.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('family_groups','family_members')
      ORDER BY table_name
    `);
    console.log('Bảng tồn tại:', r.rows.map((x) => x.table_name));

    if (withSeed) {
      console.log('▶ Đang chạy V069b seed (dev) ...');
      // Note: V069b dùng psql \set; với node-pg ta lược bỏ dòng \set và để DO $$ tự fallback.
      const sqlSeedSanitized = sqlSeed
        .split(/\r?\n/)
        .filter((l) => !l.trim().startsWith('\\set'))
        .join('\n');
      await c.query(sqlSeedSanitized);
      console.log('✅ V069b OK (xem NOTICE phía trên để biết kết quả)');
    }
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
