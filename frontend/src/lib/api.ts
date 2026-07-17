export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export interface User {
  id: number;
  email: string;
  name: string | null;
  full_name: string | null;
  role_id: number;
  household_id: number | null;
  household_role: string | null;
  status: number;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
    });
  } catch (e: any) {
    // Network failure / server unreachable. Return a structured failure
    // (status 0) instead of throwing, so callers don't have to guard every
    // call and we avoid unhandled promise rejections app-wide.
    return { ok: false, status: 0, data: {} as T };
  }

  const data = (await res.json().catch(() => ({} as T))) as T;
  return { ok: res.ok, status: res.status, data };
}

/** Fetch a raw text response (e.g. a CSV export). Returns '' on any failure. */
export async function apiGetText(
  path: string,
  token?: string | null,
): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}
