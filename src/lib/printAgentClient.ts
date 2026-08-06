/**
 * Client gọi Optigo Print Agent chạy trên máy cửa hàng (localhost).
 * Dùng khi web deploy trên app.optigo.vn — API cloud không thấy máy in USB.
 */

export const PRINT_AGENT_PORT = 9173;
export const PRINT_AGENT_BASE_URL = `http://127.0.0.1:${PRINT_AGENT_PORT}`;

export type PrintAgentHealth = {
  ok: boolean;
  name?: string;
  version?: string;
};

export type PrintAgentPrinters = {
  printers: string[];
  defaultPrinter: string | null;
};

export type PrintAgentBitmapPayload = {
  mode: 'bitmap';
  printerName: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  gapMm: number;
  speed: number;
  density: number;
  copies: number;
  bitmapOffsetXmm: number;
  bitmapOffsetYmm: number;
  widthBytes: number;
  heightDots: number;
  bitmapBase64: string;
};

function agentErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  if (error instanceof Error && error.message) {
    if (/Network Error|Failed to fetch|ECONNREFUSED/i.test(error.message)) {
      return 'Chưa chạy Optigo Print Agent trên máy này. Hãy mở file 1-Chay-agent.bat.';
    }
    return error.message;
  }
  return fallback;
}

async function agentFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${PRINT_AGENT_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof (data as { error?: string })?.error === 'string'
          ? (data as { error: string }).error
          : `Print Agent lỗi HTTP ${response.status}`;
      throw new Error(message);
    }
    return data as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function checkPrintAgent(): Promise<PrintAgentHealth | null> {
  try {
    const data = await agentFetch<PrintAgentHealth>('/health');
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

export async function listPrintAgentPrinters(): Promise<PrintAgentPrinters> {
  try {
    const data = await agentFetch<PrintAgentPrinters>('/printers');
    const printers = Array.isArray(data?.printers)
      ? data.printers.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : [];
    const defaultPrinter =
      typeof data?.defaultPrinter === 'string' && data.defaultPrinter.trim() ? data.defaultPrinter.trim() : null;
    return { printers, defaultPrinter };
  } catch (error) {
    throw new Error(agentErrorMessage(error, 'Không tải được danh sách máy in từ Print Agent.'));
  }
}

export async function printViaPrintAgent(payload: PrintAgentBitmapPayload): Promise<string> {
  try {
    const data = await agentFetch<{ message?: string }>('/print', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data?.message || `Đã gửi lệnh in trực tiếp tới ${payload.printerName}.`;
  } catch (error) {
    throw new Error(agentErrorMessage(error, 'In trực tiếp qua Print Agent thất bại.'));
  }
}
