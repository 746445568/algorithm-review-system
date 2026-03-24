const DEFAULT_BASE_URL = "http://127.0.0.1:38473";
const REQUEST_TIMEOUT_MS = 10000;

export function normalizeBaseUrl(nextBase) {
  if (!nextBase) {
    return DEFAULT_BASE_URL;
  }

  return nextBase.endsWith("/") ? nextBase.slice(0, -1) : nextBase;
}

export function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(path, normalizeBaseUrl(baseUrl));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function requestJson(baseUrl, pathOrUrl, options = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${normalizedBaseUrl}${pathOrUrl}`;
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      ...options,
      signal,
    });
  } catch (error) {
    if (timeoutController.signal.aborted && !options.signal?.aborted) {
      throw new Error(`request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function parseErrorMessage(response) {
  const fallback = `${response.status} ${response.statusText}`;

  try {
    const body = await response.json();
    if (typeof body?.error === "string" && body.error.trim()) {
      return body.error;
    }
    if (typeof body?.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function isNetworkError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("request timed out")
  );
}

export { DEFAULT_BASE_URL, REQUEST_TIMEOUT_MS };
