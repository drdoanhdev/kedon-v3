import { getAuthHeaders } from '../fetchWithAuth';

export interface MediaUploadTarget {
  method?: 'PUT';
  signedUrl?: string;
  proxyUrl?: string;
  contentType?: string;
}

export async function uploadMediaBinary(
  uploadMeta: MediaUploadTarget,
  file: Blob,
  fallbackContentType = 'application/octet-stream'
): Promise<Response> {
  const targetUrl = uploadMeta.proxyUrl || uploadMeta.signedUrl;
  if (!targetUrl) {
    throw new Error('Không nhận được upload URL');
  }

  const contentType = uploadMeta.contentType || file.type || fallbackContentType;
  const authHeaders = await getAuthHeaders();
  delete authHeaders['Content-Type'];

  return fetch(targetUrl, {
    method: uploadMeta.method || 'PUT',
    headers: {
      ...authHeaders,
      'Content-Type': contentType,
    },
    body: file,
  });
}
