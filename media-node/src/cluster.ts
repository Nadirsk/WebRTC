import type { IncomingMessage } from 'node:http';
import type { types } from 'mediasoup';
import WebSocket from 'ws';
import type { MediaKind, PeerInfo } from '../../protocol/index';
import { hasClusterSecret } from '../../shared/http';
import { createLogger } from '../../shared/logger';
import { config } from './config';
import { ClientError, type ModerationCommand, type Room, type RoomLinkHandle } from './Room';
import { getRoom } from './rooms';

/**
 * Cascading between media nodes. When a channel lives on several nodes, every pair of those nodes
 * keeps one RoomLink: a PipeTransport pair for RTP plus control messages over a WebSocket between
 * the nodes. Each node pipes only its own local tracks and announces only its own local peers, so
 * a full mesh of links gives every node the whole room.
 */

const log = createLogger('cluster');

type Frame =
  | { id: number; method: string; data: unknown }
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: string }
  | { method: string; data: unknown };

type RequestHandler = (link: NodeLink, data: any) => Promise<{ data: unknown; after?: () => void }>;
type NotificationHandler = (link: NodeLink, data: any) => void;

/** One WebSocket between this node and another. Carries control messages for many rooms. */
class NodeLink {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (d: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  readonly roomLinks = new Set<RoomLink>();
  closed = false;

  constructor(
    readonly remoteNodeId: string,
    private readonly ws: WebSocket,
  ) {
    ws.on('message', (raw) => this.onMessage(raw.toString()));
    ws.on('close', () => this.onClose());
    ws.on('error', (error) => log.warn('node link error', { remote: remoteNodeId, error: String(error) }));
  }

  request<T = any>(method: string, data: unknown, timeoutMs = 5000): Promise<T> {
    if (this.closed) return Promise.reject(new Error('link closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, data }));
    });
  }

  notify(method: string, data: unknown): void {
    if (!this.closed && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ method, data }));
  }

  close(): void {
    this.ws.close();
  }

  private onMessage(raw: string) {
    let frame: Frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if ('ok' in frame) {
      const p = this.pending.get(frame.id);
      if (!p) return;
      this.pending.delete(frame.id);
      clearTimeout(p.timer);
      if (frame.ok) p.resolve(frame.data);
      else p.reject(new Error(frame.error));
      return;
    }
    if ('id' in frame) {
      const handler = requestHandlers[frame.method];
      const id = frame.id;
      if (!handler) {
        this.ws.send(JSON.stringify({ id, ok: false, error: `unknown method ${frame.method}` }));
        return;
      }
      handler(this, frame.data)
        .then(({ data, after }) => {
          if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ id, ok: true, data }));
          after?.();
        })
        .catch((error: Error) => {
          if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ id, ok: false, error: error.message }));
        });
      return;
    }
    notificationHandlers[frame.method]?.(this, frame.data);
  }

  private onClose() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('link closed'));
    }
    this.pending.clear();
    for (const roomLink of [...this.roomLinks]) roomLink.close(false);
    if (outgoing.get(this.remoteNodeId) === this) outgoing.delete(this.remoteNodeId);
    log.info('node link closed', { remote: this.remoteNodeId });
  }
}

/** The part of a room shared with one other node. */
class RoomLink implements RoomLinkHandle {
  private queue: Promise<void>;
  private release: () => void = () => {};
  private readonly outgoing = new Map<string, types.Consumer>();
  private closed = false;

  constructor(
    readonly room: Room,
    readonly remoteNodeId: string,
    readonly nodeLink: NodeLink,
    readonly transport: types.PipeTransport,
    ready: boolean,
  ) {
    // Until the pipe is connected, queue everything (outgoing tracks and incoming messages).
    this.queue = ready ? Promise.resolve() : new Promise((resolve) => (this.release = resolve));
    nodeLink.roomLinks.add(this);
  }

  markReady(): void {
    this.release();
  }

  private enqueue(task: () => Promise<void> | void): void {
    this.queue = this.queue
      .then(async () => {
        if (!this.closed) await task();
      })
      .catch((error) => log.warn('room link task failed', { key: this.room.key, remote: this.remoteNodeId, error: String(error) }));
  }

  private send(method: string, data: Record<string, unknown>): void {
    this.nodeLink.notify(method, { key: this.room.key, ...data });
  }

  pipeProducer(producer: types.Producer, uid: string): void {
    this.enqueue(async () => {
      if (producer.closed || this.outgoing.has(producer.id)) return;
      const consumer = await this.transport.consume({ producerId: producer.id });
      this.outgoing.set(producer.id, consumer);
      consumer.on('producerclose', () => {
        this.outgoing.delete(producer.id);
        this.send('pipe.producerClosed', { producerId: producer.id });
      });
      consumer.on('producerpause', () => this.send('pipe.producerPaused', { producerId: producer.id, paused: true }));
      consumer.on('producerresume', () => this.send('pipe.producerPaused', { producerId: producer.id, paused: false }));
      this.send('pipe.producer', {
        producerId: producer.id,
        uid,
        kind: producer.kind,
        rtpParameters: consumer.rtpParameters,
        paused: producer.paused,
      });
    });
  }

  sendPeerJoined(info: PeerInfo, joinedAt: number): void {
    this.enqueue(() => this.send('room.peerJoined', { info, joinedAt }));
  }
  sendPeerLeft(uid: string): void {
    this.enqueue(() => this.send('room.peerLeft', { uid }));
  }
  sendRoleChanged(info: PeerInfo): void {
    this.enqueue(() => this.send('room.peerRole', { info }));
  }
  async moderate(command: ModerationCommand): Promise<void> {
    const res = await this.nodeLink.request<{ error?: string; code?: string }>('room.moderate', { key: this.room.key, command });
    if (res.error) throw new ClientError(res.error, res.code);
  }
  sendBan(uid: string, until: number): void {
    this.enqueue(() => this.send('room.ban', { uid, until }));
  }
  sendEnd(by: string): void {
    this.send('room.end', { by });
  }

  /** Handle a message from the other node, in order. */
  handle(method: string, data: any): void {
    this.enqueue(async () => {
      const room = this.room;
      switch (method) {
        case 'pipe.producer': {
          const producer = await this.transport.produce({
            id: data.producerId,
            kind: data.kind as MediaKind,
            rtpParameters: data.rtpParameters,
            paused: data.paused,
            appData: { uid: data.uid, remoteNode: this.remoteNodeId },
          });
          await room.addRemoteProducer(this.remoteNodeId, producer, data.uid);
          return;
        }
        case 'pipe.producerClosed': {
          const remote = room.remoteProducers.get(data.producerId);
          if (remote?.nodeId === this.remoteNodeId) remote.producer.close();
          return;
        }
        case 'pipe.producerPaused':
          await room.setRemoteProducerPaused(data.producerId, data.paused);
          return;
        case 'room.peerJoined':
          room.addRemotePeer(this.remoteNodeId, data.info, data.joinedAt);
          return;
        case 'room.peerLeft':
          room.removeRemotePeer(this.remoteNodeId, data.uid);
          return;
        case 'room.peerRole':
          room.updateRemotePeer(this.remoteNodeId, data.info);
          return;
        case 'room.ban':
          room.ban(data.uid, data.until, false);
          return;
        case 'room.end':
          room.end(data.by, false);
          return;
        case 'pipe.close':
          this.close(false);
          return;
      }
    });
  }

  /** Close this link. `notify` tells the other node (not needed when the connection itself died). */
  close(notify = true): void {
    if (this.closed) return;
    this.closed = true;
    this.release();
    if (notify) this.send('pipe.close', {});
    this.transport.close();
    this.nodeLink.roomLinks.delete(this);
    this.room.dropNode(this.remoteNodeId, this);
  }

  /** Drop a link that lost a race with the other node's link, without touching room state. */
  abandon(): void {
    this.closed = true;
    this.release();
    this.transport.close();
    this.nodeLink.roomLinks.delete(this);
  }
}

// ------------------------------------------------------------ connections

const outgoing = new Map<string, NodeLink>();
const connecting = new Map<string, Promise<NodeLink>>();

function connectTo(nodeId: string, url: string): Promise<NodeLink> {
  const existing = outgoing.get(nodeId);
  if (existing && !existing.closed) return Promise.resolve(existing);
  const pending = connecting.get(nodeId);
  if (pending) return pending;

  const promise = new Promise<NodeLink>((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: { 'x-cluster-secret': config.secret, 'x-node-id': config.nodeId },
      handshakeTimeout: 3000,
    });
    ws.once('open', () => {
      const link = new NodeLink(nodeId, ws);
      outgoing.set(nodeId, link);
      log.info('node link opened', { remote: nodeId });
      resolve(link);
    });
    ws.once('error', reject);
  }).finally(() => connecting.delete(nodeId));
  connecting.set(nodeId, promise);
  return promise;
}

/** Upgrade handler for /cluster. Other media nodes connect here. */
export function acceptClusterConnection(ws: WebSocket, req: IncomingMessage): void {
  const remote = req.headers['x-node-id'];
  if (!hasClusterSecret(req, config.secret) || typeof remote !== 'string') {
    ws.close(4001, 'unauthorized');
    return;
  }
  new NodeLink(remote, ws);
}

export function verifyClusterUpgrade(req: IncomingMessage): boolean {
  return hasClusterSecret(req, config.secret) && typeof req.headers['x-node-id'] === 'string';
}

function pipeListenInfo() {
  const { listenIp, announcedAddress } = config.mediasoup.pipe;
  return { protocol: 'udp' as const, ip: listenIp, announcedAddress };
}

function localPeerList(room: Room) {
  return [...room.peers.values()].filter((p) => p.joined).map((p) => ({ info: p.info(), joinedAt: p.joinedAt }));
}

const establishing = new Set<string>();

/** Make sure `room` is linked with `nodeId`. Safe to call repeatedly (heartbeats do). */
export async function ensureLink(room: Room, nodeId: string, clusterUrl: string): Promise<void> {
  const tag = `${room.key}|${nodeId}`;
  if (nodeId === config.nodeId || room.isClosed || room.links.has(nodeId) || establishing.has(tag)) return;
  establishing.add(tag);

  let link: RoomLink | undefined;
  try {
    const nodeLink = await connectTo(nodeId, clusterUrl);
    if (room.isClosed || room.links.has(nodeId)) return;
    const transport = await room.router.createPipeTransport({ listenInfo: pipeListenInfo(), enableRtx: true });
    link = new RoomLink(room, nodeId, nodeLink, transport, false);
    room.links.set(nodeId, link);

    const res = await nodeLink.request<{ ip: string; port: number; peers: { info: PeerInfo; joinedAt: number }[] }>(
      'pipe.open',
      { key: room.key, ip: transport.tuple.localAddress, port: transport.tuple.localPort, peers: localPeerList(room) },
    );
    if (room.links.get(nodeId) !== link) {
      link.abandon();
      return;
    }
    await transport.connect({ ip: res.ip, port: res.port });
    for (const p of res.peers) room.addRemotePeer(nodeId, p.info, p.joinedAt);
    link.markReady();
    pipeAllLocal(room, link);
    log.info('room linked', { key: room.key, remote: nodeId, initiator: true });
  } catch (error) {
    const message = (error as Error).message;
    if (link && room.links.get(nodeId) === link) link.close(false);
    else link?.abandon();
    if (message !== 'conflict' && message !== 'exists' && message !== 'no_room') {
      log.warn('room link failed', { key: room.key, remote: nodeId, error: message });
    }
  } finally {
    establishing.delete(tag);
  }
}

function pipeAllLocal(room: Room, link: RoomLink) {
  for (const peer of room.peers.values()) {
    if (!peer.joined) continue;
    for (const producer of peer.producers.values()) link.pipeProducer(producer, peer.uid);
  }
}

const requestHandlers: Record<string, RequestHandler> = {
  async 'pipe.open'(nodeLink, data: { key: string; ip: string; port: number; peers: { info: PeerInfo; joinedAt: number }[] }) {
    const room = getRoom(data.key);
    if (!room) throw new Error('no_room');
    const from = nodeLink.remoteNodeId;
    const existing = room.links.get(from) as RoomLink | undefined;
    if (existing) {
      if (establishing.has(`${room.key}|${from}`)) {
        // Both nodes started a link at once. The one started by the lower node ID wins.
        if (config.nodeId < from) throw new Error('conflict');
        existing.abandon();
        room.links.delete(from);
      } else {
        throw new Error('exists');
      }
    }

    const transport = await room.router.createPipeTransport({ listenInfo: pipeListenInfo(), enableRtx: true });
    await transport.connect({ ip: data.ip, port: data.port });
    const link = new RoomLink(room, from, nodeLink, transport, true);
    room.links.set(from, link);
    for (const p of data.peers) room.addRemotePeer(from, p.info, p.joinedAt);
    log.info('room linked', { key: room.key, remote: from, initiator: false });

    return {
      data: { ip: transport.tuple.localAddress, port: transport.tuple.localPort, peers: localPeerList(room) },
      // Tracks go out only after the response, so the initiator has connected its pipe first.
      after: () => pipeAllLocal(room, link),
    };
  },
};

requestHandlers['room.moderate'] = async (nodeLink, data: { key: string; command: ModerationCommand }) => {
  const room = getRoom(data.key);
  const link = room?.links.get(nodeLink.remoteNodeId);
  const target = room?.peers.get(data.command.uid);
  if (!room || !link || !target?.joined) return { data: { error: `No participant with uid ${data.command.uid}`, code: 'not_found' } };
  try {
    await room.moderateLocal(target, data.command);
    return { data: {} };
  } catch (error) {
    if (error instanceof ClientError) return { data: { error: error.message, code: error.code } };
    throw error;
  }
};

const ROOM_METHODS = [
  'pipe.producer',
  'pipe.producerClosed',
  'pipe.producerPaused',
  'pipe.close',
  'room.peerJoined',
  'room.peerLeft',
  'room.peerRole',
  'room.ban',
  'room.end',
];

const notificationHandlers: Record<string, NotificationHandler> = Object.fromEntries(
  ROOM_METHODS.map((method) => [
    method,
    (nodeLink: NodeLink, data: { key: string }) => {
      const link = getRoom(data.key)?.links.get(nodeLink.remoteNodeId) as RoomLink | undefined;
      if (link && link.nodeLink === nodeLink) link.handle(method, data);
    },
  ]),
);

export function linkCount(): number {
  let n = 0;
  for (const link of outgoing.values()) n += link.roomLinks.size;
  return n;
}
