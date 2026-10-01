/**
 * Access tokens: our verifier against tokens from every server SDK (Node, PHP, Python), plus the
 * rules the verifier enforces. Run: npm run test:unit
 */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildToken } from '../server-sdks/node/src/index';
import { AuthError, buildAccessToken, signEdgeTicket, verifyAccessToken, verifyEdgeTicket } from '../shared/auth';
import { signJwt } from '../shared/jwt';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appId = '0123456789abcdef0123456789abcdef';
const cert = 'c0ffeec0ffeec0ffeec0ffeec0ffee00';
const expected = { appId, channel: 'room-1', uid: 'alice' };

const php = process.env.PHP_PATH ?? (process.platform === 'win32' ? 'C:/xampp/php/php.exe' : 'php');
const python = process.env.PYTHON_PATH ?? (process.platform === 'win32' ? 'python' : 'python3');

function code(fn: () => unknown): string {
  try {
    fn();
    return 'ok';
  } catch (error) {
    return error instanceof AuthError ? error.code : String(error);
  }
}

test('Node server SDK token verifies', () => {
  const token = buildToken({ appId, appCertificate: cert, channel: 'room-1', uid: 'alice', role: 'host', expireSeconds: 600 });
  const claims = verifyAccessToken(token, [cert], expected);
  assert.equal(claims.role, 'host');
  assert.equal(claims.exp - claims.iat, 600);
});

test('PHP server SDK token verifies', () => {
  const token = execFileSync(php, [path.join(root, 'server-sdks/php/cli.php'), appId, cert, 'room-1', 'alice', 'speaker', '600']).toString().trim();
  assert.equal(verifyAccessToken(token, [cert], expected).role, 'speaker');
});

test('Python server SDK token verifies', () => {
  const token = execFileSync(python, [path.join(root, 'server-sdks/python/nadir_network_token.py'), appId, cert, 'room-1', 'alice', 'audience', '600']).toString().trim();
  assert.equal(verifyAccessToken(token, [cert], expected).role, 'audience');
});

test('rejects wrong certificate, app, channel, uid', () => {
  const token = buildToken({ appId, appCertificate: cert, channel: 'room-1', uid: 'alice', role: 'speaker' });
  assert.equal(code(() => verifyAccessToken(token, ['other-certificate-000000'], expected)), 'invalid_token');
  assert.equal(code(() => verifyAccessToken(token, [cert], { ...expected, appId: 'f'.repeat(32) })), 'wrong_app');
  assert.equal(code(() => verifyAccessToken(token, [cert], { ...expected, channel: 'room-2' })), 'wrong_channel');
  assert.equal(code(() => verifyAccessToken(token, [cert], { ...expected, uid: 'bob' })), 'wrong_uid');
});

test('accepts the secondary certificate during rotation', () => {
  const token = buildToken({ appId, appCertificate: cert, channel: 'room-1', uid: 'alice', role: 'speaker' });
  assert.equal(code(() => verifyAccessToken(token, ['new-primary-certificate-00', cert], expected)), 'ok');
});

test('rejects expired, future and over-long tokens', () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = { appId, channel: 'room-1', uid: 'alice', role: 'speaker' as const };
  assert.equal(code(() => verifyAccessToken(buildAccessToken(cert, { ...claims, iat: now - 7200, ttlSeconds: 3600 }), [cert], expected)), 'token_expired');
  assert.equal(code(() => verifyAccessToken(buildAccessToken(cert, { ...claims, iat: now + 600 }), [cert], expected)), 'invalid_token');
  assert.equal(code(() => verifyAccessToken(buildAccessToken(cert, { ...claims, ttlSeconds: 2 * 86400 }), [cert], expected)), 'invalid_token');
});

test('rejects alg "none" and other algorithms', () => {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ v: 1, appId, channel: 'room-1', uid: 'alice', role: 'host', iat: now, exp: now + 60 });
  assert.equal(code(() => verifyAccessToken(`${b64({ alg: 'none', typ: 'JWT' })}.${body}.`, [cert], expected)), 'invalid_token');
  assert.equal(code(() => verifyAccessToken(`${b64({ alg: 'HS512', typ: 'JWT' })}.${body}.abc`, [cert], expected)), 'invalid_token');
});

test('edge tickets: signed by the cluster secret only', () => {
  const ticket = signEdgeTicket({ appId, channel: 'room-1', uid: 'alice', role: 'speaker', sessionExp: null }, 'cluster-secret');
  assert.equal(verifyEdgeTicket(ticket, 'cluster-secret').uid, 'alice');
  assert.equal(code(() => verifyEdgeTicket(ticket, 'another-secret')), 'invalid_ticket');
  // A customer access token is not an edge ticket, even if someone signs it with the right key.
  const accessToken = signJwt({ v: 1, appId, channel: 'room-1', uid: 'alice', role: 'host', iat: 0, exp: 9e9 }, 'cluster-secret');
  assert.equal(code(() => verifyEdgeTicket(accessToken, 'cluster-secret')), 'invalid_ticket');
});

test('server SDKs refuse bad input', () => {
  assert.throws(() => buildToken({ appId: 'short', appCertificate: cert, channel: 'room-1', uid: 'a', role: 'host' }));
  assert.throws(() => buildToken({ appId, appCertificate: cert, channel: 'has space', uid: 'a', role: 'host' }));
  assert.throws(() => buildToken({ appId, appCertificate: cert, channel: 'room-1', uid: 'a', role: 'host', expireSeconds: 100_000 }));
});
