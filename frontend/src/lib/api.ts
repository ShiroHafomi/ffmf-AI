export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export interface User {
  id: number;
  email: string;
  name: string | null;
  full_name: string | null;
  role_id: number;
  household_id: number | null;
  status: number;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function apiFetch<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
  });

  const data = (await res.json().catch(() => ({} as T))) as T;
  return { ok: res.ok, status: res.status, data };
}
