'use client';

import {
  createContext,
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
  authFetch: <T = any>(
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
    if (!token) {
      setLoading(false);
      return;
    }
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
  }, [token]);

  async function doLogin(email: string, password: string) {
    const r = await apiFetch<{ accessToken: string; user: User }>(
      '/api/auth/login',
      { method: 'POST', body: { email, password } },
    );
    if (!r.ok) throw new Error((r.data as any)?.error ?? 'Login failed');
    setToken(r.data.accessToken);
    setUser(r.data.user);
  }

  async function doRegister(email: string, password: string, name?: string) {
    const r = await apiFetch<{ accessToken: string; user: User }>(
      '/api/auth/register',
      { method: 'POST', body: { email, password, name } },
    );
    if (!r.ok) throw new Error((r.data as any)?.error ?? 'Registration failed');
    setToken(r.data.accessToken);
    setUser(r.data.user);
  }

  async function doLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setToken(null);
    setUser(null);
  }

  async function authFetch<T = any>(
    path: string,
    opts: { method?: string; body?: unknown } = {},
  ) {
    let t = token;
    let r = await apiFetch<T>(path, { ...opts, token: t });
    if (r.status === 401) {
      const rf = await apiFetch<{ accessToken: string }>('/api/auth/refresh', {
        method: 'POST',
      });
      if (rf.ok && rf.data.accessToken) {
        t = rf.data.accessToken;
        setToken(t);
        r = await apiFetch<T>(path, { ...opts, token: t });
      }
    }
    return r;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login: doLogin,
        register: doRegister,
        logout: doLogout,
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
