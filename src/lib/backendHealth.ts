type BackendHealthResponse = Pick<Response, 'ok' | 'status'>;

export type BackendHealthFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<BackendHealthResponse>;

export type BackendHealthResult = {
  healthy: boolean;
  available: boolean;
  status?: number;
};

type ProbeBackendHealthOptions = {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: BackendHealthFetch;
};

/**
 * Checks one backend endpoint without turning that result into device internet
 * state. `available` describes service availability; `healthy` is HTTP `ok`.
 */
export async function probeBackendHealth({
  url,
  headers,
  timeoutMs = 5000,
  fetchImpl = fetch,
}: ProbeBackendHealthOptions): Promise<BackendHealthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      headers,
    });

    return {
      healthy: response.ok,
      available: response.status < 500,
      status: response.status,
    };
  } catch {
    return {
      healthy: false,
      available: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}
