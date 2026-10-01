#!/usr/bin/env node
/**
 * Multi-tenancy and security, with raw protocol clients (no browser):
 *   - tokens: missing, malformed, wrong certificate, wrong channel/uid, expired, rotation
 *   - projects: unknown, suspended, testing mode
 *   - quotas: concurrent users and channels
 *   - edge tickets: forged tickets, wrong protocol version
 *   - roles: the token's role is a ceiling
 *   - isolation: 3 projects × 34 channels with identical channel names and uids never see each other
 *
 *   node tools/p1/tenancy.mjs
 */
import WebSocket from 'ws';
import { allocate, check, project, sleep, startCluster, summary, token } from './lib.mjs';

const acme = project('Acme');
const globex = project('Globex');
const initech = project('Initech', { maxUsers: 3, maxChannels: 2 });
const testing = project('Testing', { testing: true });
const all = [acme, globex, initech, testing];

const cluster = await startCluster({ nodes: 3, projects: all });

/** A protocol-level client: allocate, open the socket, connect and join. */
async function rawJoin({ appId, channel, token: tok, uid, role = 'speaker', joinRole, protocolVersion = 2, ticket }) {
  const alloc = ticket ? null : await allocate(cluster, { appId, channel, token: tok, uid, role });
  if (alloc && alloc.status !== 200) return { error: alloc.body.error.code, status: alloc.status };
  const url = alloc ? alloc.body.edges[0].url : cluster.nodes[0].url.replace('http', 'ws') + '/ws';
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
  let nextId = 1;
  const pending = new Map();
  const notifications = [];
  ws.on('message', (raw) => {
    const f = JSON.parse(raw.toString());
    if (f.notification) notifications.push(f);
    else pending.get(f.id)?.(f);
  });
  const request = (method, data) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, data }));
    });
  const connected = await request('connect', { protocolVersion, ticket: ticket ?? alloc.body.ticket });
  if (!connected.ok) {
    ws.close();
    return { error: connected.code, message: connected.error };
  }
  const joined = await request('join', {
    displayName: uid,
    role: joinRole ?? role,
    rtpCapabilities: connected.data.routerRtpCapabilities,
  });
  if (!joined.ok) {
    ws.close();
    return { error: joined.code, message: joined.error };
  }
  return {
    ws,
    request,
    notifications,
    nodeId: connected.data.nodeId,
    peers: joined.data.peers,
    close: () => ws.close(),
  };
}

const openClients = [];
try {
  console.log('Tokens');
  let r = await allocate(cluster, { appId: acme.appId, channel: 'c1', uid: 'alice' });
  check('no token → token_required', r.body.error?.code === 'token_required', r.body.error?.code);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c1', token: 'not.a.token' });
  check('garbage token → invalid_token', r.body.error?.code === 'invalid_token', r.body.error?.code);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c1', token: token(acme, { channel: 'c1', uid: 'alice', certificate: globex.certificates[0] }) });
  check("token signed with another project's certificate → invalid_token", r.body.error?.code === 'invalid_token', r.body.error?.code);
  r = await allocate(cluster, { appId: globex.appId, channel: 'c1', token: token(acme, { channel: 'c1', uid: 'alice', certificate: globex.certificates[0] }) });
  check('token for another App ID → wrong_app', r.body.error?.code === 'wrong_app', r.body.error?.code);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c2', token: token(acme, { channel: 'c1', uid: 'alice' }) });
  check('token for another channel → wrong_channel', r.body.error?.code === 'wrong_channel', r.body.error?.code);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c1', uid: 'bob', token: token(acme, { channel: 'c1', uid: 'alice' }) });
  check('token for another uid → wrong_uid', r.body.error?.code === 'wrong_uid', r.body.error?.code);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c1', token: token(acme, { channel: 'c1', uid: 'alice', iat: Math.floor(Date.now() / 1000) - 7200, ttl: 3600 }) });
  check('expired token → token_expired (401)', r.body.error?.code === 'token_expired' && r.status === 401, r.body.error?.code);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c1', token: token(acme, { channel: 'c1', uid: 'alice', ttl: 3 * 86400 }) });
  check('token living longer than 24 h → invalid_token', r.body.error?.code === 'invalid_token', r.body.error?.code);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c1', token: token(acme, { channel: 'c1', uid: 'alice', role: 'host' }) });
  check('valid token → edges + ticket, role from token', r.status === 200 && r.body.edges.length > 0 && r.body.maxRole === 'host', `${r.body.edges?.length} edges`);

  console.log('\nCertificate rotation');
  const oldCert = acme.certificates[0];
  acme.certificates = ['f'.repeat(32), oldCert];
  await cluster.setProjects(all);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c1', token: token(acme, { channel: 'c1', uid: 'alice', certificate: oldCert }) });
  check('old certificate still accepted while it is secondary', r.status === 200, r.body.error?.code);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c1', token: token(acme, { channel: 'c1', uid: 'alice' }) });
  check('new primary certificate accepted', r.status === 200, r.body.error?.code);
  acme.certificates = [acme.certificates[0]];
  await cluster.setProjects(all);
  r = await allocate(cluster, { appId: acme.appId, channel: 'c1', token: token(acme, { channel: 'c1', uid: 'alice', certificate: oldCert }) });
  check('old certificate rejected after the rotation finishes', r.body.error?.code === 'invalid_token', r.body.error?.code);

  console.log('\nProjects');
  r = await allocate(cluster, { appId: 'a'.repeat(32), channel: 'c1', uid: 'x' });
  check('unknown App ID → project_not_found', r.body.error?.code === 'project_not_found', r.body.error?.code);
  globex.status = 'suspended';
  await cluster.setProjects(all);
  r = await allocate(cluster, { appId: globex.appId, channel: 'c1', token: token(globex, { channel: 'c1', uid: 'x' }) });
  check('suspended project → project_suspended', r.body.error?.code === 'project_suspended', r.body.error?.code);
  globex.status = 'active';
  await cluster.setProjects(all);
  r = await allocate(cluster, { appId: testing.appId, channel: 'c1', uid: 'anyone', role: 'audience' });
  check('testing-mode project needs no token', r.status === 200, r.body.error?.code);

  console.log('\nEdge tickets and protocol');
  let c = await rawJoin({ ticket: 'forged.ticket.value', uid: 'x' });
  check('forged ticket rejected by the media node', c.error === 'invalid_ticket', c.error);
  const [head, , sig] = r.body.ticket.split('.');
  const tampered = `${head}.${Buffer.from(JSON.stringify({ typ: 'edge', appId: acme.appId, channel: 'c1', uid: 'x', role: 'host', sessionExp: null, exp: 9e9 })).toString('base64url')}.${sig}`;
  c = await rawJoin({ ticket: tampered, uid: 'x' });
  check('ticket with edited claims rejected', c.error === 'invalid_ticket', c.error);
  c = await rawJoin({ appId: testing.appId, channel: 'c1', uid: 'old-sdk', protocolVersion: 1 });
  check('old protocol version rejected with a clear code', c.error === 'unsupported_protocol', c.error);

  console.log('\nRoles');
  c = await rawJoin({ appId: acme.appId, channel: 'roles', uid: 'aud', token: token(acme, { channel: 'roles', uid: 'aud', role: 'audience' }), role: 'audience', joinRole: 'speaker' });
  check('audience token cannot join as speaker', c.error === 'role_not_allowed', c.error);
  c = await rawJoin({ appId: acme.appId, channel: 'roles', uid: 'aud', token: token(acme, { channel: 'roles', uid: 'aud', role: 'audience' }), role: 'audience' });
  openClients.push(c);
  const up = await c.request('setRole', { role: 'speaker' });
  check('audience token cannot switch itself to speaker', up.code === 'role_not_allowed', up.code);
  const mute = await c.request('muteParticipant', { uid: 'someone', kind: 'audio' });
  check('non-host cannot use host controls', mute.code === 'not_host', mute.code);
  c.close();

  console.log('\nQuotas (Initech: 3 users, 2 channels)');
  const quotaClients = [];
  for (const [uid, ch] of [['q1', 'a'], ['q2', 'a'], ['q3', 'b']]) {
    const q = await rawJoin({ appId: initech.appId, channel: ch, uid, token: token(initech, { channel: ch, uid }) });
    quotaClients.push(q);
  }
  check('3 users in 2 channels join', quotaClients.every((q) => !q.error), quotaClients.map((q) => q.error ?? 'ok').join(','));
  r = await allocate(cluster, { appId: initech.appId, channel: 'a', token: token(initech, { channel: 'a', uid: 'q4' }) });
  check('4th concurrent user → quota_exceeded (429)', r.body.error?.code === 'quota_exceeded' && r.status === 429, r.body.error?.code);
  r = await allocate(cluster, { appId: initech.appId, channel: 'a', token: token(initech, { channel: 'a', uid: 'q1' }) });
  check('a user already inside can reconnect despite the quota', r.status === 200, r.body.error?.code);
  quotaClients[0].close();
  await sleep(1500); // session end reaches the orchestrator within ~1 s
  r = await allocate(cluster, { appId: initech.appId, channel: 'c', token: token(initech, { channel: 'c', uid: 'q5' }) });
  check('3rd channel → quota_exceeded', r.body.error?.code === 'quota_exceeded', r.body.error?.code);
  r = await allocate(cluster, { appId: initech.appId, channel: 'b', token: token(initech, { channel: 'b', uid: 'q5' }) });
  check('a freed seat can be used again', r.status === 200, r.body.error?.code);
  for (const q of quotaClients) q.close?.();

  console.log('\nIsolation: 3 projects × 34 channels, same channel names and uids everywhere');
  const apps = [acme, globex, testing];
  const clients = [];
  for (const app of apps) {
    for (let ch = 1; ch <= 34; ch++) {
      for (const uid of ['u1', 'u2']) {
        const channel = `room-${ch}`;
        clients.push(
          rawJoin({ appId: app.appId, channel, uid, token: app.authMode === 'token' ? token(app, { channel, uid }) : undefined }).then((cl) => ({ ...cl, app: app.name, channel, uid })),
        );
      }
    }
  }
  const joined = await Promise.all(clients);
  openClients.push(...joined);
  const failed = joined.filter((j) => j.error);
  check('204 clients joined 102 rooms', failed.length === 0, failed.length ? failed[0].error : `${joined.length} clients`);
  await sleep(1500);

  let leaks = 0;
  for (const j of joined.filter((x) => !x.error)) {
    const seen = new Set([...j.peers.map((p) => p.uid), ...j.notifications.filter((n) => n.method === 'peerJoined').map((n) => n.data.uid)]);
    const other = j.uid === 'u1' ? 'u2' : 'u1';
    if (seen.size !== 1 || !seen.has(other)) leaks++;
  }
  check('every client sees exactly its own room partner', leaks === 0, `${leaks} clients saw something else`);

  const stats = await Promise.all(cluster.nodes.map((n) => fetch(`${n.url}/api/stats`).then((x) => x.json())));
  const keys = stats.flatMap((s) => s.rooms.map((room) => room.key));
  check('102 separate rooms across the nodes', new Set(keys).size === 102, `${new Set(keys).size} rooms`);
  check('every room is keyed by App ID', keys.every((k) => apps.some((a) => k.startsWith(`${a.appId}:`))));
  check('rooms spread over all 3 nodes', stats.every((s) => s.totals.rooms > 0), stats.map((s) => s.totals.rooms).join('/'));

  // Globex had no other successful allocations, so its count is exactly its isolation clients.
  const now = await cluster.internal(`/internal/apps/${globex.appId}/now`);
  check('orchestrator counts each project separately', now.concurrentUsers === 68 && now.channels === 34, `${now.concurrentUsers} users, ${now.channels} channels`);
} catch (error) {
  check(`unexpected error: ${error.stack}`, false);
} finally {
  for (const c of openClients) c?.close?.();
  await cluster.stop();
  summary('tenancy');
}
