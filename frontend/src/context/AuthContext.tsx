'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, type User } from '@/lib/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (data: { name: string; email: string }) => Promise<{ ok: boolean; status: number; data: unknown }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; status: number; data: unknown }>;
  authFetch: <T = unknown>(
    path: string,
    opts?: { method?: string; body?: unknown },
  ) => Promise<{ ok: boolean; status: number; data: T }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We already hold an access token in memory — validate it and load the user.
    if (token) {
      let active = true;
      (async () => {
        const r = await apiFetch<{ user: User }>('/api/auth/me', { token });
        if (active) {
          if (r.ok) setUser(r.data.user);
          else setToken(null);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }

    // No in-memory token (e.g. the page was reloaded). Restore the session so
    // the user isn't silently logged out: first try sessionStorage, then fall
    // back to the httpOnly refresh cookie via /api/auth/refresh.
    let active = true;
    (async () => {
      const stored = sessionStorage.getItem('ffms_token');
      if (stored) {
        const r = await apiFetch<{ user: User }>('/api/auth/me', { token: stored });
        if (active) {
          if (r.ok) setToken(stored);
          else sessionStorage.removeItem('ffms_token');
          setLoading(false);
        }
        return;
      }

      const rf = await apiFetch<{ accessToken: string; user: User }>(
        '/api/auth/refresh',
        { method: 'POST' },
      );
      if (active) {
        if (rf.ok && rf.data.accessToken) {
          sessionStorage.setItem('ffms_token', rf.data.accessToken);
          setToken(rf.data.accessToken);
          setUser(rf.data.user ?? null);
        }
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function doLogin(email: string, password: string) {
    const r = await apiFetch<{ accessToken: string; user: User }>(
      '/api/auth/login',
      { method: 'POST', body: { email, password } },
    );
    if (!r.ok) throw new Error((r.data as { error?: string })?.error ?? 'Login failed');
    sessionStorage.setItem('ffms_token', r.data.accessToken);
    setToken(r.data.accessToken);
    setUser(r.data.user);
  }

  async function doRegister(email: string, password: string, name?: string) {
    const r = await apiFetch<{ accessToken: string; user: User }>(
      '/api/auth/register',
      { method: 'POST', body: { email, password, name } },
    );
    if (!r.ok) throw new Error((r.data as { error?: string })?.error ?? 'Registration failed');
    sessionStorage.setItem('ffms_token', r.data.accessToken);
    setToken(r.data.accessToken);
    setUser(r.data.user);
  }

  async function doLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    sessionStorage.removeItem('ffms_token');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    if (!token) return;
    const r = await apiFetch<{ user: User }>('/api/auth/me', { token });
    if (r.ok) setUser(r.data.user);
  }

  async function updateProfile(data: { name: string; email: string }) {
    return authFetch('/api/auth/me', { method: 'PATCH', body: data });
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    return authFetch('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
  }

  const authFetch = useCallback(
    async function authFetch<T = unknown>(
      path: string,
      opts: { method?: string; body?: unknown } = {},
    ): Promise<{ ok: boolean; status: number; data: T }> {
      let t = token;
      let r = await apiFetch<T>(path, { ...opts, token: t });
      if (r.status === 401) {
        const rf = await apiFetch<{ accessToken: string }>('/api/auth/refresh', {
          method: 'POST',
        });
        if (rf.ok && rf.data.accessToken) {
          t = rf.data.accessToken;
          sessionStorage.setItem('ffms_token', t);
          setToken(t);
          r = await apiFetch<T>(path, { ...opts, token: t });
        }
      }
      return r;
    },
    [token, setToken],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login: doLogin,
        register: doRegister,
        logout: doLogout,
        refreshUser,
        updateProfile,
        changePassword,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
