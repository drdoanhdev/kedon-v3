import axios, { InternalAxiosRequestConfig } from 'axios';
import apiClient from './apiClient';
import { supabaseAuth } from './supabaseAuth';

let initialized = false;

const getCurrentTenantId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('currentTenantId');
};

const injectAuthHeaders = async (
  config: InternalAxiosRequestConfig
): Promise<InternalAxiosRequestConfig> => {
  if (typeof window === 'undefined') return config;

  const {
    data: { session },
  } = await supabaseAuth.auth.getSession();

  const token = session?.access_token;
  const tenantId = getCurrentTenantId();

  const headers = (config.headers || {}) as Record<string, string>;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  config.headers = headers;
  return config;
};

export const initializeApiAuthHeaders = (): void => {
  if (initialized || typeof window === 'undefined') return;

  axios.interceptors.request.use(injectAuthHeaders);
  apiClient.interceptors.request.use(injectAuthHeaders);

  initialized = true;
};