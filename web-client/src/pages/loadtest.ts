import { createClient, type RtcClient } from '../../../sdk-web/src/index';
import { $, defaultAllocatorUrl, el, intParam, param, resolveAppId } from '../common';
import { createSteadyTrack } from '../tone';

/**
 * URL options:
 *   room       channel to join (default "load1")
 *   listeners  listener connections to open from this tab (default 10)
 *   speaker    1 = also publish a test tone from this tab
 *   stagger    ms between joins (default 60), avoids a thundering herd
 *   relay      1 = force TURN
 *   allocator  access point URL (default: this host, port 4100)
 *   appId      project (default: the testing-mode demo project)
 *   tag        prefix for uids, so several tabs never collide
 */

type Summary = {
  room: string;
  target: number;
  connected: number;
  failed: number;
  receiving: number;
  reconnecting: number;
  avgLossPercent: number;
  avgJitterMs: number;
  avgInboundKbps: number;
  nodes: Record<string, number>;
  receivingByNode: Record<string, number>;
  /** Connected but no audio stream at all (never subscribed). */
  noStream: number;
  errors: string[];
};

declare global {
  interface Window {
    __loadtest: Summary;
  }
}

const room = param('room', 'load1');
const listeners = intParam('listeners', 10);
const withSpeaker = param('speaker') === '1';
const stagger = intParam('stagger', 60);
const forceRelay = param('relay') === '1';
const tag = param('tag', Math.random().toString(36).slice(2, 7));
const allocatorUrl = defaultAllocatorUrl();

const summary: Summary = {
  room,
  target: listeners,
  connected: 0,
  failed: 0,
  receiving: 0,
  reconnecting: 0,
  avgLossPercent: 0,
  avgJitterMs: 0,
  avgInboundKbps: 0,
  nodes: {},
  receivingByNode: {},
  noStream: 0,
  errors: [],
};
window.__loadtest = summary;

const clients: RtcClient[] = [];
const logList = $('#log');
const log = (message: string) => logList.prepend(el('li', { textContent: `${new Date().toLocaleTimeString()}  ${message}` }));

function render() {
  $('#k-room').textContent = room;
  $('#k-connected').textContent = `${summary.connected} / ${listeners}`;
  $('#k-failed').textContent = String(summary.failed);
  $('#k-loss').textContent = `${summary.avgLossPercent}%`;
  $('#k-jitter').textContent = `${summary.avgJitterMs} ms`;
  $('#k-receiving').textContent = `${summary.receiving} / ${summary.connected}`;
}

async function startSpeaker(appId: string) {
  const client = createClient({ appId, allocatorUrl, forceRelay, autoSubscribe: false });
  await client.join({ channel: room, uid: `speaker-${tag}`, role: 'speaker' });
  const tone = createSteadyTrack(new AudioContext());
  await client.publish(tone.track, { source: 'loadtest-tone' });
  log(`speaker publishing test tone via ${client.nodeId}`);
}

async function startListener(appId: string, index: number) {
  const client = createClient({ appId, allocatorUrl, forceRelay });
  client.on('exception', (error) => {
    if (summary.errors.length < 20) summary.errors.push(`listener ${index}: ${error.code} ${error.message}`);
  });
  try {
    await client.join({ channel: room, uid: `l-${tag}-${index}`, role: 'audience' });
    clients.push(client);
    summary.connected++;
  } catch (error) {
    summary.failed++;
    const message = error instanceof Error ? error.message : String(error);
    if (summary.errors.length < 20) summary.errors.push(message);
    log(`listener ${index} failed: ${message}`);
  }
  render();
}

async function sampleQuality() {
  let loss = 0;
  let jitter = 0;
  let kbps = 0;
  let receiving = 0;
  let measured = 0;
  let reconnecting = 0;
  let noStream = 0;
  const nodes: Record<string, number> = {};
  const receivingByNode: Record<string, number> = {};
  for (const client of clients) {
    if (client.connectionState === 'reconnecting') reconnecting++;
    if (client.connectionState !== 'connected') continue;
    nodes[client.nodeId] = (nodes[client.nodeId] ?? 0) + 1;
    try {
      const s = await client.getStats();
      measured++;
      if (s.inbound.streams === 0) noStream++;
      loss += s.inbound.lossPercent;
      jitter += s.inbound.jitterMs;
      kbps += s.inbound.bitrateKbps;
      if (s.inbound.bitrateKbps > 0) {
        receiving++;
        receivingByNode[client.nodeId] = (receivingByNode[client.nodeId] ?? 0) + 1;
      }
    } catch {
      // A client may be mid-teardown.
    }
  }
  if (measured > 0) {
    summary.avgLossPercent = Math.round((loss / measured) * 10) / 10;
    summary.avgJitterMs = Math.round(jitter / measured);
    summary.avgInboundKbps = Math.round(kbps / measured);
  }
  summary.receiving = receiving;
  summary.noStream = noStream;
  summary.reconnecting = reconnecting;
  summary.nodes = nodes;
  summary.receivingByNode = receivingByNode;
  render();
}

async function main() {
  render();
  const appId = await resolveAppId(allocatorUrl);
  log(`opening ${listeners} listener(s) to ${room} via ${allocatorUrl}`);
  if (withSpeaker) await startSpeaker(appId).catch((e) => log(`speaker failed: ${String(e)}`));

  const joins: Promise<void>[] = [];
  for (let i = 0; i < listeners; i++) {
    joins.push(startListener(appId, i));
    await new Promise((r) => setTimeout(r, stagger));
  }
  await Promise.all(joins);
  log(`all joins finished: ${summary.connected} connected, ${summary.failed} failed`);
  setInterval(() => void sampleQuality(), 3000);
}

void main();
