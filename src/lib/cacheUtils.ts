// Utility functions để xử lý cache và force refresh data

export const forceRefreshData = () => {
  console.log('🧹 Clearing browser cache...');
  
  // Clear browser cache
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        caches.delete(name);
        console.log(`🗑️ Deleted cache: ${name}`);
      });
    });
  }
  
  // Clear localStorage related to API
  const keysToRemove: string[] = [];
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('api_') || 
        key.startsWith('cache_') || 
        key.startsWith('supabase_') ||
        key.includes('kedon_') ||
        key.includes('bao-cao') ||
        key.includes('report')) {
      keysToRemove.push(key);
    }
  });
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    console.log(`🗑️ Removed localStorage: ${key}`);
  });
  
  // Clear sessionStorage 
  const sessionKeysToRemove: string[] = [];
  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith('api_') || 
        key.startsWith('cache_') || 
        key.startsWith('supabase_') ||
        key.includes('kedon_') ||
        key.includes('bao-cao') ||
        key.includes('report')) {
      sessionKeysToRemove.push(key);
    }
  });
  
  sessionKeysToRemove.forEach(key => {
    sessionStorage.removeItem(key);
    console.log(`🗑️ Removed sessionStorage: ${key}`);
  });
  
  console.log('✅ Cache clearing completed');
  return Promise.resolve();
};

// Function để force reload trang với cache clearing
export const forcePageReload = () => {
  console.log('🔄 Force reloading page with cache clear...');
  forceRefreshData();
  
  setTimeout(() => {
    // Use location.reload with forceReload = true
    if ('location' in window) {
      window.location.reload();
    }
  }, 500);
};

export const makeUncachedRequest = async (url: string, options: RequestInit = {}) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const separator = url.includes('?') ? '&' : '?';
  const uncachedUrl = `${url}${separator}_t=${timestamp}&_r=${random}`;
  
  console.log(`🔄 Making uncached request to: ${uncachedUrl}`);
  
  return fetch(uncachedUrl, {
    ...options,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'If-None-Match': '', // Disable ETag
      'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT', // Force fresh
      ...options.headers
    }
  });
};

export const debugCacheInfo = () => {
  console.log('🔍 Cache Debug Info:');
  console.log('📊 localStorage keys:', Object.keys(localStorage).length);
  console.log('📊 sessionStorage keys:', Object.keys(sessionStorage).length);
  
  if ('caches' in window) {
    caches.keys().then((names) => {
      console.log('📊 Browser caches:', names);
    });
  }
  
  // Log all relevant storage keys
  const relevantLocalKeys = Object.keys(localStorage).filter(key => 
    key.startsWith('api_') || key.startsWith('cache_') || 
    key.startsWith('supabase_') || key.includes('kedon_')
  );
  console.log('🔍 Relevant localStorage keys:', relevantLocalKeys);
  
  const relevantSessionKeys = Object.keys(sessionStorage).filter(key => 
    key.startsWith('api_') || key.startsWith('cache_') || 
    key.startsWith('supabase_') || key.includes('kedon_')
  );
  console.log('🔍 Relevant sessionStorage keys:', relevantSessionKeys);
};
