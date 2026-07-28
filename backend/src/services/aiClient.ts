import { config } from '../config';

export interface AiResult {
  status: number;
  data: any;
}

const AI_TIMEOUT_MS = 8000;

/**
 * Proxies a GET to the FastAPI AI service (predict/insights). Shared by the
 * /api/predict and /api/insights routes so they don't duplicate the timeout +
 * error-handling boilerplate.
 *
 * Returns the upstream HTTP status and JSON body. If the AI service is down or
 * returns non-JSON, returns a 502-shaped failure instead of throwing.
 */
export async function callAi(path: string): Promise<AiResult> {
  const url = `${config.aiServiceUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    const data = await resp.json().catch(() => ({}));
    return { status: resp.status, data };
  } catch (e: any) {
    return { status: 502, data: { error: 'AI service unavailable', detail: e?.message } };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Proxies a request to the FastAPI admin service (/admin/*). Unlike callAi,
 * this injects the X-Admin-Key header server-side (from config.adminKey) so the
 * admin key never reaches the browser. All /api/admin/* proxy routes gate the
 * caller with requireCapability('system.admin') before calling this.
 *
 * If the admin key is not configured, returns a 502-shaped failure (fail closed)
 * rather than forwarding a keyless request FastAPI would reject as 404 — this
 * keeps the error surface uniform and never leaks whether the key is set.
 */
export async function callAdmin(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<AiResult> {
  if (!config.adminKey) {
    return { status: 502, data: { error: 'Admin key not configured on the proxy' } };
  }
  const url = `${config.aiServiceUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'X-Admin-Key': config.adminKey };
    const hasBody = opts.body !== undefined;
    if (hasBody) headers['Content-Type'] = 'application/json';
    const resp = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({}));
    return { status: resp.status, data };
  } catch (e: any) {
    return { status: 502, data: { error: 'Admin service unavailable', detail: e?.message } };
  } finally {
    clearTimeout(timeout);
  }
}
