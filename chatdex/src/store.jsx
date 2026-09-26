import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [me, setMe] = useState(null);
  const [meta, setMeta] = useState(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const toastId = useRef(0);

  const toast = useCallback((text, kind = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const data = await api('/me');
      setMe(data);
      return data;
    } catch (err) {
      if (err.status === 401) setMe(null);
      else throw err;
      return null;
    }
  }, []);

  const boot = useCallback(async () => {
    setBooting(true);
    setBootError(null);
    try {
      const [m] = await Promise.all([api('/meta'), refreshMe()]);
      setMeta(m);
    } catch (err) {
      setBootError(err);
    } finally {
      setBooting(false);
    }
  }, [refreshMe]);

  useEffect(() => {
    boot();
    setUnauthorizedHandler(() => setMe(null));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [boot]);

  // Poll unread notifications while the app is open.
  useEffect(() => {
    if (!me) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshMe().catch(() => {}); }, 45000);
    return () => clearInterval(t);
  }, [me, refreshMe]);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setMe(data);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api('/auth/register', { method: 'POST', body: payload });
    setMe(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({ me, setMe, meta, booting, bootError, boot, refreshMe, login, register, logout, toast, toasts, online }),
    [me, meta, booting, bootError, boot, refreshMe, login, register, logout, toast, toasts, online]
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Tiny data-fetching hook with loading/error/reload. */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(async (silent = false) => {
    if (!path) return;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ data: silent ? s.data : null, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}
