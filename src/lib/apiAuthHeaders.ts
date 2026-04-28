import axios, { InternalAxiosRequestConfig } from 'axios';
import apiClient from './apiClient';
import { supabaseAuth } from './supabaseAuth';
import { getDeviceLabel, getOrCreateDeviceId } from './deviceIdentity';

let initialized = false;

// --- Cached session token ---
let cachedToken: string | null = null;
let cachedTokenExpiry = 0; // epoch seconds
const TOKEN_REFRESH_MARGIN = 60; // refresh 60s before expiry

const getCurrentTenantId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('currentTenantId');
};

const getCurrentBranchId = (tenantId: string | null): string | null => {
  if (typeof window === 'undefined' || !tenantId) return null;
  return localStorage.getItem(`currentBranchId_${tenantId}`);
};

const getCachedToken = async (): Promise<string | null> => {
  const now = Math.floor(Date.now() / 1000);
  // Return cached token if still valid (with margin)
  if (cachedToken && cachedTokenExpiry > now + TOKEN_REFRESH_MARGIN) {
    return cachedToken;
  }
  // Otherwise fetch fresh session
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (session) {
    cachedToken = session.access_token;
    cachedTokenExpiry = session.expires_at ?? 0;
  } else {
    cachedToken = null;
    cachedTokenExpiry = 0;
  }
  return cachedToken;
};

const injectAuthHeaders = async (
  config: InternalAxiosRequestConfig
): Promise<InternalAxiosRequestConfig> => {
  if (typeof window === 'undefined') return config;

  const token = await getCachedToken();
  const tenantId = getCurrentTenantId();
  const branchId = getCurrentBranchId(tenantId);

  const headers = (config.headers || {}) as Record<string, string>;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  if (branchId) {
    headers['x-branch-id'] = branchId;
  }

  const deviceId = getOrCreateDeviceId();
  if (deviceId) {
    headers['x-device-id'] = deviceId;
  }
  const deviceLabel = getDeviceLabel();
  if (deviceLabel) {
    headers['x-device-label'] = deviceLabel;
  }

  config.headers = headers;
  return config;
};

export const initializeApiAuthHeaders = (): void => {
  if (initialized || typeof window === 'undefined') return;

  axios.interceptors.request.use(injectAuthHeaders);
  apiClient.interceptors.request.use(injectAuthHeaders);

  // Proactively update cached token on auth state changes (login, logout, token refresh)
  supabaseAuth.auth.onAuthStateChange((_event, session) => {
    if (session) {
      cachedToken = session.access_token;
      cachedTokenExpiry = session.expires_at ?? 0;
    } else {
      cachedToken = null;
      cachedTokenExpiry = 0;
    }
  });

  initialized = true;
};