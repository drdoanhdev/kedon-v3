import axios from 'axios';

// Tạo axios instance với no-cache mặc định
const apiClient = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '' : '',
  timeout: 10000,
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Type': 'application/json',
    'If-None-Match': '', // Disable ETag caching
    'If-Modified-Since': '', // Disable last-modified caching
  }
});

// Interceptor để thêm timestamp cho mọi request
apiClient.interceptors.request.use((config) => {
  // Thêm timestamp và random để tránh cache
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  
  if (config.params) {
    config.params._t = timestamp;
    config.params._r = random;
    config.params._sid = sessionId;
    config.params._v = '2.0'; // Version để force refresh
  } else {
    config.params = { _t: timestamp, _r: random, _sid: sessionId, _v: '2.0' };
  }
  
  // Thêm headers để tránh cache ở browser
  config.headers = {
    ...config.headers,
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Cache-Buster': timestamp.toString(),
  };
  
  console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, {
    params: config.params,
    timestamp: new Date(timestamp).toLocaleTimeString(),
    cacheBuster: timestamp
  });
  
  return config;
});

// Interceptor để log response
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.config.url}`, {
      status: response.status,
      dataLength: response.data?.data?.length || 'N/A',
      timestamp: new Date().toLocaleTimeString()
    });
    return response;
  },
  (error) => {
    console.error(`❌ API Error: ${error.config?.url}`, {
      status: error.response?.status,
      message: error.message,
      timestamp: new Date().toLocaleTimeString()
    });
    return Promise.reject(error);
  }
);

export default apiClient;
