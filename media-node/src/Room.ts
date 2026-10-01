import type { types } from 'mediasoup';
import {
  PUBLISHING_ROLES,
  type MediaKind,
  type NotificationMethod,
  type Notifications,
  type PeerInfo,
  type ProducerInfo,
  type Role,
} from '../../protocol/index';
import { roleAllowed } from '../../shared/auth';
import { createLogger } from '../../shared/logger';
import { config } from './config';
import type { Peer } from './Peer';
import { pickWorker, type WorkerEntry } from './workers';

const log = createLogger('room');

/** A host action, applied on whichever node the target is connected to. */
export type ModerationCommand =
  | { action: 'mute'; uid: string; kind: MediaKind; by: string }
  | { action: 'role'; uid: string; role: Role; by: string }
  | { action: 'remove'; uid: string; banSeconds: number; by: string };

/** What a room needs from a cascade link to another node (implemented in cluster.ts). */
export interface RoomLinkHandle {
  readonly remoteNodeId: string;
  pipeProducer(producer: types.Producer, uid: string): void;
  sendPeerJoined(info: PeerInfo, joinedAt: number): void;
  sendPeerLeft(uid: string): void;
  sendRoleChanged(info: PeerInfo): void;
  /** Run a host command on the other node; rejects with its ClientError. */
  moderate(command: ModerationCommand): Promise<void>;
  sendBan(uid: string, until: number): void;
  sendEnd(by: string): void;
  close(): void;
}

type BanHook = (ban: { appId: string; channel: string; uid: string; until: number }) => void;
let onBan: BanHook = () => {};
/** Called for every new ban (index.ts forwards it to the orchestrator). */
export function setBanHook(hook: BanHook): void {
  onBan = hook;
}

type RemotePeer = { info: PeerInfo; nodeId: string; joinedAt: number };
type RemoteProducer = { producer: types.Producer; uid: string; nodeId: string };

export class ClientError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * One channel of one app on this node: a mediasoup Router on one worker. When the channel also
 * lives on other nodes, each of them is a link: their participants show up here as remote peers
 * and their tracks arrive through a PipeTransport as remote producers.
 */
export class Room {
  /** Local participants by uid (connected; `joined` once they finished joining). */
  readonly peers = new Map<string, Peer>();
  readonly remotePeers = new Map<string, RemotePeer>();
  readonly remoteProducers = new Map<string, RemoteProducer>();
  readonly links = new Map<string, RoomLinkHandle>();
  /** uid → banned until (ms). */
  private readonly bans = new Map<string, number>();
  private closed = false;

  private constructor(
    readonly key: string,
    readonly appId: string,
    readonly channel: string,
    readonly workerEntry: WorkerEntry,
    readonly router: types.Router,
    private readonly audioLevelObserver: types.AudioLevelObserver,
    private readonly onClose: (room: Room) => void,
  ) {
    audioLevelObserver.on('volumes', (volumes) => {
      const levels = volumes.map((v) => ({ uid: String(v.producer.appData.uid), volume: v.volume }));
      this.broadcast('audioLevels', { levels });
    });
    audioLevelObserver.on('silence', () => this.broadcast('audioLevels', { levels: [] }));
  }

  static async create(key: string, appId: string, channel: string, onClose: (room: Room) => void): Promise<Room> {
    const workerEntry = pickWorker();
    const router = await workerEntry.worker.createRouter({
      mediaCodecs: config.mediasoup.mediaCodecs,
      appData: { key },
    });
    workerEntry.routerCount++;
    const audioLevelObserver = await router.createAudioLevelObserver({
      maxEntries: 8,
      threshold: -70,
      interval: config.room.audioLevelIntervalMs,
    });
    log.info('room created', { key, worker: workerEntry.index });
    return new Room(key, appId, channel, workerEntry, router, audioLevelObserver, onClose);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  // ------------------------------------------------------------ participants

  isBanned(uid: string): boolean {
    const until = this.bans.get(uid);
    if (until === undefined) return false;
    if (until > Date.now()) return true;
    this.bans.delete(uid);
    return false;
  }

  ban(uid: string, until: number, propagate: boolean): void {
    this.bans.set(uid, Math.max(until, this.bans.get(uid) ?? 0));
    if (!propagate) return;
    for (const link of this.links.values()) link.sendBan(uid, until);
    // The room may close on this node; the orchestrator keeps the ban for future allocations.
    onBan({ appId: this.appId, channel: this.channel, uid, until });
  }

  /** Add a local connection. An older connection with the same uid is replaced. */
  addPeer(peer: Peer): void {
    const existing = this.peers.get(peer.uid);
    if (existing && existing !== peer) {
      this.detach(existing);
      existing.remove('replaced');
    }
    this.peers.set(peer.uid, peer);
  }

  removePeer(peer: Peer): void {
    if (this.peers.get(peer.uid) !== peer) return;
    this.detach(peer);
    if (this.peers.size === 0) this.close();
  }

  /** Take a peer out of the room and tell everyone, without closing the room. */
  private detach(peer: Peer): void {
    this.peers.delete(peer.uid);
    if (peer.joined) {
      for (const producer of peer.producers.values()) {
        this.broadcast('producerClosed', { producerId: producer.id, uid: peer.uid }, peer.uid);
      }
      this.broadcast('peerLeft', { uid: peer.uid }, peer.uid);
      for (const link of this.links.values()) link.sendPeerLeft(peer.uid);
    }
    peer.closeMedia();
    peer.joined = false;
  }

  /** Joined participants on every node, except `exceptUid`. */
  participants(exceptUid?: string): PeerInfo[] {
    const list: PeerInfo[] = [];
    for (const peer of this.peers.values()) if (peer.joined && peer.uid !== exceptUid) list.push(peer.info());
    for (const [uid, remote] of this.remotePeers) if (uid !== exceptUid && !this.peers.has(uid)) list.push(remote.info);
    return list;
  }

  get participantCount(): number {
    return this.peers.size + this.remotePeers.size;
  }

  get speakerCount(): number {
    let count = 0;
    for (const peer of this.peers.values()) if (peer.joined && PUBLISHING_ROLES.includes(peer.role)) count++;
    for (const remote of this.remotePeers.values()) if (PUBLISHING_ROLES.includes(remote.info.role)) count++;
    return count;
  }

  /** Send a notification to every joined local peer, optionally skipping one. */
  broadcast<M extends NotificationMethod>(method: M, data: Notifications[M], exceptUid?: string): void {
    for (const peer of this.peers.values()) {
      if (peer.joined && peer.uid !== exceptUid) peer.notify(method, data);
    }
  }

  announceJoined(peer: Peer): void {
    this.broadcast('peerJoined', peer.info(), peer.uid);
    for (const link of this.links.values()) link.sendPeerJoined(peer.info(), peer.joinedAt);
  }

  announceRole(peer: Peer): void {
    this.broadcast('peerRoleChanged', peer.info(), peer.uid);
    for (const link of this.links.values()) link.sendRoleChanged(peer.info());
  }

  // ------------------------------------------------------------ producers

  async addLocalProducer(peer: Peer, producer: types.Producer): Promise<void> {
    peer.producers.set(producer.id, producer);
    producer.observer.on('close', () => {
      peer.producers.delete(producer.id);
      peer.updateVideoUsage();
    });
    peer.updateVideoUsage();
    await this.trackAudioLevel(producer);
    this.broadcast(
      'newProducer',
      { producerId: producer.id, uid: peer.uid, kind: producer.kind as MediaKind, paused: producer.paused },
      peer.uid,
    );
    for (const link of this.links.values()) link.pipeProducer(producer, peer.uid);
  }

  closeLocalProducer(peer: Peer, producer: types.Producer): void {
    producer.close();
    peer.producers.delete(producer.id);
    peer.updateVideoUsage();
    this.broadcast('producerClosed', { producerId: producer.id, uid: peer.uid }, peer.uid);
  }

  /** Producers everyone else can consume: local ones and those piped in from other nodes. */
  producersExcept(uid: string): ProducerInfo[] {
    const list: ProducerInfo[] = [];
    for (const peer of this.peers.values()) {
      if (peer.uid === uid || !peer.joined) continue;
      for (const producer of peer.producers.values()) {
        list.push({ producerId: producer.id, uid: peer.uid, kind: producer.kind as MediaKind, paused: producer.paused });
      }
    }
    for (const remote of this.remoteProducers.values()) {
      if (remote.uid === uid) continue;
      const { producer } = remote;
      list.push({ producerId: producer.id, uid: remote.uid, kind: producer.kind as MediaKind, paused: producer.paused });
    }
    return list;
  }

  findProducer(producerId: string): { producer: types.Producer; uid: string } | undefined {
    for (const peer of this.peers.values()) {
      const producer = peer.producers.get(producerId);
      if (producer) return { producer, uid: peer.uid };
    }
    const remote = this.remoteProducers.get(producerId);
    return remote ? { producer: remote.producer, uid: remote.uid } : undefined;
  }

  async trackAudioLevel(producer: types.Producer): Promise<void> {
    if (producer.kind === 'audio') {
      await this.audioLevelObserver.addProducer({ producerId: producer.id }).catch(() => {});
    }
  }

  // ------------------------------------------------------------ remote side (called by links)

  addRemotePeer(nodeId: string, info: PeerInfo, joinedAt: number): void {
    const local = this.peers.get(info.uid);
    if (local?.joined && local.joinedAt < joinedAt) {
      // The same user joined again on another node: the newer session wins.
      this.detach(local);
      local.remove('replaced');
    } else if (local?.joined) {
      return; // Ours is newer; the other node removes its copy.
    }
    const isNew = !this.remotePeers.has(info.uid);
    this.remotePeers.set(info.uid, { info, nodeId, joinedAt });
    this.broadcast(isNew ? 'peerJoined' : 'peerRoleChanged', info);
  }

  updateRemotePeer(nodeId: string, info: PeerInfo): void {
    const remote = this.remotePeers.get(info.uid);
    if (!remote || remote.nodeId !== nodeId) return;
    remote.info = info;
    this.broadcast('peerRoleChanged', info);
  }

  removeRemotePeer(nodeId: string, uid: string): void {
    const remote = this.remotePeers.get(uid);
    if (!remote || remote.nodeId !== nodeId) return;
    this.remotePeers.delete(uid);
    this.broadcast('peerLeft', { uid });
  }

  async addRemoteProducer(nodeId: string, producer: types.Producer, uid: string): Promise<void> {
    this.remoteProducers.set(producer.id, { producer, uid, nodeId });
    producer.observer.on('close', () => {
      if (this.remoteProducers.get(producer.id)?.producer !== producer) return;
      this.remoteProducers.delete(producer.id);
      this.broadcast('producerClosed', { producerId: producer.id, uid });
    });
    await this.trackAudioLevel(producer);
    this.broadcast('newProducer', { producerId: producer.id, uid, kind: producer.kind as MediaKind, paused: producer.paused });
  }

  async setRemoteProducerPaused(producerId: string, paused: boolean): Promise<void> {
    const remote = this.remoteProducers.get(producerId);
    if (!remote) return;
    if (paused) await remote.producer.pause();
    else await remote.producer.resume();
    this.broadcast(paused ? 'producerPaused' : 'producerResumed', { producerId, uid: remote.uid });
  }

  /** A link to another node closed: everything that came from it is gone. */
  dropNode(nodeId: string, link: RoomLinkHandle): void {
    if (this.links.get(nodeId) !== link) return;
    this.links.delete(nodeId);
    for (const remote of [...this.remoteProducers.values()]) {
      if (remote.nodeId === nodeId) remote.producer.close(); // the close observer tells local peers
    }
    for (const [uid, remote] of this.remotePeers) {
      if (remote.nodeId !== nodeId) continue;
      this.remotePeers.delete(uid);
      this.broadcast('peerLeft', { uid });
    }
  }

  // ------------------------------------------------------------ moderation

  /** Run a host command. Targets on other nodes are forwarded to their node. */
  async moderate(command: ModerationCommand): Promise<void> {
    const local = this.peers.get(command.uid);
    if (local?.joined) {
      await this.moderateLocal(local, command);
      return;
    }
    const remote = this.remotePeers.get(command.uid);
    if (!remote) throw new ClientError(`No participant with uid ${command.uid}`, 'not_found');
    const promote =
      command.action === 'role' && PUBLISHING_ROLES.includes(command.role) && !PUBLISHING_ROLES.includes(remote.info.role);
    if (promote && this.speakerCount >= config.room.maxSpeakers) {
      throw new ClientError('The speaker limit is reached', 'speaker_limit');
    }
    if (command.action === 'remove' && command.banSeconds > 0) {
      this.ban(command.uid, Date.now() + command.banSeconds * 1000, true);
    }
    const link = this.links.get(remote.nodeId);
    if (!link) throw new ClientError(`No participant with uid ${command.uid}`, 'not_found');
    await link.moderate(command);
  }

  async moderateLocal(target: Peer, command: ModerationCommand): Promise<void> {
    switch (command.action) {
      case 'mute': {
        for (const producer of target.producers.values()) {
          if (producer.kind !== command.kind || producer.paused) continue;
          await producer.pause();
          this.broadcast('producerPaused', { producerId: producer.id, uid: target.uid }, target.uid);
        }
        target.notify('mutedByHost', { kind: command.kind, by: command.by });
        return;
      }
      case 'role': {
        if (!roleAllowed(command.role, target.maxRole)) {
          throw new ClientError(`This user's token does not allow the ${command.role} role`, 'role_not_allowed');
        }
        if (command.role === target.role) return;
        const promote = PUBLISHING_ROLES.includes(command.role) && !PUBLISHING_ROLES.includes(target.role);
        if (promote && this.speakerCount >= config.room.maxSpeakers) {
          throw new ClientError('The speaker limit is reached', 'speaker_limit');
        }
        if (!PUBLISHING_ROLES.includes(command.role)) {
          for (const producer of [...target.producers.values()]) this.closeLocalProducer(target, producer);
        }
        target.role = command.role;
        target.notify('roleChangedByHost', { role: command.role, by: command.by });
        this.announceRole(target);
        return;
      }
      case 'remove': {
        if (command.banSeconds > 0) this.ban(target.uid, Date.now() + command.banSeconds * 1000, true);
        this.detach(target);
        target.remove('kicked', command.by);
        if (this.peers.size === 0) this.close();
        return;
      }
    }
  }

  /** End the channel on every node. */
  end(by: string, propagate: boolean): void {
    if (propagate) for (const link of this.links.values()) link.sendEnd(by);
    for (const peer of [...this.peers.values()]) {
      this.peers.delete(peer.uid);
      peer.closeMedia();
      peer.remove('channelEnded', by);
    }
    this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const link of [...this.links.values()]) link.close();
    this.links.clear();
    for (const peer of this.peers.values()) peer.closeMedia();
    this.peers.clear();
    this.router.close();
    this.workerEntry.routerCount--;
    log.info('room closed', { key: this.key });
    this.onClose(this);
  }
}
