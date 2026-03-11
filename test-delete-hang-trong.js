// Quick manual test for DELETE /api/hang-trong
// Usage: node test-delete-hang-trong.js <id>
// Requires the Next.js dev server running on localhost:3000 and proper env with service role (for local testing only!)

const id = process.argv[2];
if (!id) {
  console.error('Provide id: node test-delete-hang-trong.js <id>');
  process.exit(1);
}

const url = `http://localhost:3000/api/hang-trong?id=${id}`;

async function run() {
  try {
    const res = await fetch(url, { method: 'DELETE' });
    const body = await res.json();
    console.log('Status:', res.status, body);
  } catch (e) {
    console.error('Request failed:', e);
  }
}

run();
