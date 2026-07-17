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
