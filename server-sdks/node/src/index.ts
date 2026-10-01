import { createHmac } from 'node:crypto';

/**
 * Server SDK for Node.js: builds access tokens on your backend. Never ship the App Certificate
 * to apps or browsers; your backend signs a short-lived token per user and channel.
 *
 *   import { buildToken } from '@nadir-network/server-sdk';
 *
 *   const token = buildToken({
 *     appId: process.env.APP_ID,
 *     appCertificate: process.env.APP_CERTIFICATE,
 *     channel: 'room-1',
 *     uid: 'alice',
 *     role: 'speaker',
 *     expireSeconds: 3600,
 *   });
 */

export type Role = 'host' | 'speaker' | 'audience';

export type TokenOptions = {
  appId: string;
  appCertificate: string;
  /** 1–64 characters: letters, digits, "_", "-" or ".". */
  channel: string;
  /** Your user's ID. Same character rules as channel. */
  uid: string;
  /** Highest role the user may take in this channel. host can moderate; audience only listens. */
  role: Role;
  /** Token lifetime, at most 86 400 (24 h). Default 3600. */
  expireSeconds?: number;
};

const NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const ROLES: readonly Role[] = ['host', 'speaker', 'audience'];

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export function buildToken(options: TokenOptions): string {
  const { appId, appCertificate, channel, uid, role } = options;
  const expireSeconds = options.expireSeconds ?? 3600;
  if (!/^[a-f0-9]{32}$/.test(appId)) throw new Error('appId must be the 32-character App ID from the console');
  if (!appCertificate) throw new Error('appCertificate is required');
  if (!NAME.test(channel)) throw new Error('channel must be 1–64 characters: letters, digits, "_", "-" or "."');
  if (!NAME.test(uid)) throw new Error('uid must be 1–64 characters: letters, digits, "_", "-" or "."');
  if (!ROLES.includes(role)) throw new Error('role must be host, speaker or audience');
  if (!Number.isInteger(expireSeconds) || expireSeconds < 1 || expireSeconds > 86_400) {
    throw new Error('expireSeconds must be between 1 and 86400');
  }

  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ v: 1, appId, channel, uid, role, iat, exp: iat + expireSeconds }));
  const signature = b64url(createHmac('sha256', appCertificate).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}
