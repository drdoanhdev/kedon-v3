/**
 * Kiểm tra dịch vụ embedding InsightFace (chạy trên PC camera / agent).
 */
const DEFAULT_EMBEDDING_SERVICE = 'http://127.0.0.1:8765';

export function getEmbeddingServiceUrl(): string {
  return (process.env.FACE_EMBEDDING_SERVICE_URL || DEFAULT_EMBEDDING_SERVICE).replace(/\/$/, '');
}

export interface EmbeddingServiceHealth {
  ok: boolean;
  service_url: string;
  message: string;
}

export async function checkEmbeddingServiceHealth(): Promise<EmbeddingServiceHealth> {
  const serviceUrl = getEmbeddingServiceUrl();
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      return {
        ok: true,
        service_url: serviceUrl,
        message: 'Dịch vụ embedding sẵn sàng',
      };
    }
    return {
      ok: false,
      service_url: serviceUrl,
      message: `Dịch vụ embedding phản hồi lỗi (${response.status})`,
    };
  } catch {
    return {
      ok: false,
      service_url: serviceUrl,
      message:
        'Không kết nối được dịch vụ embedding. Trên PC camera chạy chay-agent.bat (port 8765).',
    };
  }
}
