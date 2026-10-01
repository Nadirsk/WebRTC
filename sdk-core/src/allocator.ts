import type {
  AllocateRequestBody,
  AllocateResponseBody,
  ApiErrorBody,
  RenewResponseBody,
} from '../../protocol/index';
import { RtcError } from './errors';

async function post<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new RtcError('network', `Could not reach ${url}`);
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok || !data) {
    throw new RtcError(data?.error?.code ?? 'server_error', data?.error?.message ?? `${url} returned ${res.status}`);
  }
  return data;
}

/** Ask the access point which media nodes to use, and get an edge ticket for them. */
export function allocate(baseUrl: string, body: AllocateRequestBody, timeoutMs = 6000): Promise<AllocateResponseBody> {
  return post(`${baseUrl.replace(/\/$/, '')}/v1/allocate`, body, timeoutMs);
}

export function renew(baseUrl: string, body: AllocateRequestBody, timeoutMs = 6000): Promise<RenewResponseBody> {
  return post(`${baseUrl.replace(/\/$/, '')}/v1/renew`, body, timeoutMs);
}
