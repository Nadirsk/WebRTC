#!/usr/bin/env node
/**
 * Failover: a speaker and listeners share a room on one node, then that node is killed
 * (like a crash or a pulled cable). Every client must reconnect on another node by itself and
 * audio must flow again. Target: under 3 seconds.
 *
 * Then a planned drain (maintenance): the node asks its clients to move; same check.
 * Also checks that metering closes the sessions of the dead node.
 *
 *   node tools/p1/failover.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  check,
  eventsOf,
  harnessPage,
  joinIn,
  launchBrowser,
  peakKbps,
  project,
  SECRET,
  sleep,
  startCluster,
  summary,
  token,
} from './lib.mjs';

const app = project('Failover test');
const cluster = await startCluster({ nodes: 3, projects: [app] });
const browser = await launchBrowser();
const channel = 'failover';
const config = { appId: app.appId, allocatorUrl: cluster.allocatorUrl };
const LISTENERS = ['l1', 'l2', 'l3', 'l4', 'l5'];

/** Time from `since` until each client is connected again and receiving the speaker's audio. */
async function recoveryTimes(page, since, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  const times = {};
  while (Date.now() < deadline && Object.keys(times).length < LISTENERS.length) {
    for (const name of LISTENERS) {
      if (times[name] !== undefined) continue;
      const events = await eventsOf(page, name);
      const sub = events.find((e) => e.name === 'trackSubscribed' && e.t > since && e.data[1].kind === 'audio');
      if (sub) times[name] = sub.t - since;
    }
    await sleep(100);
  }
  return times;
}

async function nodesOf(page) {
  return page.evaluate(() => Object.fromEntries(Object.entries(window.harness.clients).map(([n, c]) => [n, `${c.nodeId}:${c.connectionState}`])));
}

try {
  const page = await harnessPage(browser, cluster);
  const join = (uid, role, tone = false) =>
    joinIn(page, uid, config, { channel, uid, role, token: token(app, { channel, uid, role }) }, { tone });

  const speaker = await join('speaker', 'speaker', true);
  const listeners = [];
  for (const uid of LISTENERS) listeners.push(await join(uid, 'audience'));
  const home = speaker.nodeId;
  check('speaker and 5 listeners joined one node', listeners.every((l) => l.nodeId === home), `${home}`);
  await sleep(2000);
  const before = await Promise.all(LISTENERS.map((l) => peakKbps(page, l, 4)));
  check('all listeners receive audio before the failure', before.every((k) => k > 0), before.join(' / ') + ' kbps');

  // ---------------------------------------------------------------- crash
  console.log(`\nKilling ${home} …`);
  const killedAt = await page.evaluate(() => Date.now());
  cluster.killNode(cluster.nodeIndex(home));

  const times = await recoveryTimes(page, killedAt);
  const values = Object.values(times);
  const worst = values.length ? Math.max(...values) : Infinity;
  check('every listener got audio back', values.length === LISTENERS.length, `${values.length}/${LISTENERS.length}`);
  check('recovery under 3 s for every listener', worst < 3000, LISTENERS.map((l) => `${l} ${times[l] ?? '–'} ms`).join(', '));
  const moved = await nodesOf(page);
  check('everyone moved to one surviving node', new Set(Object.values(moved)).size === 1 && !Object.values(moved)[0].startsWith(home), JSON.stringify(moved));
  await sleep(1500);
  const after = await Promise.all(LISTENERS.map((l) => peakKbps(page, l, 4)));
  check('audio keeps flowing after failover', after.every((k) => k > 0), after.join(' / ') + ' kbps');
  const lEvents = await eventsOf(page, 'l1');
  const states = lEvents.filter((e) => e.name === 'connectionStateChanged' && e.t > killedAt).map((e) => e.data[0]);
  check('SDK reported reconnecting → connected', states.join('>') === 'reconnecting>connected', states.join(' > '));
  check('no user was reported as leaving during failover', !lEvents.some((e) => e.name === 'userLeft' && e.t > killedAt));

  // Metering: the orchestrator closes the dead node's sessions after its heartbeat timeout (5 s).
  await sleep(6000);
  const usage = (await readFile(path.join(cluster.dir, 'usage.jsonl'), 'utf8').catch(() => ''))
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const failed = usage.filter((u) => u.reason === 'nodeFailed' && u.nodeId === home);
  check("the dead node's 6 sessions were closed for billing", failed.length === 6, `${failed.length} closed as nodeFailed`);
  const cl = await cluster.internal('/internal/cluster');
  check('orchestrator dropped the dead node', !cl.nodes.some((n) => n.nodeId === home), cl.nodes.map((n) => n.nodeId).join(','));

  // ---------------------------------------------------------------- planned drain
  const current = Object.values(moved)[0].split(':')[0];
  console.log(`\nDraining ${current} …`);
  const drainAt = await page.evaluate(() => Date.now());
  await fetch(`${cluster.nodes[cluster.nodeIndex(current)].url}/internal/drain`, { method: 'POST', headers: { 'x-cluster-secret': SECRET } });
  const drainTimes = await recoveryTimes(page, drainAt);
  const drainValues = Object.values(drainTimes);
  const drainWorst = drainValues.length ? Math.max(...drainValues) : Infinity;
  check('every listener moved off the draining node', drainValues.length === LISTENERS.length, `${drainValues.length}/${LISTENERS.length}`);
  check('drain move under 3 s', drainWorst < 3000, LISTENERS.map((l) => `${l} ${drainTimes[l] ?? '–'} ms`).join(', '));
  const drained = await nodesOf(page);
  check('nobody is left on the draining node', !Object.values(drained).some((v) => v.startsWith(current)), JSON.stringify(drained));
  const r = await fetch(`${cluster.allocatorUrl}/v1/allocate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appId: app.appId, channel: 'fresh', token: token(app, { channel: 'fresh', uid: 'new' }) }),
  }).then((x) => x.json());
  check('the draining node gets no new placements', !r.edges.some((e) => e.nodeId === current), r.edges.map((e) => e.nodeId).join(','));
} catch (error) {
  check(`unexpected error: ${error.stack}`, false);
} finally {
  await browser.close();
  await cluster.stop();
  summary('failover');
}
