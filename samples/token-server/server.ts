/**
 * Sample customer backend. It shows the one thing every integration needs on the server: an
 * endpoint that gives your signed-in users a short-lived access token. It also serves the web
 * samples so you can try them in a browser.
 *
 *   APP_ID=… APP_CERTIFICATE=… npx tsx samples/token-server/server.ts
 *   open http://localhost:5050
 *
 * Without APP_ID it uses the "Acme Chat (sample)" project from config/projects.json (local dev).
 * In a real app, check who the user is (your session or login) before issuing a token, and pick
 * the role from your own rules: who may speak, who may moderate.
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildToken, type Role } from '../../server-sdks/node/src/index';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 5050);
const allocatorUrl = process.env.ALLOCATOR_URL ?? 'http://localhost:4100';

async function credentials(): Promise<{ appId: string; appCertificate: string }> {
  if (process.env.APP_ID && process.env.APP_CERTIFICATE) {
    return { appId: process.env.APP_ID, appCertificate: process.env.APP_CERTIFICATE };
  }
  const file = path.resolve(here, '../../config/projects.json');
  const { projects } = JSON.parse(await readFile(file, 'utf8')) as { projects: { name: string; appId: string; certificates: string[] }[] };
  const sample = projects.find((p) => p.name.startsWith('Acme Chat'));
  if (!sample) throw new Error('Set APP_ID and APP_CERTIFICATE, or create the sample project (tools/project.mjs)');
  return { appId: sample.appId, appCertificate: sample.certificates[0]! };
}

const { appId, appCertificate } = await credentials();

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'POST' && url.pathname === '/api/token') {
      // ⚠ Sample only: a real backend identifies the user from its own session here.
      const body = await readBody(req);
      const channel = String(body.channel ?? '');
      const uid = String(body.uid ?? '');
      const role = (['host', 'speaker', 'audience'].includes(String(body.role)) ? body.role : 'speaker') as Role;
      const token = buildToken({ appId, appCertificate, channel, uid, role, expireSeconds: 3600 });
      json(res, 200, { token, appId, allocatorUrl });
      return;
    }
    if (req.method === 'GET') {
      const rel = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
      const file = path.resolve(here, 'public', '.' + rel);
      if (!file.startsWith(path.resolve(here, 'public'))) throw new Error('bad path');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
      return;
    }
    res.writeHead(405).end();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') res.writeHead(404).end('Not found');
    else json(res, 400, { error: (error as Error).message });
  }
});

server.listen(port, () => {
  console.log(`Sample backend on http://localhost:${port}  (App ID ${appId}, allocator ${allocatorUrl})`);
});
