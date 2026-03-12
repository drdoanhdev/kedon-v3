import axios from 'axios';

const apiClient = axios.create({
  baseURL: '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Interceptor: chỉ thêm 1 timestamp param để tránh cache
apiClient.interceptors.request.use((config) => {
  const timestamp = Date.now();
  if (config.params) {
    config.params._t = timestamp;
  } else {
    config.params = { _t: timestamp };
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export default apiClient;
