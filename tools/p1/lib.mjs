/**
 * Shared helpers for the Phase 1 tests. Each test starts its own cluster on ports that do not
 * clash with a dev cluster (nodes 3201+, allocator 4110, orchestrator 4210), with its own
 * projects file and data directory, and stops it at the end.
 */
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SECRET = 'dev-cluster-secret-change-me';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome');

// ------------------------------------------------------------ results

let failures = 0;
let passes = 0;
export function check(label, ok, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? `  (${detail})` : ''}`);
  return ok;
}
export function summary(name) {
  console.log(`\n${name}: ${passes} passed, ${failures} failed`);
  process.exitCode = failures === 0 ? 0 : 1;
}

// ------------------------------------------------------------ projects and tokens

const hex = (n) => randomBytes(n).toString('hex');

export function project(name, { testing = false, maxUsers = 1000, maxChannels = 500, status = 'active' } = {}) {
  return {
    appId: hex(16),
    name,
    status,
    authMode: testing ? 'appIdOnly' : 'token',
    certificates: testing ? [] : [hex(16)],
    limits: { maxConcurrentUsers: maxUsers, maxChannels },
  };
}

/** Same format as server-sdks: HS256 JWT signed with the App Certificate. */
export function token(p, { channel, uid, role = 'speaker', ttl = 3600, iat, certificate } = {}) {
  const issued = iat ?? Math.floor(Date.now() / 1000);
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ v: 1, appId: p.appId, channel, uid, role, iat: issued, exp: issued + ttl })}`;
  return `${body}.${createHmac('sha256', certificate ?? p.certificates[0]).update(body).digest('base64url')}`;
}

// ------------------------------------------------------------ cluster

export async function startCluster({ nodes = 3, capacity = 2000, workers = 1, projects = [], env = {} } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rtc-p1-'));
  const projectsFile = path.join(dir, 'projects.json');
  await writeFile(projectsFile, JSON.stringify({ projects }, null, 2));
  const allocatorUrl = 'http://localhost:4110';
  const orchestratorUrl = 'http://127.0.0.1:4210';
  const procs = [];

  const run = (name, script, extra) => {
    const log = createWriteStream(path.join(dir, `${name}.log`));
    const child = spawn(process.execPath, [path.join(root, script)], {
      cwd: root,
      env: { ...process.env, LOG_LEVEL: 'info', ...env, ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    procs.push({ name, child });
    return child;
  };

  const waitFor = async (url) => {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(url)).ok) return;
      } catch {}
      await sleep(100);
    }
    throw new Error(`${url} did not come up (logs in ${dir})`);
  };

  run('orchestrator', 'orchestrator/dist/index.js', { ORCHESTRATOR_PORT: '4210', DATA_DIR: dir });
  await waitFor(`${orchestratorUrl}/health`);
  run('allocator', 'allocator/dist/index.js', { ALLOCATOR_PORT: '4110', ORCHESTRATOR_URL: orchestratorUrl, PROJECTS_FILE: projectsFile });

  const nodeInfo = [];
  const startNode = (i) => {
    const port = 3201 + i;
    const child = run(`node-${i + 1}`, 'media-node/dist/index.js', {
      NODE_ID: `test-${i + 1}`,
      HTTP_PORT: String(port),
      PUBLIC_WS_URL: `ws://localhost:${port}/ws`,
      CLUSTER_WS_URL: `ws://127.0.0.1:${port}/cluster`,
      WEBRTC_BASE_PORT: String(45444 + i * 10),
      ANNOUNCED_ADDRESS: '127.0.0.1',
      MEDIASOUP_NUM_WORKERS: String(workers),
      NODE_MAX_PEERS: String(capacity),
      ORCHESTRATOR_URL: orchestratorUrl,
    });
    nodeInfo[i] = { id: `test-${i + 1}`, port, url: `http://127.0.0.1:${port}`, child };
  };
  for (let i = 0; i < nodes; i++) startNode(i);
  await waitFor(`${allocatorUrl}/v1/health`);
  for (const n of nodeInfo) await waitFor(`${n.url}/api/health`);
  // Every node must be registered before placements are spread over them.
  for (let i = 0; i < 50; i++) {
    const c = await internal('/internal/cluster');
    if (c.nodes.length === nodes) break;
    await sleep(100);
  }

  async function internal(p, init = {}) {
    const res = await fetch(`${orchestratorUrl}${p}`, { ...init, headers: { 'x-cluster-secret': SECRET, 'content-type': 'application/json' } });
    return res.json();
  }

  return {
    dir,
    allocatorUrl,
    orchestratorUrl,
    pageBase: 'http://localhost:3201',
    nodes: nodeInfo,
    internal,
    nodeIndex: (id) => nodeInfo.findIndex((n) => n.id === id),
    /** Hard kill, like a crashed server or pulled cable. */
    killNode(i) {
      nodeInfo[i].child.kill('SIGKILL');
    },
    restartNode: startNode,
    async setProjects(list) {
      await writeFile(projectsFile, JSON.stringify({ projects: list }, null, 2));
      await sleep(1600); // the allocator polls the file every second
    },
    async log(name) {
      return readFile(path.join(dir, `${name}.log`), 'utf8');
    },
    async stop() {
      for (const { child } of procs) child.kill('SIGKILL');
      await sleep(500);
    },
  };
}

// ------------------------------------------------------------ allocation from Node

export async function allocate(cluster, body) {
  const res = await fetch(`${cluster.allocatorUrl}/v1/allocate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// ------------------------------------------------------------ browsers

export async function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 180_000,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--mute-audio',
    ],
  });
}

/** A page with window.harness (the web SDK plus helpers). */
export async function harnessPage(browser, cluster) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`  [page error] ${e.message}`));
  await page.goto(`${cluster.pageBase}/harness.html`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  return page;
}

/** Create and join a client inside a harness page. Returns { nodeId, uid, role } or { error, code }. */
export function joinIn(page, name, config, join, { tone = false } = {}) {
  return page.evaluate(
    async (name, config, join, tone) => {
      const client = window.harness.create(name, config);
      try {
        await client.join(join);
        if (tone) await client.publish(window.harness.toneTrack());
        return { nodeId: client.nodeId, uid: client.uid, role: client.role };
      } catch (error) {
        return { error: error.message, code: error.code };
      }
    },
    name,
    config,
    join,
    tone,
  );
}

export function eventsOf(page, name) {
  return page.evaluate((n) => window.harness.events[n] ?? [], name);
}

export async function waitForEvent(page, name, event, predicate = '() => true', timeoutMs = 10_000) {
  return page
    .waitForFunction(
      (n, e, p) => (window.harness.events[n] ?? []).some((ev) => ev.name === e && new Function('ev', `return (${p})(ev)`)(ev)),
      { timeout: timeoutMs, polling: 100 },
      name,
      event,
      predicate,
    )
    .then(() => true)
    .catch(() => false);
}

export function inboundKbps(page, name) {
  return page.evaluate((n) => window.harness.inboundKbps(n), name);
}

/** Highest inbound bitrate over a few seconds. The test tone has pauses, so one sample can read 0. */
export async function peakKbps(page, name, samples = 5, gapMs = 700) {
  let peak = 0;
  for (let i = 0; i < samples; i++) {
    peak = Math.max(peak, await inboundKbps(page, name));
    if (i < samples - 1) await sleep(gapMs);
  }
  return peak;
}
