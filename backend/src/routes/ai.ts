import { Router, Request, Response } from 'express';
import { requireCapability } from '../authz/authorize';
import { callAi, type AiResult } from '../services/aiClient';

const router = Router();

/**
 * Helper to forward a request to the FastAPI AI service with the X-User-Id header.
 * The FastAPI endpoints require X-User-Id (from JWT) for auth, not Authorization.
 */
async function proxyToAi(
  req: Request,
  res: Response,
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<void> {
  // Get userId from the authenticated request (set by auth middleware)
  const userId = (req as any).user?.id;
  if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

  // Call the FastAPI AI service with X-User-Id header
  const url = `${process.env.AI_SERVICE_URL ?? 'http://localhost:8000'}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s for streaming

  try {
    const headers: Record<string, string> = {
      'X-User-Id': String(userId),
    };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const resp = await fetch(url, {
      method: opts.method ?? 'POST',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    // For streaming responses (SSE), pipe the response directly
    const contentType = resp.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      if (!resp.body) {
        res.status(502).json({ error: 'AI service returned empty stream' });
        return;
      }

      // Pipe the stream
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        res.end();
      } catch (e) {
        console.error('SSE stream error:', e);
        if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }

    // Non-streaming response
    const data = await resp.json().catch(() => ({}));
    res.status(resp.status).json(data);
  } catch (e: any) {
    console.error('AI proxy error:', e);
    if (!res.headersSent) {
      res.status(502).json({ error: 'AI service unavailable', detail: e?.message });
    }
  } finally {
    clearTimeout(timeout);
  }
}

// POST /api/ai/coach/chat - Conversational financial coach (SSE stream)
router.post(
  '/coach/chat',
  requireCapability('insight.view'),
  async (req: Request, res: Response) => {
    await proxyToAi(req, res, '/api/ai/coach/chat', {
      method: 'POST',
      body: req.body,
    });
  }
);

// POST /api/ai/coach/data-lookup - Data lookup via Text-to-SQL
router.post(
  '/coach/data-lookup',
  requireCapability('insight.view'),
  async (req: Request, res: Response) => {
    await proxyToAi(req, res, '/api/ai/coach/data-lookup', {
      method: 'POST',
      body: req.body,
    });
  }
);

// POST /api/ai/chat/stream - Unified intent-routed chat (SSE or JSON)
router.post(
  '/chat/stream',
  requireCapability('insight.view'),
  async (req: Request, res: Response) => {
    await proxyToAi(req, res, '/api/ai/chat/stream', {
      method: 'POST',
      body: req.body,
    });
  }
);

export default router;