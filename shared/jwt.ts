import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal HS256 JSON Web Tokens. Only HS256 is accepted, so a token that claims "none" or another
 * algorithm is rejected before any signature work.
 */

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string, key: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

export function signJwt(payload: Record<string, unknown>, key: string): string {
  const head = base64url(JSON.stringify(HEADER));
  const body = base64url(JSON.stringify(payload));
  return `${head}.${body}.${base64url(sign(`${head}.${body}`, key))}`;
}

export class JwtError extends Error {
  constructor(
    readonly code: 'malformed' | 'bad_signature',
    message: string,
  ) {
    super(message);
  }
}

/** Splits and decodes a token without checking the signature. */
export function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  if (typeof token !== 'string' || token.length > 4096) throw new JwtError('malformed', 'Token is not a string');
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('malformed', 'Token must have three parts');
  try {
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') throw new Error();
    return { header, payload };
  } catch {
    throw new JwtError('malformed', 'Token is not valid JSON');
  }
}

/** Returns the payload when the signature matches any of `keys`. Expiry is checked by the caller. */
export function verifyJwt(token: string, keys: readonly string[]): Record<string, unknown> {
  const { header, payload } = decodeJwt(token);
  if (header.alg !== 'HS256') throw new JwtError('malformed', 'Only HS256 tokens are accepted');

  const [head, body, sig] = token.split('.') as [string, string, string];
  const given = Buffer.from(sig, 'base64url');
  for (const key of keys) {
    const expected = sign(`${head}.${body}`, key);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return payload;
  }
  throw new JwtError('bad_signature', 'Token signature does not match');
}
