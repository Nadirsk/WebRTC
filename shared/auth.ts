import { JwtError, signJwt, verifyJwt } from './jwt';

/**
 * Two kinds of signed tokens:
 *
 * 1. Access token: made by the customer's backend with its App Certificate (see server-sdks/).
 *    Proves "this user may join this channel of this app, with at most this role, until exp".
 *
 * 2. Edge ticket: made by our allocator after it has checked the access token, the project and its
 *    quota. Media nodes only trust tickets, so they never need App Certificates or the project list.
 */

export type Role = 'host' | 'speaker' | 'audience';
export const ROLES: readonly Role[] = ['audience', 'speaker', 'host'];

/** true when `role` is allowed by a grant of `max` (audience < speaker < host). */
export function roleAllowed(role: Role, max: Role): boolean {
  return ROLES.indexOf(role) <= ROLES.indexOf(max);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Channel names and user IDs: 1–64 characters of letters, digits, "_", "-" or ".". */
export const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
export const APP_ID_PATTERN = /^[a-f0-9]{32}$/;

export function isName(value: unknown): value is string {
  return typeof value === 'string' && NAME_PATTERN.test(value);
}

/** Longest lifetime we accept for an access token. */
export const MAX_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
/** Tolerated clock difference between the customer's server and ours. */
export const CLOCK_SKEW_SECONDS = 60;

export const TOKEN_VERSION = 1;

export type AccessTokenClaims = {
  v: number;
  appId: string;
  channel: string;
  uid: string;
  role: Role;
  iat: number;
  exp: number;
};

export type AuthErrorCode =
  | 'invalid_token'
  | 'token_expired'
  | 'wrong_app'
  | 'wrong_channel'
  | 'wrong_uid'
  | 'invalid_ticket'
  | 'ticket_expired';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const now = () => Math.floor(Date.now() / 1000);

/**
 * Checks an access token against the project's certificates (primary and, during rotation, secondary).
 * `expected` pins the app and channel the client says it is joining.
 */
export function verifyAccessToken(
  token: string,
  certificates: readonly string[],
  expected: { appId: string; channel: string; uid?: string },
): AccessTokenClaims {
  let payload: Record<string, unknown>;
  try {
    payload = verifyJwt(token, certificates);
  } catch (error) {
    const reason = error instanceof JwtError && error.code === 'bad_signature' ? 'signature does not match' : 'malformed';
    throw new AuthError('invalid_token', `Token is invalid (${reason})`);
  }

  const { v, appId, channel, uid, role, iat, exp } = payload;
  if (v !== TOKEN_VERSION) throw new AuthError('invalid_token', `Unsupported token version ${String(v)}`);
  if (typeof appId !== 'string' || !isName(channel) || !isName(uid) || !isRole(role)) {
    throw new AuthError('invalid_token', 'Token is missing appId, channel, uid or role');
  }
  if (typeof iat !== 'number' || typeof exp !== 'number' || exp <= iat) {
    throw new AuthError('invalid_token', 'Token has invalid iat/exp');
  }
  if (exp - iat > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new AuthError('invalid_token', 'Token lifetime is longer than 24 hours');
  }
  const t = now();
  if (iat > t + CLOCK_SKEW_SECONDS) throw new AuthError('invalid_token', 'Token is issued in the future (check the server clock)');
  if (exp <= t) throw new AuthError('token_expired', 'Token has expired');

  if (appId !== expected.appId) throw new AuthError('wrong_app', 'Token was made for another App ID');
  if (channel !== expected.channel) throw new AuthError('wrong_channel', 'Token was made for another channel');
  if (expected.uid !== undefined && uid !== expected.uid) throw new AuthError('wrong_uid', 'Token was made for another uid');

  return { v, appId, channel, uid, role, iat, exp };
}

/** Test and tooling helper. Customers use the builders in server-sdks/ instead. */
export function buildAccessToken(
  certificate: string,
  claims: { appId: string; channel: string; uid: string; role: Role; ttlSeconds?: number; iat?: number },
): string {
  const iat = claims.iat ?? now();
  const payload: AccessTokenClaims = {
    v: TOKEN_VERSION,
    appId: claims.appId,
    channel: claims.channel,
    uid: claims.uid,
    role: claims.role,
    iat,
    exp: iat + (claims.ttlSeconds ?? 3600),
  };
  return signJwt(payload, certificate);
}

// ---------------------------------------------------------------- edge tickets

/** How long a client has to present a fresh ticket to a media node. */
export const TICKET_TTL_SECONDS = 120;

export type EdgeTicket = {
  typ: 'edge';
  appId: string;
  channel: string;
  uid: string;
  /** Highest role this session may take. */
  role: Role;
  /** When the session must end unless renewed (unix seconds). null = no expiry (testing-mode projects). */
  sessionExp: number | null;
  exp: number;
};

export function signEdgeTicket(ticket: Omit<EdgeTicket, 'typ' | 'exp'>, secret: string): string {
  const payload: EdgeTicket = { typ: 'edge', ...ticket, exp: now() + TICKET_TTL_SECONDS };
  return signJwt(payload, secret);
}

export function verifyEdgeTicket(ticket: string, secret: string): EdgeTicket {
  let payload: Record<string, unknown>;
  try {
    payload = verifyJwt(ticket, [secret]);
  } catch {
    throw new AuthError('invalid_ticket', 'Edge ticket is invalid');
  }
  const { typ, appId, channel, uid, role, sessionExp, exp } = payload;
  if (typ !== 'edge' || typeof appId !== 'string' || !isName(channel) || !isName(uid) || !isRole(role)) {
    throw new AuthError('invalid_ticket', 'Edge ticket is invalid');
  }
  if (typeof exp !== 'number' || exp <= now()) throw new AuthError('ticket_expired', 'Edge ticket has expired, allocate again');
  if (sessionExp !== null && typeof sessionExp !== 'number') throw new AuthError('invalid_ticket', 'Edge ticket is invalid');
  return { typ, appId, channel, uid, role, sessionExp, exp };
}

/** Rooms are always keyed by app, so the same channel name in two apps never meets. */
export function roomKey(appId: string, channel: string): string {
  return `${appId}:${channel}`;
}
