#!/usr/bin/env node
/**
 * One channel larger than one node: 1 speaker + N listeners with a small per-node capacity, so
 * the room spills over to every node. Every listener must hear the speaker without loss.
 *
 * The P1 target (1,000 listeners over 3+ nodes) needs several load machines; on one laptop the
 * browsers, not the servers, are the limit. Default here: 300 listeners, 110 per node.
 *
 *   node tools/p1/cascade-scale.mjs [--listeners 300] [--capacity 110] [--per-tab 50] [--duration 40]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { check, launchBrowser, project, root, sleep, startCluster, summary } from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    listeners: { type: 'string', default: '300' },
    capacity: { type: 'string', default: '110' },
    'per-tab': { type: 'string', default: '50' },
    duration: { type: 'string', default: '40' },
  },
});
const listeners = Number(args.listeners);
const perTab = Number(args['per-tab']);

const app = project('Scale test', { testing: true, maxUsers: 5000 });
app.demo = true; // loadtest.html picks the demo project from the allocator
const cluster = await startCluster({ nodes: 3, capacity: Number(args.capacity), projects: [app] });
// Chrome allows ~255 WebSockets per browser profile, so spread listeners over several browsers.
const PER_BROWSER = 150;
const browsers = [];
for (let i = 0; i < Math.ceil(listeners / PER_BROWSER); i++) browsers.push(await launchBrowser());
const browser = browsers[0];
const room = `scale-${Date.now().toString(36)}`;
const url = (params) =>
  `${cluster.pageBase}/loadtest.html?${new URLSearchParams({ room, allocator: cluster.allocatorUrl, stagger: '40', ...params })}`;

try {
  const speaker = await browser.newPage();
  await speaker.goto(url({ listeners: '0', speaker: '1', tag: 'spk' }));
  await sleep(1500);

  const tabs = [];
  for (let remaining = listeners, i = 0; remaining > 0; remaining -= perTab, i++) {
    const page = await browsers[Math.floor((i * perTab) / PER_BROWSER)].newPage();
    page.on('pageerror', (e) => console.log(`  [tab ${i}] ${e.message}`));
    await page.goto(url({ listeners: String(Math.min(perTab, remaining)), tag: `t${i}` }));
    tabs.push(page);
  }

  const samples = [];
  const started = Date.now();
  console.log('  time  connected  failed  receiving  loss%  jitter  per node');
  while (Date.now() - started < Number(args.duration) * 1000) {
    await sleep(5000);
    const sums = await Promise.all(tabs.map((t) => t.evaluate(() => window.__loadtest)));
    const connected = sums.reduce((n, s) => n + s.connected, 0);
    const failed = sums.reduce((n, s) => n + s.failed, 0);
    const receiving = sums.reduce((n, s) => n + s.receiving, 0);
    const loss = sums.reduce((n, s) => n + s.avgLossPercent * s.connected, 0) / Math.max(1, connected);
    const jitter = sums.reduce((n, s) => n + s.avgJitterMs * s.connected, 0) / Math.max(1, connected);
    const nodes = {};
    const recvByNode = {};
    for (const s of sums) for (const [n, c] of Object.entries(s.nodes)) nodes[n] = (nodes[n] ?? 0) + c;
    for (const s of sums) for (const [n, c] of Object.entries(s.receivingByNode)) recvByNode[n] = (recvByNode[n] ?? 0) + c;
    const errors = [...new Set(sums.flatMap((s) => s.errors))];
    const stats = await Promise.all(cluster.nodes.map((n) => fetch(`${n.url}/api/stats`).then((r) => r.json())));
    const cpu = stats.map((s) => Math.max(0, ...s.workers.map((w) => w.cpuPercent)));
    samples.push({ t: Math.round((Date.now() - started) / 1000), connected, failed, receiving, loss, jitter, nodes, recvByNode, cpu, errors });
    console.log(
      `${String(samples.at(-1).t + 's').padStart(6)} ${String(connected).padStart(10)} ${String(failed).padStart(7)} ${String(receiving).padStart(10)} ${loss.toFixed(1).padStart(6)} ${(Math.round(jitter) + 'ms').padStart(7)}  ${JSON.stringify(nodes)} recv ${JSON.stringify(recvByNode)} cpu ${cpu.join('/')}%`,
    );
    const noStream = sums.reduce((n, s) => n + s.noStream, 0);
    if (errors.length || noStream) console.log(`        no stream: ${noStream}; errors: ${errors.slice(0, 6).join(' | ')}`);
  }

  const last = samples.at(-1);
  const settled = samples.slice(Math.floor(samples.length / 2));
  const avgLoss = settled.reduce((n, s) => n + s.loss, 0) / settled.length;
  check(`all ${listeners} listeners connected`, last.connected === listeners && last.failed === 0, `${last.connected} connected, ${last.failed} failed`);
  check('at least 98% are receiving audio', last.receiving >= listeners * 0.98, `${last.receiving}/${listeners}`);
  check('average packet loss under 1%', avgLoss < 1, `${avgLoss.toFixed(2)}%`);
  check('the room spans all 3 nodes', Object.keys(last.nodes).length === 3, JSON.stringify(last.nodes));
  check('no node went over its capacity', Object.values(last.nodes).every((c) => c <= Number(args.capacity)), JSON.stringify(last.nodes));

  await mkdir(path.join(root, 'tools/loadtest/results'), { recursive: true });
  const file = path.join(root, 'tools/loadtest/results', `cascade-${room}.json`);
  await writeFile(file, JSON.stringify({ when: new Date().toISOString(), listeners, capacity: Number(args.capacity), samples }, null, 2));
  console.log(`  saved ${path.relative(root, file)}`);
} catch (error) {
  check(`unexpected error: ${error.stack}`, false);
} finally {
  for (const b of browsers) await b.close();
  await cluster.stop();
  summary('cascade-scale');
}
