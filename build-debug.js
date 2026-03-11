const { execSync } = require('child_process');

console.log('Starting build process...');

try {
  console.log('Running: npx next build');
  const output = execSync('npx next build', { 
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log('Build successful!');
  console.log(output);
} catch (error) {
  console.error('Build failed!');
  console.error('Error code:', error.status);
  console.error('Error output:', error.stderr);
  console.error('Standard output:', error.stdout);
  process.exit(1);
}
