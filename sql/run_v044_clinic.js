const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/V044_backfill_branch_data.sql', 'utf8');

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Missing connection string.');
  console.error('Usage: node sql/run_v044_clinic.js "postgresql://..."');
  console.error('Or set DATABASE_URL in your environment.');
  process.exit(1);
}

const c = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

c.connect()
  .then(() => c.query(sql))
  .then(r => { console.log('V044 OK'); c.end(); })
  .catch(e => { console.error('V044 ERROR:', e.message); c.end(); process.exit(1); });
