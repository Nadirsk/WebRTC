import { Device, type types } from 'mediasoup-client';
import {
  PROTOCOL_VERSION,
  type IceServer,
  type MediaKind,
  type NotificationMethod,
  type Notifications,
  type ProducerInfo,
  type Requests,
  type Role,
  type TransportDirection,
} from '../../protocol/index';
import { RtcError } from './errors';
import { Signaling } from './signaling';
import { StatsCollector } from './stats';
import type { ConnectionStats, RemoteTrack } from './types';

const AUDIO_CODEC_OPTIONS: types.ProducerCodecOptions = { opusStereo: false, opusFec: true, opusDtx: true };
const PING_INTERVAL_MS = 3000;
const PING_TIMEOUT_MS = 2500;
const ICE_RECOVERY_MS = 8000;

export type SessionOptions = {
  url: string;
  ticket: string;
  displayName: string;
  role: Role;
  handlerName?: types.BuiltinHandlerName;
  forceRelay: boolean;
};

export type SessionEvents = {
  notification: <M extends NotificationMethod>(method: M, data: Notifications[M]) => void;
  /** The connection to this node is gone and cannot be repaired in place. */
  lost: (reason: string) => void;
};

type JoinResult = Requests['join'][1];

/**
 * One connection to one media node: signaling, the mediasoup Device and transports, and the
 * producers/consumers on them. When the node is lost the client throws the session away and
 * opens a new one elsewhere.
 */
export class Session {
  readonly signaling: Signaling;
  nodeId = '';
  maxRole: Role = 'audience';
  private device: Device | null = null;
  private iceServers: IceServer[] = [];
  private sendTransport: types.Transport | null = null;
  private sendTransportPromise: Promise<types.Transport> | null = null;
  private recvTransport: types.Transport | null = null;
  readonly consumers = new Map<string, { consumer: types.Consumer; remote: RemoteTrack }>();
  private readonly stats = new StatsCollector();
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private missedPings = 0;
  private iceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  closed = false;
  /** Set when the server ended the session on purpose (kick, end of channel, token expiry). */
  removed: Notifications['removed'] | null = null;

  constructor(
    private readonly options: SessionOptions,
    private readonly events: SessionEvents,
  ) {
    this.signaling = new Signaling(options.url);
    this.signaling.onNotification = (method, data) => {
      if (method === 'removed') this.removed = data as Notifications['removed'];
      if (this.buffered) this.buffered.push([method, data]);
      else this.events.notification(method, data);
    };
    this.signaling.onClose = (reason) => this.lose(reason);
  }

  /** Notifications that arrive while open() is still finishing, delivered by adopt(). */
  private buffered: [NotificationMethod, unknown][] | null = [];

  /** The client took this session: deliver what arrived during open() and everything after. */
  adopt(): void {
    const queued = this.buffered ?? [];
    this.buffered = null;
    for (const [method, data] of queued) this.events.notification(method, data as never);
  }

  /** Connect, present the ticket, join and prepare to receive. */
  async open(): Promise<JoinResult> {
    await this.signaling.open();
    const connected = await this.signaling.request('connect', { protocolVersion: PROTOCOL_VERSION, ticket: this.options.ticket });
    this.nodeId = connected.nodeId;
    this.maxRole = connected.maxRole;

    this.device = this.options.handlerName
      ? await Device.factory({ handlerName: this.options.handlerName })
      : await Device.factory();
    await this.device.load({ routerRtpCapabilities: connected.routerRtpCapabilities as unknown as types.RtpCapabilities });

    const joined = await this.signaling.request('join', {
      displayName: this.options.displayName,
      role: this.options.role,
      rtpCapabilities: this.device.recvRtpCapabilities as unknown as Record<string, unknown>,
    });
    this.iceServers = joined.iceServers;
    this.recvTransport = await this.createTransport('recv');
    this.startPings();
    return joined;
  }

  request<M extends keyof Requests>(method: M, data: Requests[M][0], timeoutMs?: number): Promise<Requests[M][1]> {
    return this.signaling.request(method, data, timeoutMs);
  }

  async produce(track: MediaStreamTrack, appData: Record<string, unknown>): Promise<types.Producer> {
    const transport = await this.ensureSendTransport();
    return transport.produce({
      track,
      codecOptions: track.kind === 'audio' ? AUDIO_CODEC_OPTIONS : undefined,
      stopTracks: false,
      appData,
    });
  }

  async consume(info: ProducerInfo): Promise<RemoteTrack | null> {
    if (!this.recvTransport || this.closed) return null;
    const params = await this.signaling.request('consume', { transportId: this.recvTransport.id, producerId: info.producerId });
    const consumer = await this.recvTransport.consume({
      id: params.consumerId,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters as unknown as types.RtpParameters,
    });
    const remote: RemoteTrack = {
      uid: params.uid,
      kind: params.kind,
      track: consumer.track,
      muted: info.paused,
      producerId: params.producerId,
      consumerId: consumer.id,
    };
    this.consumers.set(consumer.id, { consumer, remote });
    await this.signaling.request('resumeConsumer', { consumerId: consumer.id });
    return remote;
  }

  /** Remove a consumer locally. Returns the remote track it carried. */
  dropConsumer(consumerId: string): RemoteTrack | null {
    const entry = this.consumers.get(consumerId);
    if (!entry) return null;
    this.consumers.delete(consumerId);
    entry.consumer.close();
    return entry.remote;
  }

  consumersOf(producerId: string) {
    return [...this.consumers.values()].filter((c) => c.remote.producerId === producerId);
  }

  getStats(): Promise<ConnectionStats> {
    return this.stats.collect([this.recvTransport, this.sendTransport]);
  }

  /** Close everything. Does not tell the server anything; call leave first for a clean exit. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pingTimer);
    for (const t of this.iceTimers.values()) clearTimeout(t);
    for (const { consumer } of this.consumers.values()) consumer.close();
    this.consumers.clear();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.signaling.close();
  }

  private lose(reason: string) {
    if (this.closed) return;
    this.close();
    this.events.lost(reason);
  }

  private startPings() {
    this.pingTimer = setInterval(() => {
      this.signaling
        .request('ping', {}, PING_TIMEOUT_MS)
        .then(() => (this.missedPings = 0))
        .catch(() => {
          if (++this.missedPings >= 2) this.lose('ping timeout');
        });
    }, PING_INTERVAL_MS);
  }

  private ensureSendTransport(): Promise<types.Transport> {
    if (this.sendTransport && !this.sendTransport.closed) return Promise.resolve(this.sendTransport);
    this.sendTransportPromise ??= this.createTransport('send')
      .then((t) => {
        this.sendTransport = t;
        return t;
      })
      .finally(() => (this.sendTransportPromise = null));
    return this.sendTransportPromise;
  }

  private async createTransport(direction: TransportDirection): Promise<types.Transport> {
    if (!this.device) throw new RtcError('invalid_state', 'Not connected');
    const info = await this.signaling.request('createWebRtcTransport', { direction });
    const options: types.TransportOptions = {
      id: info.id,
      iceParameters: info.iceParameters as unknown as types.IceParameters,
      iceCandidates: info.iceCandidates as unknown as types.IceCandidate[],
      dtlsParameters: info.dtlsParameters as unknown as types.DtlsParameters,
      iceServers: this.iceServers,
      iceTransportPolicy: this.options.forceRelay ? 'relay' : 'all',
    };
    const transport =
      direction === 'send' ? this.device.createSendTransport(options) : this.device.createRecvTransport(options);

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this.signaling
        .request('connectTransport', { transportId: transport.id, dtlsParameters: dtlsParameters as unknown as Record<string, unknown> })
        .then(() => callback())
        .catch(errback);
    });
    if (direction === 'send') {
      transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        this.signaling
          .request('produce', {
            transportId: transport.id,
            kind: kind as MediaKind,
            rtpParameters: rtpParameters as unknown as Record<string, unknown>,
            appData,
          })
          .then(({ producerId }) => callback({ id: producerId }))
          .catch(errback);
      });
    }
    transport.on('connectionstatechange', (state) => this.onTransportState(transport, state));
    return transport;
  }

  /**
   * Network blips: restart ICE on the same node (keeps the session). If the transport does not
   * recover in time, report the session as lost so the client moves to another node.
   */
  private onTransportState(transport: types.Transport, state: string) {
    const pending = this.iceTimers.get(transport.id);
    if (state === 'connected') {
      if (pending) clearTimeout(pending);
      this.iceTimers.delete(transport.id);
      return;
    }
    if ((state === 'disconnected' || state === 'failed') && !pending && !this.closed) {
      void this.restartIce(transport);
      this.iceTimers.set(
        transport.id,
        setTimeout(() => {
          this.iceTimers.delete(transport.id);
          if (transport.connectionState !== 'connected') this.lose('media connection failed');
        }, ICE_RECOVERY_MS),
      );
    }
  }

  private async restartIce(transport: types.Transport) {
    try {
      const { iceParameters } = await this.signaling.request('restartIce', { transportId: transport.id });
      await transport.restartIce({ iceParameters: iceParameters as unknown as types.IceParameters });
    } catch {
      // The recovery timer decides what happens next.
    }
  }
}
