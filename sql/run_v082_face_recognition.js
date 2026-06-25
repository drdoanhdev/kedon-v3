/**
 * Chạy V082_face_recognition_saas.sql
 *
 * node sql/run_v082_face_recognition.js "postgresql://..."
 * hoặc: DATABASE_URL=... node sql/run_v082_face_recognition.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Thiếu DATABASE_URL hoặc connection string argument');
  process.exit(1);
}

async function run() {
  const sqlPath = path.join(__dirname, 'V082_face_recognition_saas.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✅ Connected. Running V082...');
    await client.query(sql);
    console.log('✅ V082_face_recognition_saas applied.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
