import type { types } from 'mediasoup-client';
import {
  PUBLISHING_ROLES,
  type MediaKind,
  type NotificationMethod,
  type Notifications,
  type PeerInfo,
  type ProducerInfo,
  type Role,
} from '../../protocol/index';
import { allocate, renew } from './allocator';
import { Emitter } from './emitter';
import { isFatal, RtcError } from './errors';
import { Session } from './session';
import { qualityLevel, volumeToLevel } from './stats';
import type {
  ConnectionState,
  ConnectionStats,
  DisconnectReason,
  NetworkQuality,
  RemoteTrack,
  RemoteUser,
  VolumeLevel,
} from './types';

export type ClientConfig = {
  /** Your project's App ID. */
  appId: string;
  /** Base URL of the access point (allocator), e.g. https://api.example.com */
  allocatorUrl: string;
  /** Receive every remote track automatically (default true). */
  autoSubscribe?: boolean;
  /** Force all media through TURN, for testing strict networks. */
  forceRelay?: boolean;
  /** mediasoup-client handler, e.g. 'ReactNative106'. Detected automatically in browsers. */
  handlerName?: types.BuiltinHandlerName;
  /** How long to keep trying to reconnect before giving up (default 120 s). */
  reconnectTimeoutMs?: number;
};

export type JoinOptions = {
  channel: string;
  /** Your user's ID in your app. 1–64 characters: letters, digits, "_", "-" or ".". */
  uid: string;
  /** Access token from your backend. Leave out only for projects in testing mode. */
  token?: string | null;
  /** Starting role. Defaults to the highest role the token allows. */
  role?: Role;
  displayName?: string;
};

type Events = {
  connectionStateChanged: [state: ConnectionState, previous: ConnectionState, reason?: DisconnectReason];
  userJoined: [user: RemoteUser];
  userLeft: [user: RemoteUser];
  /** Role or display name changed. */
  userUpdated: [user: RemoteUser];
  trackSubscribed: [user: RemoteUser, track: RemoteTrack];
  trackUnsubscribed: [user: RemoteUser, track: RemoteTrack];
  userMuted: [user: RemoteUser, kind: MediaKind, muted: boolean];
  /** Every ~500 ms while anyone speaks. Loudest first. */
  volumeIndicator: [levels: VolumeLevel[]];
  /** The loudest speaker changed (null = silence). */
  activeSpeaker: [uid: string | null];
  networkQuality: [quality: NetworkQuality];
  /** Renew within ~30 s with renewToken(), or the session ends. */
  tokenWillExpire: [];
  tokenDidExpire: [];
  /** A host muted one of your tracks. You may unmute. */
  mutedByHost: [kind: MediaKind, by: string];
  /** Your own role changed (by you or by a host). */
  roleChanged: [role: Role, byHost: boolean];
  exception: [error: RtcError];
};

const RECONNECT_DELAYS_MS = [0, 300, 1000, 2000, 4000, 8000];
const QUALITY_INTERVAL_MS = 2000;
/** How long a user missing after our reconnect may take to reappear before we report userLeft. */
const MISSING_GRACE_MS = 5000;
const STATS_UPLOAD_EVERY = 5; // × QUALITY_INTERVAL_MS

const REMOVED_TO_REASON: Record<Notifications['removed']['reason'], DisconnectReason> = {
  kicked: 'kicked',
  channelEnded: 'channelEnded',
  tokenExpired: 'tokenExpired',
  replaced: 'replaced',
};

/** A track you publish. It survives reconnects: the SDK republishes it on the new node. */
export class LocalTrack {
  /** @internal */ producer: types.Producer | null = null;
  private _muted = false;

  constructor(
    readonly track: MediaStreamTrack,
    /** @internal */ readonly client: RtcClient,
    readonly appData: Record<string, unknown> = {},
  ) {}

  get kind(): MediaKind {
    return this.track.kind as MediaKind;
  }

  get muted(): boolean {
    return this._muted;
  }

  /** Stop sending (others see it as muted) without unpublishing. */
  async setMuted(muted: boolean): Promise<void> {
    this._muted = muted;
    await this.client._setTrackMuted(this, muted);
  }

  /** @internal Set by the SDK when the server muted this track. */
  _markMuted(): void {
    this._muted = true;
    this.producer?.pause();
  }

  /** Unpublish and stop the camera or microphone. */
  async close(): Promise<void> {
    await this.client.unpublish(this);
    this.track.stop();
  }
}

/**
 * The real-time client. One instance joins one channel at a time.
 *
 *   const client = new RtcClient({ appId, allocatorUrl });
 *   client.on('trackSubscribed', (user, track) => play(track));
 *   await client.join({ channel: 'room-1', uid: 'alice', token });
 *   await client.publish(micTrack);
 */
export class RtcClient extends Emitter<Events> {
  private session: Session | null = null;
  private state: ConnectionState = 'disconnected';
  private join_: JoinOptions | null = null;
  private token: string | null = null;
  private readonly local = new Set<LocalTrack>();
  private readonly users = new Map<string, RemoteUser>();
  private readonly missing = new Map<string, ReturnType<typeof setTimeout>>();
  private qualityTimer: ReturnType<typeof setInterval> | undefined;
  private qualityTicks = 0;
  private reconnecting = false;
  private leaving = false;
  private activeSpeakerUid: string | null = null;

  uid = '';
  channel = '';
  role: Role = 'audience';
  /** Highest role your token allows. */
  maxRole: Role = 'audience';
  /** The media node this client is connected to (for support and debugging). */
  nodeId = '';
  sessionExpiresAt: number | null = null;

  constructor(private readonly config: ClientConfig) {
    super();
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get remoteUsers(): RemoteUser[] {
    return [...this.users.values()];
  }

  get localTracks(): LocalTrack[] {
    return [...this.local];
  }

  async join(options: JoinOptions): Promise<void> {
    if (this.state !== 'disconnected') throw new RtcError('invalid_state', `Cannot join while ${this.state}`);
    this.join_ = options;
    this.token = options.token ?? null;
    this.leaving = false;
    this.setState('connecting');
    try {
      await this.connect([]);
    } catch (error) {
      this.teardown();
      this.setState('disconnected', 'error');
      throw error;
    }
    this.setState('connected');
    this.startQualityMonitor();
  }

  async leave(): Promise<void> {
    if (this.state === 'disconnected') return;
    this.leaving = true;
    const session = this.session;
    if (session && session.signaling.isOpen) await session.request('leave', {}, 2000).catch(() => {});
    this.teardown();
    this.setState('disconnected', 'leave');
  }

  /** Publish a microphone or camera track. Only hosts and speakers can publish. */
  async publish(input: MediaStreamTrack | LocalTrack, appData: Record<string, unknown> = {}): Promise<LocalTrack> {
    if (this.state === 'disconnected') throw new RtcError('not_joined', 'Join a channel first');
    if (!PUBLISHING_ROLES.includes(this.role)) throw new RtcError('not_publisher', 'Switch to the speaker or host role before publishing');
    const local = input instanceof LocalTrack ? input : new LocalTrack(input, this, appData);
    for (const other of this.local) {
      if (other !== local && other.kind === local.kind) throw new RtcError('invalid_state', `Already publishing a ${local.kind} track`);
    }
    this.local.add(local);
    if (this.session && this.state === 'connected') await this.produceOn(this.session, local);
    return local;
  }

  async unpublish(local: LocalTrack): Promise<void> {
    if (!this.local.delete(local)) return;
    const producer = local.producer;
    local.producer = null;
    if (!producer) return;
    producer.close();
    await this.session?.request('closeProducer', { producerId: producer.id }).catch(() => {});
  }

  /** Mute or unmute your published audio (true = mute). */
  async muteLocalAudio(muted: boolean): Promise<void> {
    for (const t of this.local) if (t.kind === 'audio') await t.setMuted(muted);
  }

  async muteLocalVideo(muted: boolean): Promise<void> {
    for (const t of this.local) if (t.kind === 'video') await t.setMuted(muted);
  }

  /** Switch between audience and speaker/host. Becoming audience unpublishes your tracks. */
  async setRole(role: Role): Promise<void> {
    const session = this.requireSession();
    await session.request('setRole', { role });
    this.applyOwnRole(role, false);
  }

  /** Give the SDK a new token before the old one expires (see the tokenWillExpire event). */
  async renewToken(token: string): Promise<void> {
    const session = this.requireSession();
    this.token = token;
    const res = await renew(this.config.allocatorUrl, {
      appId: this.config.appId,
      channel: this.channel,
      token,
      uid: this.uid,
    });
    const { sessionExpiresAt } = await session.request('renewTicket', { ticket: res.ticket });
    this.sessionExpiresAt = sessionExpiresAt;
  }

  /** Snapshot of connection quality for your own UI. */
  async getStats(): Promise<ConnectionStats> {
    return this.requireSession().getStats();
  }

  /** Receive a remote user's track manually (when autoSubscribe is false). */
  async subscribe(uid: string, kind: MediaKind): Promise<RemoteTrack | null> {
    const session = this.requireSession();
    const info = this.pendingProducers.get(`${uid}/${kind}`);
    if (!info) return null;
    return this.consume(session, info);
  }

  // ------------------------------------------------------------ host controls

  /** Host only: mute someone's audio or video. They can unmute themselves. */
  async muteRemoteUser(uid: string, kind: MediaKind = 'audio'): Promise<void> {
    await this.requireSession().request('muteParticipant', { uid, kind });
  }

  /** Host only: move someone on or off stage. Their token must allow the role. */
  async setRemoteUserRole(uid: string, role: Role): Promise<void> {
    await this.requireSession().request('setParticipantRole', { uid, role });
  }

  /** Host only: remove someone, optionally blocking them from rejoining for banSeconds. */
  async removeRemoteUser(uid: string, options: { banSeconds?: number } = {}): Promise<void> {
    await this.requireSession().request('removeParticipant', { uid, banSeconds: options.banSeconds });
  }

  /** Host only: end the channel for everyone. */
  async endChannel(): Promise<void> {
    await this.requireSession().request('endChannel', {});
  }

  // ------------------------------------------------------------ internals

  private readonly pendingProducers = new Map<string, ProducerInfo>();

  private requireSession(): Session {
    if (!this.session || this.state !== 'connected') throw new RtcError('not_joined', 'Not connected to a channel');
    return this.session;
  }

  /** Allocate, then open a session on the first reachable node. */
  private async connect(exclude: string[]): Promise<void> {
    const opts = this.join_!;
    const alloc = await allocate(this.config.allocatorUrl, {
      appId: this.config.appId,
      channel: opts.channel,
      token: this.token ?? undefined,
      uid: opts.uid,
      role: opts.role,
      exclude,
    });
    this.maxRole = alloc.maxRole;
    const desired = this.reconnecting ? this.role : (opts.role ?? alloc.maxRole);

    let lastError: unknown = new RtcError('no_edge_reachable', 'No media node could be reached');
    for (const edge of alloc.edges) {
      if (this.leaving) throw new RtcError('invalid_state', 'Left while connecting');
      const session: Session = new Session(
        {
          url: edge.url,
          ticket: alloc.ticket,
          displayName: opts.displayName ?? opts.uid,
          role: desired,
          handlerName: this.config.handlerName,
          forceRelay: this.config.forceRelay ?? false,
        },
        {
          notification: (method, data) => {
            if (this.session === session) this.onNotification(session, method, data);
          },
          lost: (reason) => {
            if (this.session === session) void this.onSessionLost(session, reason);
          },
        },
      );
      try {
        const joined = await session.open();
        this.session = session;
        this.uid = joined.uid;
        this.channel = opts.channel;
        this.role = desired;
        this.nodeId = session.nodeId;
        this.sessionExpiresAt = joined.sessionExpiresAt;
        this.syncUsers(joined.peers);
        this.pendingProducers.clear();
        for (const info of joined.producers) this.onNewProducer(session, info);
        session.adopt();
        await this.republish(session);
        return;
      } catch (error) {
        session.close();
        lastError = error;
        if (isFatal(error)) throw error;
      }
    }
    throw lastError;
  }

  private async republish(session: Session) {
    if (!PUBLISHING_ROLES.includes(this.role)) {
      for (const t of this.local) t.producer = null;
      this.local.clear();
      return;
    }
    for (const t of this.local) {
      t.producer = null;
      await this.produceOn(session, t).catch((error) => this.emit('exception', toRtcError(error)));
    }
  }

  private async produceOn(session: Session, local: LocalTrack) {
    const producer = await session.produce(local.track, local.appData);
    local.producer = producer;
    if (local.muted) {
      producer.pause();
      await session.request('pauseProducer', { producerId: producer.id });
    }
  }

  /** @internal */
  async _setTrackMuted(local: LocalTrack, muted: boolean): Promise<void> {
    const producer = local.producer;
    if (!producer || !this.session || this.state !== 'connected') return;
    if (muted) {
      producer.pause();
      await this.session.request('pauseProducer', { producerId: producer.id });
    } else {
      producer.resume();
      await this.session.request('resumeProducer', { producerId: producer.id });
    }
  }

  private async onSessionLost(session: Session, reason: string) {
    if (this.leaving || this.state === 'disconnected') return;
    this.dropRemoteTracks(session);

    if (session.removed) {
      const why = REMOVED_TO_REASON[session.removed.reason];
      if (why === 'tokenExpired') this.emit('tokenDidExpire');
      this.teardown();
      this.setState('disconnected', why);
      return;
    }
    await this.reconnect([session.nodeId], reason);
  }

  /** Move to another node: allocate again (skipping the failed one) and rejoin with the same tracks. */
  private async reconnect(exclude: string[], _reason: string) {
    if (this.reconnecting) return;
    this.reconnecting = true;
    if (this.session) {
      this.dropRemoteTracks(this.session);
      this.session.close();
    }
    this.session = null;
    this.setState('reconnecting');

    const deadline = Date.now() + (this.config.reconnectTimeoutMs ?? 120_000);
    let attempt = 0;
    while (!this.leaving && Date.now() < deadline) {
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]!;
      if (delay > 0) await sleep(delay);
      if (this.leaving) break;
      try {
        await this.connect(attempt === 0 ? exclude : []);
        this.reconnecting = false;
        this.setState('connected');
        return;
      } catch (error) {
        attempt++;
        if (isFatal(error)) {
          const err = toRtcError(error);
          if (err.code === 'token_expired') this.emit('tokenDidExpire');
          if (err.code === 'banned') {
            this.finish('kicked');
            return;
          }
          this.emit('exception', err);
          this.finish(err.code === 'token_expired' ? 'tokenExpired' : 'error');
          return;
        }
      }
    }
    this.finish(this.leaving ? 'leave' : 'network');
  }

  private finish(reason: DisconnectReason) {
    this.reconnecting = false;
    this.teardown();
    this.setState('disconnected', reason);
  }

  private teardown() {
    clearInterval(this.qualityTimer);
    this.qualityTimer = undefined;
    const session = this.session;
    this.session = null;
    if (session) {
      this.dropRemoteTracks(session);
      session.close();
    }
    for (const t of this.local) t.producer = null;
    this.local.clear();
    this.users.clear();
    for (const t of this.missing.values()) clearTimeout(t);
    this.missing.clear();
    this.pendingProducers.clear();
    this.activeSpeakerUid = null;
  }

  /** The node is gone: every remote track from it is dead. Users stay until the rejoin says otherwise. */
  private dropRemoteTracks(session: Session) {
    for (const id of [...session.consumers.keys()]) {
      const remote = session.dropConsumer(id);
      if (remote) this.detachTrack(remote);
    }
  }

  private detachTrack(remote: RemoteTrack) {
    const user = this.users.get(remote.uid);
    if (!user) return;
    if (remote.kind === 'audio' && user.audioTrack?.consumerId === remote.consumerId) user.audioTrack = null;
    if (remote.kind === 'video' && user.videoTrack?.consumerId === remote.consumerId) user.videoTrack = null;
    this.emit('trackUnsubscribed', user, remote);
  }

  /**
   * After (re)joining: reconcile our user list with the server's. Users missing after a reconnect
   * are usually still reconnecting themselves, so they get a grace period before userLeft.
   */
  private syncUsers(peers: PeerInfo[]) {
    const seen = new Set<string>();
    for (const info of peers) {
      seen.add(info.uid);
      this.upsertUser(info);
    }
    for (const uid of this.users.keys()) {
      if (seen.has(uid) || this.missing.has(uid)) continue;
      this.missing.set(
        uid,
        setTimeout(() => {
          this.missing.delete(uid);
          this.removeUser(uid);
        }, MISSING_GRACE_MS),
      );
    }
  }

  private removeUser(uid: string) {
    const pending = this.missing.get(uid);
    if (pending) clearTimeout(pending);
    this.missing.delete(uid);
    const user = this.users.get(uid);
    if (!user) return;
    const session = this.session;
    for (const t of [user.audioTrack, user.videoTrack]) {
      if (!t) continue;
      session?.dropConsumer(t.consumerId);
      this.detachTrack(t);
    }
    this.users.delete(uid);
    this.pendingProducers.delete(`${uid}/audio`);
    this.pendingProducers.delete(`${uid}/video`);
    this.emit('userLeft', user);
  }

  private upsertUser(info: PeerInfo): RemoteUser {
    const pending = this.missing.get(info.uid);
    if (pending) {
      clearTimeout(pending);
      this.missing.delete(info.uid);
    }
    const existing = this.users.get(info.uid);
    if (existing) {
      if (existing.role !== info.role || existing.displayName !== info.displayName) {
        existing.role = info.role;
        existing.displayName = info.displayName;
        this.emit('userUpdated', existing);
      }
      return existing;
    }
    const user: RemoteUser = { uid: info.uid, displayName: info.displayName, role: info.role, audioTrack: null, videoTrack: null };
    this.users.set(info.uid, user);
    this.emit('userJoined', user);
    return user;
  }

  private onNewProducer(session: Session, info: ProducerInfo) {
    this.pendingProducers.set(`${info.uid}/${info.kind}`, info);
    if (this.config.autoSubscribe !== false) void this.consume(session, info);
  }

  private async consume(session: Session, info: ProducerInfo): Promise<RemoteTrack | null> {
    try {
      const remote = await session.consume(info);
      if (!remote || session !== this.session) return null;
      const user = this.users.get(remote.uid) ?? this.upsertUser({ uid: remote.uid, displayName: remote.uid, role: 'speaker' });
      const previous = remote.kind === 'audio' ? user.audioTrack : user.videoTrack;
      if (previous) {
        session.dropConsumer(previous.consumerId);
        this.detachTrack(previous);
      }
      if (remote.kind === 'audio') user.audioTrack = remote;
      else user.videoTrack = remote;
      this.emit('trackSubscribed', user, remote);
      return remote;
    } catch (error) {
      if (session === this.session) this.emit('exception', toRtcError(error));
      return null;
    }
  }

  private applyOwnRole(role: Role, byHost: boolean) {
    this.role = role;
    if (!PUBLISHING_ROLES.includes(role)) {
      for (const t of this.local) {
        t.producer?.close();
        t.producer = null;
      }
      this.local.clear();
    }
    this.emit('roleChanged', role, byHost);
  }

  private onNotification<M extends NotificationMethod>(session: Session, method: M, data: Notifications[M]) {
    switch (method) {
      case 'peerJoined':
        this.upsertUser(data as Notifications['peerJoined']);
        break;
      case 'peerRoleChanged':
        this.upsertUser(data as Notifications['peerRoleChanged']);
        break;
      case 'peerLeft':
        this.removeUser((data as Notifications['peerLeft']).uid);
        break;
      case 'newProducer':
        this.onNewProducer(session, data as Notifications['newProducer']);
        break;
      case 'producerPaused':
      case 'producerResumed': {
        const { producerId, uid } = data as Notifications['producerPaused'];
        const muted = method === 'producerPaused';
        for (const [key, info] of this.pendingProducers) if (info.producerId === producerId) this.pendingProducers.set(key, { ...info, paused: muted });
        for (const { consumer, remote } of session.consumersOf(producerId)) {
          remote.muted = muted;
          if (muted) consumer.pause();
          else consumer.resume();
          const user = this.users.get(uid);
          if (user) this.emit('userMuted', user, remote.kind, muted);
        }
        break;
      }
      case 'producerClosed': {
        const { producerId, uid } = data as Notifications['producerClosed'];
        for (const [key, info] of this.pendingProducers) if (info.producerId === producerId) this.pendingProducers.delete(key);
        for (const { remote } of session.consumersOf(producerId)) {
          session.dropConsumer(remote.consumerId);
          this.detachTrack(remote);
        }
        void uid;
        break;
      }
      case 'consumerClosed': {
        const remote = session.dropConsumer((data as Notifications['consumerClosed']).consumerId);
        if (remote) this.detachTrack(remote);
        break;
      }
      case 'audioLevels': {
        const { levels } = data as Notifications['audioLevels'];
        const mapped = levels.map((l) => ({ uid: l.uid, level: volumeToLevel(l.volume) }));
        this.emit('volumeIndicator', mapped);
        const loudest = mapped.find((l) => l.level > 10)?.uid ?? null;
        if (loudest !== this.activeSpeakerUid) {
          this.activeSpeakerUid = loudest;
          this.emit('activeSpeaker', loudest);
        }
        break;
      }
      case 'mutedByHost': {
        const { kind, by } = data as Notifications['mutedByHost'];
        for (const t of this.local) if (t.kind === kind) t._markMuted();
        this.emit('mutedByHost', kind, by);
        break;
      }
      case 'roleChangedByHost':
        this.applyOwnRole((data as Notifications['roleChangedByHost']).role, true);
        break;
      case 'tokenWillExpire':
        this.emit('tokenWillExpire');
        break;
      case 'reconnectRequired':
        void this.reconnect([session.nodeId], 'node draining');
        break;
      case 'removed':
        // The socket closes right after; onSessionLost reads session.removed.
        break;
    }
  }

  private startQualityMonitor() {
    clearInterval(this.qualityTimer);
    this.qualityTicks = 0;
    this.qualityTimer = setInterval(() => void this.sampleQuality(), QUALITY_INTERVAL_MS);
  }

  private async sampleQuality() {
    const session = this.session;
    if (!session || this.state !== 'connected') {
      if (this.state === 'reconnecting') this.emit('networkQuality', { uplink: 6, downlink: 6, rttMs: null });
      return;
    }
    try {
      const s = await session.getStats();
      const hasUp = this.local.size > 0;
      this.emit('networkQuality', {
        uplink: hasUp ? qualityLevel(s.outbound.lossPercent, s.rttMs, 0) : 0,
        downlink: s.inbound.streams > 0 ? qualityLevel(s.inbound.lossPercent, s.rttMs, s.inbound.jitterMs) : 0,
        rttMs: s.rttMs,
      });
      if (++this.qualityTicks % STATS_UPLOAD_EVERY === 0) {
        await session.request('reportStats', {
          rttMs: s.rttMs,
          path: s.path,
          inKbps: s.inbound.bitrateKbps,
          outKbps: s.outbound.bitrateKbps,
          inLossPercent: s.inbound.lossPercent,
          outLossPercent: s.outbound.lossPercent,
          jitterMs: s.inbound.jitterMs,
        });
      }
    } catch {
      // Stats are best effort.
    }
  }

  private setState(state: ConnectionState, reason?: DisconnectReason) {
    if (state === this.state) return;
    const previous = this.state;
    this.state = state;
    this.emit('connectionStateChanged', state, previous, reason);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRtcError(error: unknown): RtcError {
  if (error instanceof RtcError) return error;
  return new RtcError('error', error instanceof Error ? error.message : String(error));
}
