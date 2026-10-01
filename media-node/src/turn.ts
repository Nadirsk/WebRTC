import { createHmac } from 'node:crypto';
import type { IceServer } from '../../protocol/index';
import { config } from './config';

/**
 * Short-lived TURN credentials using coturn's REST API scheme (`use-auth-secret`):
 *   username   = "<unix expiry>:<sid>"
 *   credential = base64(HMAC-SHA1(static-auth-secret, username))
 * coturn checks the signature and the expiry itself, so no database is needed.
 */
export function turnIceServers(sid: string): IceServer[] {
  const { urls, secret, credentialTtlSeconds } = config.turn;
  if (urls.length === 0 || !secret) return [];

  const expiry = Math.floor(Date.now() / 1000) + credentialTtlSeconds;
  const username = `${expiry}:${sid}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return [{ urls, username, credential }];
}
