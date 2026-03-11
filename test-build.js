const { execSync } = require('child_process');

try {
  console.log('🚀 Starting build process...');
  const output = execSync('npm run build', { 
    encoding: 'utf8',
    cwd: process.cwd(),
    stdio: 'pipe'
  });
  console.log('✅ Build successful!');
  console.log(output);
} catch (error) {
  console.error('❌ Build failed:');
  console.error('STDOUT:', error.stdout);
  console.error('STDERR:', error.stderr);
  console.error('Error:', error.message);
  process.exit(1);
}
