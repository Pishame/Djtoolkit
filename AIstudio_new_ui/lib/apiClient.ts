type JsonRecord = Record<string, unknown>;

export const API_BASE_URL: string = String(
  (import.meta as any).env?.VITE_API_BASE_URL || 'https://dj-toolkit-secure-api.onrender.com'
).trim();
const serverEnabledFromBase = /^https?:\/\//i.test(API_BASE_URL) || API_BASE_URL.startsWith('/');
export const ENABLE_SERVER_AUTH = String((import.meta as any).env?.VITE_ENABLE_SERVER_AUTH || '').trim() === '1' || serverEnabledFromBase;
export const ENABLE_SERVER_SPOTIFY = String((import.meta as any).env?.VITE_ENABLE_SERVER_SPOTIFY || '').trim() === '1' || serverEnabledFromBase;
export const ENABLE_SERVER_BILLING = String((import.meta as any).env?.VITE_ENABLE_SERVER_BILLING || '').trim() === '1' || serverEnabledFromBase;

function apiUrl(path: string): string {
  if (API_BASE_URL) return `${API_BASE_URL.replace(/\/+$/, '')}${path}`;
  return path;
}

function traceId(): string {
  return `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emitTrace(stage: string, data: JsonRecord): void {
  try {
    // Always log in devtools/console for immediate visibility.
    // eslint-disable-next-line no-console
    console.log(`[auth-trace] ${stage}`, data);
  } catch {}
  try {
    const bridge = (typeof window !== 'undefined' ? (window as any).pyBridge : null) as any;
    if (bridge && typeof bridge.bridgeCommand === 'function') {
      bridge.bridgeCommand(
        JSON.stringify({
          version: '1.0',
          requestId: `${Date.now()}`,
          command: 'system.trace_log',
          payload: {
            traceId: String(data.traceId || ''),
            stage,
            data,
          },
        })
      );
    }
  } catch {}
}

async function request<T = JsonRecord>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  const reqTraceId = traceId();
  const method = String(init?.method || 'GET').toUpperCase();
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'unknown';
  const online = typeof navigator !== 'undefined' ? String(navigator.onLine) : 'unknown';
  const headersForRequest: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) || {}),
    'X-DJ-Trace-Id': reqTraceId,
  };
  emitTrace('api.request.start', {
    traceId: reqTraceId,
    method,
    path,
    url,
    base: API_BASE_URL,
    origin,
    online,
  });

  const bridge = typeof window !== 'undefined' ? (window as any).pyBridge : null;
  if (origin === 'file://' && bridge && typeof bridge.bridgeCommand === 'function') {
    try {
      emitTrace('api.request.bridge.start', {
        traceId: reqTraceId,
        method,
        path,
        url,
      });
      const rawResolved = await Promise.resolve(bridge.bridgeCommand(
        JSON.stringify({
          version: '1.0',
          requestId: `${Date.now()}`,
          command: 'system.http_json',
          payload: {
            url,
            method,
            headers: headersForRequest,
            body: init?.body ?? null,
            timeoutSec: 30,
          },
        })
      ));
      const raw = typeof rawResolved === 'string' ? rawResolved : JSON.stringify(rawResolved ?? {});
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed?.ok) {
        throw new Error(String(parsed?.error?.message || 'Bridge HTTP request failed.'));
      }
      const status = Number(parsed?.data?.status || 0);
      const data = (parsed?.data?.json || {}) as JsonRecord;
      emitTrace('api.request.bridge.response', {
        traceId: reqTraceId,
        method,
        path,
        url,
        status,
        ok: status >= 200 && status < 300,
        responseError: String(data.error || ''),
      });
      if (!(status >= 200 && status < 300)) {
        throw new Error(String(data.error || data.message || `Request failed (${status})`));
      }
      return data as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || 'Unknown bridge network error');
      emitTrace('api.request.bridge.error', {
        traceId: reqTraceId,
        method,
        path,
        url,
        error: msg,
      });
      throw new Error(`Network request failed [trace=${reqTraceId}] via bridge. ${msg} | url=${url} | base=${API_BASE_URL || '(empty)'} | origin=${origin} | online=${online}`);
    }
  }

  try {
    const res = await fetch(url, {
      ...init,
      headers: headersForRequest,
    });
    const data = (await res.json().catch(() => ({}))) as JsonRecord;
    emitTrace('api.request.response', {
      traceId: reqTraceId,
      method,
      path,
      url,
      status: res.status,
      ok: res.ok,
      responseError: String(data.error || ''),
    });
    if (!res.ok) {
      throw new Error(String(data.error || data.message || `Request failed (${res.status})`));
    }
    return data as T;
  } catch (err) {
    const base = API_BASE_URL || '(empty)';
    const msg = err instanceof Error ? err.message : String(err || 'Unknown network error');
    emitTrace('api.request.error', {
      traceId: reqTraceId,
      method,
      path,
      url,
      base,
      origin,
      online,
      error: msg,
    });
    throw new Error(`Network request failed [trace=${reqTraceId}]. ${msg} | url=${url} | base=${base} | origin=${origin} | online=${online}`);
  }
}

export function apiTrace(stage: string, data: JsonRecord): void {
  emitTrace(stage, data);
}

export async function apiSignIn(email: string, password: string): Promise<{ ok: boolean }> {
  return request('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiSignUp(email: string, password: string, fullName: string): Promise<{ ok: boolean; requiresEmailVerification?: boolean }> {
  return request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, fullName }),
  });
}

export async function apiGetGoogleStartUrl(origin: string): Promise<{ url: string }> {
  return request('/api/auth/google/start', {
    method: 'POST',
    body: JSON.stringify({ redirectUri: origin }),
  });
}

export async function apiCreateCheckoutSession(planId: string, email?: string): Promise<{ url: string }> {
  return request('/api/billing/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ planId, email }),
  });
}

export async function apiSpotifyToken(): Promise<{ access_token: string; token_type: string; expires_in: number }> {
  return request('/api/spotify/token');
}

export async function apiSpotifySearch(query: string, type: 'album' | 'track' = 'album'): Promise<JsonRecord> {
  const params = new URLSearchParams({ q: query, type });
  return request(`/api/spotify/search?${params.toString()}`);
}

export async function apiSpotifyLookup(id: string, type: 'album' | 'track' = 'album'): Promise<JsonRecord> {
  const params = new URLSearchParams({ id, type });
  return request(`/api/spotify/lookup?${params.toString()}`);
}
