import type http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

/** Small helpers for the JSON HTTP services (allocator, orchestrator, media node internals). */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown, cors = false): void {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (cors) Object.assign(headers, corsHeaders());
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

export function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
  };
}

export async function readJson<T = Record<string, unknown>>(req: http.IncomingMessage, maxBytes = 1024 * 1024): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, 'payload_too_large', 'Request body is too large');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {} as T;
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object');
  }
}

/** Constant-time check of the x-cluster-secret header used on every internal endpoint. */
export function hasClusterSecret(req: http.IncomingMessage, secret: string): boolean {
  const given = req.headers['x-cluster-secret'];
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST JSON to another internal service, with a timeout. */
export async function postJson<T>(url: string, body: unknown, secret: string, timeoutMs = 3000): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cluster-secret': secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new HttpError(res.status, data.error?.code ?? 'upstream_error', data.error?.message ?? `${url} returned ${res.status}`);
  }
  return data;
}

export async function getJson<T>(url: string, secret: string, timeoutMs = 3000): Promise<T> {
  const res = await fetch(url, { headers: { 'x-cluster-secret': secret }, signal: AbortSignal.timeout(timeoutMs) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new HttpError(res.status, data.error?.code ?? 'upstream_error', data.error?.message ?? `${url} returned ${res.status}`);
  }
  return data;
}

/** Wraps a handler so thrown HttpErrors become JSON error responses. */
export function jsonHandler(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<void>,
  opts: { cors?: boolean; onError?: (error: unknown) => void } = {},
) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (opts.cors && req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders()).end();
      return;
    }
    handler(req, res, url).catch((error) => {
      if (res.headersSent) return;
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: { code: error.code, message: error.message } }, opts.cors);
      } else {
        opts.onError?.(error);
        sendJson(res, 500, { error: { code: 'internal', message: 'Internal error' } }, opts.cors);
      }
    });
  };
}
