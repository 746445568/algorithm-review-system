export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const data = await safeJson(response);
    throw new ApiError(data?.error || `请求失败：${response.status}`, response.status);
  }

  return response.json();
}

export const swrFetcher = <T,>(url: string) => apiFetch<T>(url);

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
