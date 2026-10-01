import http from 'node:http';
import { hasClusterSecret, HttpError, jsonHandler, readJson, sendJson } from '../../shared/http';
import type { AllocateRequest, NodeEvent, NodeHeartbeat } from '../../shared/internal';
import { createLogger } from '../../shared/logger';
import { config } from './config';
import { attachRoom, confirmJoin, heartbeat, onNodeDead, overview, place, requestDrain, sweep } from './registry';
import { appNow, checkQuota, closeNodeSessions, handleEvents, nodeOfUser, openSessionCount, usageSummary } from './sessions';

/**
 * Orchestrator: node registry, room placement, failure detection and metering. Internal only;
 * every endpoint except /health needs the x-cluster-secret header.
 */

const log = createLogger('orchestrator');

onNodeDead((nodeId, lastSeen, startedAt) => closeNodeSessions(nodeId, lastSeen, startedAt));
setInterval(sweep, 1000).unref();

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new HttpError(400, 'invalid_request', `${name} is required`);
  return value;
}

const handler = jsonHandler(
  async (req, res, url) => {
    if (url.pathname === '/health') {
      sendJson(res, 200, { ok: true, nodes: overview().nodes.length, openSessions: openSessionCount() });
      return;
    }
    if (!hasClusterSecret(req, config.secret)) throw new HttpError(401, 'unauthorized', 'Missing or wrong cluster secret');

    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case 'POST /internal/nodes/heartbeat': {
        const hb = await readJson<NodeHeartbeat>(req);
        requireString(hb.nodeId, 'nodeId');
        sendJson(res, 200, heartbeat(hb));
        return;
      }
      case 'POST /internal/rooms/attach': {
        const body = await readJson<{ nodeId: string; key: string }>(req);
        sendJson(res, 200, { nodes: attachRoom(requireString(body.key, 'key'), requireString(body.nodeId, 'nodeId')) });
        return;
      }
      case 'POST /internal/events': {
        const body = await readJson<{ events: NodeEvent[] }>(req, 8 * 1024 * 1024);
        if (!Array.isArray(body.events)) throw new HttpError(400, 'invalid_request', 'events must be an array');
        handleEvents(body.events);
        for (const e of body.events) if (e.type === 'session.start') confirmJoin(e.nodeId, `${e.appId}:${e.channel}`, e.uid, e.at);
        sendJson(res, 200, { ok: true });
        return;
      }
      case 'POST /internal/allocate': {
        const body = await readJson<AllocateRequest>(req);
        const key = `${requireString(body.appId, 'appId')}:${requireString(body.channel, 'channel')}`;
        checkQuota(body);
        const edges = place(key, body.uid, Array.isArray(body.exclude) ? body.exclude : [], nodeOfUser(body.appId, body.channel, body.uid));
        sendJson(res, 200, { edges });
        return;
      }
      case 'GET /internal/cluster':
        sendJson(res, 200, overview());
        return;
      case 'GET /internal/usage': {
        const appId = requireString(url.searchParams.get('appId'), 'appId');
        const from = Number(url.searchParams.get('from') ?? 0);
        const to = Number(url.searchParams.get('to') ?? Date.now());
        sendJson(res, 200, await usageSummary(appId, from, to));
        return;
      }
    }

    const drain = url.pathname.match(/^\/internal\/nodes\/([^/]+)\/drain$/);
    if (drain && req.method === 'POST') {
      requestDrain(decodeURIComponent(drain[1]!));
      sendJson(res, 200, { ok: true });
      return;
    }
    const now = url.pathname.match(/^\/internal\/apps\/([^/]+)\/now$/);
    if (now && req.method === 'GET') {
      sendJson(res, 200, appNow(decodeURIComponent(now[1]!)));
      return;
    }
    throw new HttpError(404, 'not_found', `No route ${route}`);
  },
  { onError: (error) => log.error('request failed', { error: String(error), stack: (error as Error).stack }) },
);

const server = http.createServer(handler);
server.listen(config.port, config.listenIp, () => {
  log.info('orchestrator listening', { url: `http://${config.listenIp}:${config.port}` });
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
