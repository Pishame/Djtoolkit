type JsonRecord = Record<string, unknown>;

const env = (import.meta as any)?.env || {};

export const API_BASE_URL: string = String(env.VITE_API_BASE_URL || '').trim();
export const ENABLE_SERVER_AUTH = String(env.VITE_ENABLE_SERVER_AUTH || '0') === '1';
export const ENABLE_SERVER_SPOTIFY = String(env.VITE_ENABLE_SERVER_SPOTIFY || '0') === '1';
export const ENABLE_SERVER_BILLING = String(env.VITE_ENABLE_SERVER_BILLING || '0') === '1';

function apiUrl(path: string): string {
  if (API_BASE_URL) return `${API_BASE_URL.replace(/\/+$/, '')}${path}`;
  return path;
}

async function request<T = JsonRecord>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as JsonRecord;
  if (!res.ok) {
    throw new Error(String(data.error || data.message || `Request failed (${res.status})`));
  }
  return data as T;
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
