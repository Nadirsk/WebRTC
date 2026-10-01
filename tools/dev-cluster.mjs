#!/usr/bin/env node
/**
 * Runs the whole platform on one machine: orchestrator, allocator and several media nodes,
 * each as its own process, the way they run on separate servers in production.
 *
 *   npm run build && node tools/dev-cluster.mjs --nodes 3
 *
 * Options:
 *   --nodes N        media nodes (default 3), HTTP ports 3001, 3002, … WebRTC ports 44444+10·i
 *   --capacity N     peers per node before rooms spill to the next node (default 2000)
 *   --workers N      mediasoup workers per node (default 1)
 *   --quiet          only print warnings and errors
 *
 * Test pages: http://localhost:3001/  (any node serves them)
 * Kill one node to test failover:  the PIDs are printed at start.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    nodes: { type: 'string', default: '3' },
    capacity: { type: 'string', default: '2000' },
    workers: { type: 'string', default: '1' },
    quiet: { type: 'boolean', default: false },
    'orchestrator-port': { type: 'string', default: '4200' },
    'allocator-port': { type: 'string', default: '4100' },
    'base-http-port': { type: 'string', default: '3001' },
  },
});

const orchestratorUrl = `http://127.0.0.1:${args['orchestrator-port']}`;
const colors = [36, 35, 33, 32, 34, 91, 92, 93];
const children = [];

function run(name, script, env, color) {
  const child = spawn(process.execPath, [path.join(root, script)], {
    cwd: root,
    env: { ...process.env, LOG_LEVEL: args.quiet ? 'warn' : 'info', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `\x1b[${color}m${name.padEnd(13)}\x1b[0m`;
  const pipe = (stream) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) console.log(`${prefix} ${line}`);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code, signal) => console.log(`${prefix} exited (${signal ?? code})`));
  children.push({ name, child });
  return child;
}

async function waitFor(url, label) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${label} did not start (${url})`);
}

run('orchestrator', 'orchestrator/dist/index.js', { ORCHESTRATOR_PORT: args['orchestrator-port'] }, colors[0]);
await waitFor(`${orchestratorUrl}/health`, 'orchestrator');

run('allocator', 'allocator/dist/index.js', { ALLOCATOR_PORT: args['allocator-port'], ORCHESTRATOR_URL: orchestratorUrl }, colors[1]);

const nodes = Number(args.nodes);
for (let i = 0; i < nodes; i++) {
  const port = Number(args['base-http-port']) + i;
  run(
    `node-${i + 1}`,
    'media-node/dist/index.js',
    {
      NODE_ID: `local-${i + 1}`,
      REGION: 'local',
      HTTP_PORT: String(port),
      HTTP_LISTEN_IP: '0.0.0.0',
      PUBLIC_WS_URL: `ws://localhost:${port}/ws`,
      CLUSTER_WS_URL: `ws://127.0.0.1:${port}/cluster`,
      WEBRTC_BASE_PORT: String(44444 + i * 10),
      ANNOUNCED_ADDRESS: '127.0.0.1',
      MEDIASOUP_NUM_WORKERS: args.workers,
      NODE_MAX_PEERS: args.capacity,
      ORCHESTRATOR_URL: orchestratorUrl,
    },
    colors[2 + (i % 6)],
  );
}
await waitFor(`http://127.0.0.1:${args['allocator-port']}/v1/health`, 'allocator');
for (let i = 0; i < nodes; i++) await waitFor(`http://127.0.0.1:${Number(args['base-http-port']) + i}/api/health`, `node-${i + 1}`);

console.log('\nCluster is up:');
for (const { name, child } of children) console.log(`  ${name.padEnd(13)} pid ${child.pid}`);
console.log(`  test pages    http://localhost:${args['base-http-port']}/`);
console.log(`  allocator     http://localhost:${args['allocator-port']}/v1/allocate\n`);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) child.kill('SIGINT');
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
