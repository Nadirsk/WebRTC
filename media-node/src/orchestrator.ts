import { postJson } from '../../shared/http';
import type { HeartbeatResponse, NodeEvent, NodeHeartbeat } from '../../shared/internal';
import { createLogger } from '../../shared/logger';
import { ensureLink } from './cluster';
import { config } from './config';
import type { Room } from './Room';
import { getRoom, listRooms } from './rooms';
import { getWorkers } from './workers';

const log = createLogger('orchestrator-client');

/**
 * This node's side of the orchestrator: heartbeats (load and rooms), room registration for
 * cascading, and the session/quality event stream used for metering.
 */

const startedAt = Date.now();
const base = config.cluster.orchestratorUrl;
let draining = false;
let onDrainRequested: () => void = () => {};
let reachable = false;

export function setDraining(value: boolean): void {
  draining = value;
}

export function isDraining(): boolean {
  return draining;
}

export function onDrain(handler: () => void): void {
  onDrainRequested = handler;
}

function heartbeatBody(): NodeHeartbeat {
  const rooms = listRooms();
  return {
    nodeId: config.nodeId,
    region: config.region,
    publicUrl: config.cluster.publicUrl,
    clusterUrl: config.cluster.clusterUrl,
    capacity: config.cluster.capacity,
    draining,
    load: {
      peers: rooms.reduce((n, r) => n + r.peers.size, 0),
      rooms: rooms.length,
      maxWorkerCpu: Math.max(0, ...getWorkers().map((w) => w.cpuPercent)),
    },
    rooms: rooms.map((r) => ({ key: r.key, peers: r.peers.size })),
    startedAt,
    sentAt: Date.now(),
  };
}

async function sendHeartbeat(): Promise<void> {
  try {
    const res = await postJson<HeartbeatResponse>(`${base}/internal/nodes/heartbeat`, heartbeatBody(), config.secret);
    if (!reachable) log.info('registered with orchestrator', { url: base });
    reachable = true;
    for (const [key, nodes] of Object.entries(res.roomPeers)) {
      const room = getRoom(key);
      if (room) for (const n of nodes) void ensureLink(room, n.nodeId, n.clusterUrl);
    }
    if (res.drain && !draining) onDrainRequested();
  } catch (error) {
    if (reachable) log.warn('orchestrator unreachable', { error: String(error) });
    reachable = false;
  }
}

export async function startHeartbeats(): Promise<void> {
  await sendHeartbeat();
  setInterval(() => void sendHeartbeat(), config.cluster.heartbeatMs).unref();
  setInterval(() => void flushEvents(), 1000).unref();
}

/** Register a new room right away and link it with the other nodes that host it. */
export async function registerRoom(room: Room): Promise<void> {
  try {
    const { nodes } = await postJson<{ nodes: { nodeId: string; clusterUrl: string }[] }>(
      `${base}/internal/rooms/attach`,
      { nodeId: config.nodeId, key: room.key },
      config.secret,
    );
    for (const n of nodes) void ensureLink(room, n.nodeId, n.clusterUrl);
  } catch (error) {
    // The next heartbeat reports the room and returns its peers.
    log.warn('room registration failed', { key: room.key, error: String(error) });
  }
}

// ------------------------------------------------------------ events

const MAX_QUEUE = 20_000;
let queue: NodeEvent[] = [];
let flushing = false;

export function emitEvent(event: NodeEvent): void {
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (queue.length >= 500) void flushEvents();
}

export async function flushEvents(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue;
  queue = [];
  try {
    await postJson(`${base}/internal/events`, { events: batch }, config.secret, 5000);
  } catch (error) {
    // Keep them for the next attempt; session ends must not be lost.
    queue = batch.concat(queue);
    log.warn('event upload failed', { pending: queue.length, error: String(error) });
  } finally {
    flushing = false;
  }
}
