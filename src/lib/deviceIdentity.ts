const DEVICE_ID_KEY = 'kedonDeviceId';

function createRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2);
  return `dev_${Date.now().toString(36)}_${rand}`;
}

export function getOrCreateDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.trim()) return existing;
    const id = createRandomId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export function getDeviceLabel(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const ua = navigator.userAgent || '';
    const platform = (navigator.platform || '').trim();
    const lang = (navigator.language || '').trim();
    const parts = [platform, lang, ua.slice(0, 80)].filter(Boolean);
    return parts.join(' | ').slice(0, 200) || null;
  } catch {
    return null;
  }
}
