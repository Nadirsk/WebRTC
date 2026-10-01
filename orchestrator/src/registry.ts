import type { EdgeCandidate, HeartbeatResponse, NodeHeartbeat } from '../../shared/internal';
import { HttpError } from '../../shared/http';
import { createLogger } from '../../shared/logger';
import { config } from './config';

const log = createLogger('registry');

/**
 * Which media nodes are alive and which rooms live on which nodes. In-memory for now; the same
 * interface moves to Redis when the orchestrator runs as more than one instance.
 */

type NodeState = {
  hb: NodeHeartbeat;
  lastSeen: number;
  /** Set by an operator (POST /internal/nodes/:id/drain). */
  drainRequested: boolean;
  /**
   * Placements not yet in the node's reported peer count: "roomKey/uid" → when placed and, once
   * the node reports the session, when it joined.
   */
  pending: Map<string, { placedAt: number; joinedAt?: number }>;
};

type RoomEntry = { since: number; reservedUntil: number };

const nodes = new Map<string, NodeState>();
/** roomKey → nodeId → entry. Insertion order = the order nodes joined the room (first is the origin). */
const rooms = new Map<string, Map<string, RoomEntry>>();

type DeadListener = (nodeId: string, lastSeen: number, startedAt: number) => void;
const deadListeners: DeadListener[] = [];
export function onNodeDead(listener: DeadListener): void {
  deadListeners.push(listener);
}

function markDead(nodeId: string, state: NodeState, why: string) {
  nodes.delete(nodeId);
  for (const [key, entries] of rooms) {
    entries.delete(nodeId);
    if (entries.size === 0) rooms.delete(key);
  }
  log.warn('node removed', { nodeId, why });
  for (const listener of deadListeners) listener(nodeId, state.lastSeen, state.hb.startedAt);
}

export function heartbeat(hb: NodeHeartbeat): HeartbeatResponse {
  const now = Date.now();
  const existing = nodes.get(hb.nodeId);
  if (existing && existing.hb.startedAt !== hb.startedAt) {
    // Same node ID, new process: everything the old process held is gone.
    markDead(hb.nodeId, existing, 'restarted');
  }
  const state: NodeState = nodes.get(hb.nodeId) ?? { hb, lastSeen: now, drainRequested: false, pending: new Map() };
  if (!nodes.has(hb.nodeId)) log.info('node registered', { nodeId: hb.nodeId, region: hb.region, url: hb.publicUrl });
  state.hb = hb;
  state.lastSeen = now;
  // A join taken before this snapshot is now inside hb.load.peers (500 ms margin for clock skew).
  // Placements whose client never arrived expire.
  for (const [k, p] of state.pending) {
    if ((p.joinedAt !== undefined && p.joinedAt < (hb.sentAt ?? now) - 500) || now - p.placedAt > config.pendingJoinMs) {
      state.pending.delete(k);
    }
  }
  nodes.set(hb.nodeId, state);

  const reported = new Set(hb.rooms.map((r) => r.key));
  for (const key of reported) attach(key, hb.nodeId, now);
  for (const [key, entries] of rooms) {
    const entry = entries.get(hb.nodeId);
    if (entry && !reported.has(key) && entry.reservedUntil < now) {
      entries.delete(hb.nodeId);
      if (entries.size === 0) rooms.delete(key);
    }
  }

  const roomPeers: HeartbeatResponse['roomPeers'] = {};
  for (const key of reported) roomPeers[key] = otherNodes(key, hb.nodeId);
  return { roomPeers, drain: state.drainRequested };
}

function attach(key: string, nodeId: string, now: number, reserveMs = 0) {
  let entries = rooms.get(key);
  if (!entries) rooms.set(key, (entries = new Map()));
  const entry = entries.get(nodeId);
  if (entry) entry.reservedUntil = Math.max(entry.reservedUntil, now + reserveMs);
  else entries.set(nodeId, { since: now, reservedUntil: now + reserveMs });
}

/** A node opened a room: record it right away and tell it which other nodes to link with. */
export function attachRoom(key: string, nodeId: string): { nodeId: string; clusterUrl: string }[] {
  if (!nodes.has(nodeId)) throw new HttpError(409, 'unknown_node', 'Send a heartbeat first');
  attach(key, nodeId, Date.now(), config.pendingJoinMs);
  return otherNodes(key, nodeId);
}

function otherNodes(key: string, nodeId: string) {
  const list: { nodeId: string; clusterUrl: string }[] = [];
  for (const id of rooms.get(key)?.keys() ?? []) {
    const node = nodes.get(id);
    if (id !== nodeId && node) list.push({ nodeId: id, clusterUrl: node.hb.clusterUrl });
  }
  return list;
}

const load = (n: NodeState) => n.hb.load.peers + n.pending.size;
const hasRoomFor = (n: NodeState) => load(n) < n.hb.capacity;
const candidate = (n: NodeState): EdgeCandidate => ({ nodeId: n.hb.nodeId, region: n.hb.region, url: n.hb.publicUrl });

/**
 * Choose where a new participant of `key` connects. The room stays on the nodes it already uses
 * while they have space; when they are full it spills to the least-loaded node (cascading).
 * Returns up to three candidates: the first is the placement, the rest are fallbacks.
 */
/** A placed client joined its node; the next heartbeat taken after `at` will count it. */
export function confirmJoin(nodeId: string, key: string, uid: string, at: number): void {
  const entry = nodes.get(nodeId)?.pending.get(`${key}/${uid}`);
  if (entry) entry.joinedAt = at;
}

export function place(key: string, uid: string, exclude: readonly string[], preferNodeId?: string): EdgeCandidate[] {
  const now = Date.now();
  const usable = [...nodes.values()].filter(
    (n) => !n.hb.draining && !n.drainRequested && !exclude.includes(n.hb.nodeId),
  );
  if (usable.length === 0) throw new HttpError(503, 'no_capacity', 'No media node is available right now');

  const hostingIds = [...(rooms.get(key)?.keys() ?? [])];
  const hosting = hostingIds.map((id) => usable.find((n) => n.hb.nodeId === id)).filter((n): n is NodeState => !!n);
  const byLoad = [...usable].sort((a, b) => load(a) - load(b));

  // A user joining again replaces their old session, so their current node needs no free seat.
  const preferred = preferNodeId ? hosting.find((n) => n.hb.nodeId === preferNodeId) : undefined;
  const primary = preferred ?? hosting.find(hasRoomFor) ?? byLoad.find(hasRoomFor);
  if (!primary) throw new HttpError(503, 'no_capacity', 'All media nodes are full');

  primary.pending.set(`${key}/${uid}`, { placedAt: now });
  attach(key, primary.hb.nodeId, now, config.pendingJoinMs);

  const ordered = [primary, ...hosting.filter((n) => n !== primary && hasRoomFor(n)), ...byLoad.filter(hasRoomFor)];
  const unique = [...new Map(ordered.map((n) => [n.hb.nodeId, n])).values()];
  return unique.slice(0, 3).map(candidate);
}

export function requestDrain(nodeId: string): void {
  const node = nodes.get(nodeId);
  if (!node) throw new HttpError(404, 'unknown_node', `No node ${nodeId}`);
  node.drainRequested = true;
  log.info('drain requested', { nodeId });
}

export function sweep(): void {
  const now = Date.now();
  for (const [nodeId, state] of nodes) {
    if (now - state.lastSeen > config.nodeTimeoutMs) markDead(nodeId, state, 'heartbeat timeout');
  }
}

export function overview() {
  return {
    nodes: [...nodes.values()].map((n) => ({
      nodeId: n.hb.nodeId,
      region: n.hb.region,
      url: n.hb.publicUrl,
      capacity: n.hb.capacity,
      draining: n.hb.draining || n.drainRequested,
      peers: n.hb.load.peers,
      pending: n.pending.size,
      rooms: n.hb.load.rooms,
      maxWorkerCpu: n.hb.load.maxWorkerCpu,
      lastSeenMsAgo: Date.now() - n.lastSeen,
    })),
    rooms: [...rooms.entries()].map(([key, entries]) => ({ key, nodes: [...entries.keys()] })),
  };
}
