import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { hasClusterSecret } from '../../shared/http';
import { createLogger } from '../../shared/logger';
import { acceptClusterConnection, linkCount, verifyClusterUpgrade } from './cluster';
import { config } from './config';
import { emitEvent, flushEvents, onDrain, registerRoom, setDraining, startHeartbeats } from './orchestrator';
import { setBanHook } from './Room';
import { closeAllRooms, listRooms, onRoomCreated } from './rooms';
import { handleConnection } from './signaling';
import { getWorkers, startWorkers } from './workers';

const log = createLogger('server');
const startedAt = Date.now();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function stats() {
  const rooms = listRooms().map((room) => {
    let producers = 0;
    let consumers = 0;
    for (const peer of room.peers.values()) {
      producers += peer.producers.size;
      consumers += peer.consumers.size;
    }
    return {
      key: room.key,
      worker: room.workerEntry.index,
      peers: room.peers.size,
      remotePeers: room.remotePeers.size,
      remoteProducers: room.remoteProducers.size,
      links: [...room.links.keys()],
      speakers: room.speakerCount,
      producers,
      consumers,
    };
  });

  return {
    nodeId: config.nodeId,
    region: config.region,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    workers: getWorkers().map((w) => ({ index: w.index, pid: w.worker.pid, cpuPercent: w.cpuPercent, rooms: w.routerCount })),
    totals: {
      rooms: rooms.length,
      peers: rooms.reduce((n, r) => n + r.peers, 0),
      producers: rooms.reduce((n, r) => n + r.producers, 0),
      consumers: rooms.reduce((n, r) => n + r.consumers, 0),
      links: linkCount(),
    },
    rooms,
    process: { rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024) },
  };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(JSON.stringify(body));
}

async function serveStatic(urlPath: string, res: http.ServerResponse) {
  const root = path.resolve(config.http.staticDir);
  const relative = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    const target = info.isDirectory() ? path.join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[path.extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

let draining = false;

/** Move every client to another node, then stop taking new ones. */
async function drain(exitAfter: boolean) {
  if (draining) return;
  draining = true;
  setDraining(true);
  const peers = listRooms().reduce((n, r) => n + r.peers.size, 0);
  log.info('draining', { peers, exitAfter });
  for (const room of listRooms()) {
    for (const peer of room.peers.values()) peer.notify('reconnectRequired', { reason: 'nodeDraining' });
  }
  const deadline = Date.now() + config.cluster.drainTimeoutMs;
  while (Date.now() < deadline && listRooms().some((r) => r.peers.size > 0)) {
    await new Promise((r) => setTimeout(r, 250));
  }
  await flushEvents();
  log.info('drain finished', { remaining: listRooms().reduce((n, r) => n + r.peers.size, 0) });
  if (exitAfter) process.exit(0);
}

async function onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/internal/drain' && req.method === 'POST') {
    if (!hasClusterSecret(req, config.secret)) {
      sendJson(res, 401, { error: { code: 'unauthorized', message: 'Missing or wrong cluster secret' } });
      return;
    }
    void drain(false);
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, nodeId: config.nodeId, region: config.region, draining });
    return;
  }
  if (url.pathname === '/api/stats') {
    sendJson(res, 200, stats());
    return;
  }
  await serveStatic(url.pathname, res);
}

async function main() {
  await startWorkers();
  onRoomCreated((room) => void registerRoom(room));
  setBanHook((ban) => {
    emitEvent({ type: 'ban', ...ban });
    void flushEvents();
  });
  onDrain(() => void drain(false));

  const { tlsCertFile, tlsKeyFile, listenIp, port } = config.http;
  const useTls = Boolean(tlsCertFile && tlsKeyFile);
  const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
    onRequest(req, res).catch((error) => {
      log.error('http handler failed', { error: String(error) });
      if (!res.headersSent) res.writeHead(500).end();
    });
  };
  const server = useTls
    ? https.createServer({ cert: readFileSync(tlsCertFile!), key: readFileSync(tlsKeyFile!) }, handler)
    : http.createServer(handler);

  const clients = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const cluster = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  clients.on('connection', handleConnection);
  cluster.on('connection', acceptClusterConnection);
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      clients.handleUpgrade(req, socket, head, (ws) => clients.emit('connection', ws, req));
    } else if (pathname === '/cluster' && verifyClusterUpgrade(req)) {
      cluster.handleUpgrade(req, socket, head, (ws) => cluster.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve) => server.listen(port, listenIp, resolve));
  log.info('media node listening', {
    nodeId: config.nodeId,
    ws: config.cluster.publicUrl,
    cluster: config.cluster.clusterUrl,
    workers: getWorkers().length,
    capacity: config.cluster.capacity,
    announcedAddress: config.mediasoup.webRtcServer.announcedAddress ?? '(none, local only)',
  });
  await startHeartbeats();

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) {
      process.exit(0);
      return;
    }
    stopping = true;
    log.info('shutting down', { signal });
    // SIGTERM = planned (deploy): move clients first. SIGINT = stop now.
    if (signal === 'SIGTERM') {
      void drain(true);
      return;
    }
    for (const client of clients.clients) client.close(1001, 'server shutting down');
    closeAllRooms();
    void flushEvents().finally(() => {
      for (const w of getWorkers()) w.worker.close();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000).unref();
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  log.error('failed to start', { error: String(error), stack: (error as Error).stack });
  process.exit(1);
});
