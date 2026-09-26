// API client. On the web the UI and API share an origin and auth uses an HttpOnly cookie.
// In the iOS/Android apps (Capacitor) the UI is bundled, so requests go to VITE_API_BASE
// and auth uses a bearer token kept on the device.
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
export const isNativeApp = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
const TOKEN_KEY = 'chatdex.token';

export class ApiError extends Error {
  constructor(message, status, offline = false, code = null, params = null) {
    super(message);
    this.status = status;
    this.offline = offline;
    this.code = code;
    this.params = params;
  }
}

/** Absolute URL for server-hosted files such as /uploads/... photos. */
export const mediaUrl = (p) => (p && p.startsWith('/') ? `${API_BASE}${p}` : p);

const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export function setToken(token) {
  try {
    if (token && (API_BASE || isNativeApp())) localStorage.setItem(TOKEN_KEY, token);
    else if (!token) localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      signal,
      credentials: API_BASE ? 'omit' : 'same-origin',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError("Can't reach Chatdex. Check your connection and try again.", 0, true);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) { setToken(null); onUnauthorized(); }
    throw new ApiError(data?.error || `Something went wrong (${res.status}).`, res.status, false, data?.code, data?.params);
  }
  return data;
}
