// Quick test for JavaScript errors
console.log('🧪 Testing JavaScript execution...');

// Test if the page has any blocking errors
window.addEventListener('error', (e) => {
  console.error('🚨 JavaScript Error detected:', e.error);
  console.error('🚨 Error message:', e.message);
  console.error('🚨 Error source:', e.filename, 'line:', e.lineno);
});

// Test basic event handling
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOM loaded, testing event handlers...');
  
  // Add a test button to verify events work
  const testBtn = document.createElement('button');
  testBtn.innerHTML = '🧪 TEST BUTTON';
  testBtn.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background: green; color: white; padding: 10px; border: none; cursor: pointer;';
  testBtn.onclick = () => {
    alert('✅ JavaScript events are working!');
    console.log('✅ Test button clicked successfully');
  };
  document.body.appendChild(testBtn);
  
  console.log('✅ Test button added to page');
});

console.log('🏁 Debug script loaded');
