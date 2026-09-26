export class ApiError extends Error {
  constructor(message, status, offline = false, code = null, params = null) {
    super(message);
    this.status = status;
    this.offline = offline;
    this.code = code;
    this.params = params;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError("Can't reach Chatdex. Check your connection and try again.", 0, true);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(data?.error || `Something went wrong (${res.status}).`, res.status, false, data?.code, data?.params);
  }
  return data;
}
