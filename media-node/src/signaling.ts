import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { types } from 'mediasoup';
import type { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  PUBLISHING_ROLES,
  type MediaKind,
  type RequestFrame,
  type RequestMethod,
  type Requests,
  type ResponseFrame,
  type TransportDirection,
} from '../../protocol/index';
import { AuthError, isName, isRole, roleAllowed, verifyEdgeTicket } from '../../shared/auth';
import { createLogger } from '../../shared/logger';
import { config } from './config';
import { emitEvent, isDraining } from './orchestrator';
import { Peer } from './Peer';
import { ClientError, type Room } from './Room';
import { getOrCreateRoom } from './rooms';
import { turnIceServers } from './turn';

const log = createLogger('signaling');

const MAX_TRANSPORTS_PER_PEER = 4;
const MAX_PRODUCERS_PER_PEER = 3;
const PING_INTERVAL_MS = 10_000;
const MIN_STATS_INTERVAL_MS = 2000;

type Handler<M extends RequestMethod> = (data: Requests[M][0]) => Promise<Requests[M][1]>;
type HandlerMap = { [M in RequestMethod]: Handler<M> };

const num = (v: unknown, max = 1e7) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(v, max)) : 0);

export function handleConnection(ws: WebSocket, req: IncomingMessage): void {
  const remote = req.socket.remoteAddress;
  let peer: Peer | null = null;
  let room: Room | null = null;
  let sessionStarted = false;
  let endReason = 'left';
  let warnTimer: NodeJS.Timeout | undefined;
  let expireTimer: NodeJS.Timeout | undefined;
  let lastStatsAt = 0;

  const send = (frame: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
  };

  // Detect dead connections (phone lost network) faster than TCP would.
  let alive = true;
  ws.on('pong', () => (alive = true));
  const pinger = setInterval(() => {
    if (!alive) {
      endReason = 'timeout';
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, PING_INTERVAL_MS);

  const clearTokenTimers = () => {
    clearTimeout(warnTimer);
    clearTimeout(expireTimer);
  };

  const scheduleTokenTimers = (p: Peer) => {
    clearTokenTimers();
    if (p.sessionExp === null) return;
    const msLeft = p.sessionExp * 1000 - Date.now();
    const warnIn = msLeft - config.room.tokenWarningSeconds * 1000;
    warnTimer = setTimeout(() => p.notify('tokenWillExpire', { expiresAt: p.sessionExp! }), Math.max(0, warnIn));
    expireTimer = setTimeout(() => {
      endReason = 'tokenExpired';
      if (room) room.removePeer(p);
      p.remove('tokenExpired');
    }, Math.max(0, msLeft));
  };

  const leaveRoom = () => {
    clearTokenTimers();
    if (room && peer) room.removePeer(peer);
    if (peer && sessionStarted) {
      sessionStarted = false;
      emitEvent({ type: 'session.end', sid: peer.sid, at: Date.now(), videoMs: peer.totalVideoMs(), reason: endReason });
    }
    room = null;
  };

  const requireConnected = (): { p: Peer; r: Room } => {
    if (!peer || !room || room.isClosed) throw new ClientError('Call connect first', 'not_connected');
    return { p: peer, r: room };
  };

  const requireJoined = (): { p: Peer; r: Room } => {
    const ctx = requireConnected();
    if (!ctx.p.joined) throw new ClientError('Not joined', 'not_joined');
    return ctx;
  };

  const requireHost = (): { p: Peer; r: Room } => {
    const ctx = requireJoined();
    if (ctx.p.role !== 'host') throw new ClientError('Only hosts can do this', 'not_host');
    return ctx;
  };

  const verifyTicket = (ticket: string) => {
    try {
      return verifyEdgeTicket(ticket, config.secret);
    } catch (error) {
      if (error instanceof AuthError) throw new ClientError(error.message, error.code);
      throw error;
    }
  };

  const getTransport = (p: Peer, transportId: string, direction?: TransportDirection) => {
    const transport = p.transports.get(transportId);
    if (!transport) throw new ClientError('Unknown transport');
    if (direction && transport.appData.direction !== direction) {
      throw new ClientError(`Transport is not a ${direction} transport`);
    }
    return transport;
  };

  const getOwnProducer = (p: Peer, producerId: string): types.Producer => {
    const producer = p.producers.get(producerId);
    if (!producer) throw new ClientError('Unknown producer');
    return producer;
  };

  const handlers: HandlerMap = {
    async connect({ protocolVersion, ticket }) {
      if (protocolVersion !== PROTOCOL_VERSION) {
        throw new ClientError(
          `Protocol version ${protocolVersion} is not supported (server speaks ${PROTOCOL_VERSION}); update the SDK`,
          'unsupported_protocol',
        );
      }
      if (peer) throw new ClientError('Already connected', 'already_connected');
      if (isDraining()) throw new ClientError('This media node is draining; allocate again', 'node_draining');
      const t = verifyTicket(ticket);

      const r = await getOrCreateRoom(t.appId, t.channel);
      if (r.isBanned(t.uid)) throw new ClientError('You were removed from this channel', 'banned');
      if (r.participantCount >= config.room.maxPeers) throw new ClientError('Channel is full', 'channel_full');

      const p = new Peer(randomUUID(), t.uid, t.role, send, (code, reason) => ws.close(code, reason));
      p.sessionExp = t.sessionExp;
      r.addPeer(p);
      peer = p;
      room = r;
      log.info('connected', { sid: p.sid, key: r.key, uid: p.uid, remote });
      return {
        routerRtpCapabilities: r.router.rtpCapabilities as Record<string, unknown>,
        uid: p.uid,
        channel: r.channel,
        nodeId: config.nodeId,
        maxRole: p.maxRole,
      };
    },

    async join({ displayName, role, rtpCapabilities }) {
      const { p, r } = requireConnected();
      if (p.joined) throw new ClientError('Already joined', 'already_joined');
      if (!isRole(role)) throw new ClientError('Invalid role');
      if (!roleAllowed(role, p.maxRole)) throw new ClientError(`Your token does not allow the ${role} role`, 'role_not_allowed');
      const name = typeof displayName === 'string' ? displayName.trim().slice(0, 64) : '';
      if (PUBLISHING_ROLES.includes(role) && r.speakerCount >= config.room.maxSpeakers) {
        throw new ClientError(`Channel already has the maximum of ${config.room.maxSpeakers} speakers`, 'speaker_limit');
      }

      p.displayName = name || p.uid;
      p.role = role;
      p.rtpCapabilities = rtpCapabilities as unknown as types.RtpCapabilities;
      p.joined = true;
      p.joinedAt = Date.now();
      sessionStarted = true;
      emitEvent({
        type: 'session.start',
        sid: p.sid,
        nodeId: config.nodeId,
        appId: r.appId,
        channel: r.channel,
        uid: p.uid,
        role,
        at: p.joinedAt,
      });
      scheduleTokenTimers(p);

      const peers = r.participants(p.uid);
      r.announceJoined(p);
      log.info('joined', { sid: p.sid, key: r.key, uid: p.uid, role, local: r.peers.size, total: r.participantCount });
      return {
        uid: p.uid,
        peers,
        producers: r.producersExcept(p.uid),
        iceServers: turnIceServers(p.sid),
        sessionExpiresAt: p.sessionExp,
      };
    },

    async createWebRtcTransport({ direction }) {
      const { p, r } = requireJoined();
      if (direction !== 'send' && direction !== 'recv') throw new ClientError('direction must be "send" or "recv"');
      if (p.transports.size >= MAX_TRANSPORTS_PER_PEER) throw new ClientError('Too many transports');

      const { webRtcTransport } = config.mediasoup;
      const transport = await r.router.createWebRtcTransport({
        webRtcServer: r.workerEntry.webRtcServer,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: webRtcTransport.initialAvailableOutgoingBitrate,
        appData: { direction, sid: p.sid },
      });
      if (direction === 'send') await transport.setMaxIncomingBitrate(webRtcTransport.maxIncomingBitrate);
      transport.on('dtlsstatechange', (state) => {
        if (state === 'failed' || state === 'closed') {
          log.warn('transport dtls ended', { sid: p.sid, transportId: transport.id, state });
        }
      });
      transport.observer.on('close', () => p.transports.delete(transport.id));
      p.transports.set(transport.id, transport);

      return {
        id: transport.id,
        iceParameters: transport.iceParameters as unknown as Record<string, unknown>,
        iceCandidates: transport.iceCandidates as unknown as Record<string, unknown>[],
        dtlsParameters: transport.dtlsParameters as unknown as Record<string, unknown>,
      };
    },

    async connectTransport({ transportId, dtlsParameters }) {
      const { p } = requireJoined();
      await getTransport(p, transportId).connect({ dtlsParameters: dtlsParameters as unknown as types.DtlsParameters });
      return {};
    },

    async restartIce({ transportId }) {
      const { p } = requireJoined();
      const iceParameters = await getTransport(p, transportId).restartIce();
      return { iceParameters: iceParameters as unknown as Record<string, unknown> };
    },

    async produce({ transportId, kind, rtpParameters, appData }) {
      const { p, r } = requireJoined();
      if (!PUBLISHING_ROLES.includes(p.role)) throw new ClientError('Audience members cannot publish', 'not_publisher');
      if (kind !== 'audio' && kind !== 'video') throw new ClientError('kind must be "audio" or "video"');
      if (p.producers.size >= MAX_PRODUCERS_PER_PEER) throw new ClientError('Too many producers');

      const producer = await getTransport(p, transportId, 'send').produce({
        kind,
        rtpParameters: rtpParameters as unknown as types.RtpParameters,
        appData: { ...(appData ?? {}), uid: p.uid },
      });
      await r.addLocalProducer(p, producer);
      log.info('producer created', { sid: p.sid, uid: p.uid, producerId: producer.id, kind });
      return { producerId: producer.id };
    },

    async pauseProducer({ producerId }) {
      const { p, r } = requireJoined();
      await getOwnProducer(p, producerId).pause();
      r.broadcast('producerPaused', { producerId, uid: p.uid }, p.uid);
      return {};
    },

    async resumeProducer({ producerId }) {
      const { p, r } = requireJoined();
      await getOwnProducer(p, producerId).resume();
      r.broadcast('producerResumed', { producerId, uid: p.uid }, p.uid);
      return {};
    },

    async closeProducer({ producerId }) {
      const { p, r } = requireJoined();
      r.closeLocalProducer(p, getOwnProducer(p, producerId));
      return {};
    },

    async consume({ transportId, producerId }) {
      const { p, r } = requireJoined();
      const transport = getTransport(p, transportId, 'recv');
      const found = r.findProducer(producerId);
      if (!found) throw new ClientError('Unknown producer', 'unknown_producer');
      if (!p.rtpCapabilities || !r.router.canConsume({ producerId, rtpCapabilities: p.rtpCapabilities })) {
        throw new ClientError('This device cannot receive that media');
      }

      // Start paused: the client resumes once its local consumer exists, so no early packets are lost.
      const consumer = await transport.consume({ producerId, rtpCapabilities: p.rtpCapabilities, paused: true });
      p.consumers.set(consumer.id, consumer);
      p.updateVideoUsage();
      consumer.observer.on('close', () => {
        p.consumers.delete(consumer.id);
        p.updateVideoUsage();
      });
      consumer.on('producerclose', () => {
        p.consumers.delete(consumer.id);
        p.updateVideoUsage();
        p.notify('consumerClosed', { consumerId: consumer.id, producerId });
      });

      return {
        consumerId: consumer.id,
        producerId,
        uid: found.uid,
        kind: consumer.kind as MediaKind,
        rtpParameters: consumer.rtpParameters as unknown as Record<string, unknown>,
      };
    },

    async resumeConsumer({ consumerId }) {
      const { p } = requireJoined();
      const consumer = p.consumers.get(consumerId);
      if (!consumer) throw new ClientError('Unknown consumer');
      await consumer.resume();
      return {};
    },

    async setRole({ role }) {
      const { p, r } = requireJoined();
      if (!isRole(role)) throw new ClientError('Invalid role');
      if (!roleAllowed(role, p.maxRole)) throw new ClientError(`Your token does not allow the ${role} role`, 'role_not_allowed');
      if (role === p.role) return { role };

      const wasPublisher = PUBLISHING_ROLES.includes(p.role);
      const willPublish = PUBLISHING_ROLES.includes(role);
      if (willPublish && !wasPublisher && r.speakerCount >= config.room.maxSpeakers) {
        throw new ClientError(`Channel already has the maximum of ${config.room.maxSpeakers} speakers`, 'speaker_limit');
      }
      if (!willPublish) {
        for (const producer of [...p.producers.values()]) r.closeLocalProducer(p, producer);
      }
      p.role = role;
      r.announceRole(p);
      return { role };
    },

    async renewTicket({ ticket }) {
      const { p, r } = requireConnected();
      const t = verifyTicket(ticket);
      if (t.appId !== r.appId || t.channel !== r.channel || t.uid !== p.uid) {
        throw new ClientError('Ticket belongs to another session', 'wrong_session');
      }
      p.sessionExp = t.sessionExp;
      p.maxRole = t.role;
      if (p.joined && !roleAllowed(p.role, p.maxRole)) {
        for (const producer of [...p.producers.values()]) r.closeLocalProducer(p, producer);
        p.role = p.maxRole;
        r.announceRole(p);
      }
      if (p.joined) scheduleTokenTimers(p);
      return { sessionExpiresAt: p.sessionExp };
    },

    async reportStats(stats) {
      const { p, r } = requireJoined();
      const now = Date.now();
      if (now - lastStatsAt < MIN_STATS_INTERVAL_MS) return {};
      lastStatsAt = now;
      emitEvent({
        type: 'quality',
        sid: p.sid,
        appId: r.appId,
        channel: r.channel,
        uid: p.uid,
        at: now,
        rttMs: stats.rttMs === null ? null : num(stats.rttMs, 60_000),
        path: typeof stats.path === 'string' ? stats.path.slice(0, 16) : 'unknown',
        inKbps: num(stats.inKbps),
        outKbps: num(stats.outKbps),
        inLossPercent: num(stats.inLossPercent, 100),
        outLossPercent: num(stats.outLossPercent, 100),
        jitterMs: num(stats.jitterMs, 60_000),
      });
      return {};
    },

    async ping() {
      return { t: Date.now() };
    },

    async muteParticipant({ uid, kind }) {
      const { p, r } = requireHost();
      if (!isName(uid)) throw new ClientError('Invalid uid');
      if (kind !== 'audio' && kind !== 'video') throw new ClientError('kind must be "audio" or "video"');
      await r.moderate({ action: 'mute', uid, kind, by: p.uid });
      return {};
    },

    async setParticipantRole({ uid, role }) {
      const { p, r } = requireHost();
      if (!isName(uid)) throw new ClientError('Invalid uid');
      if (!isRole(role)) throw new ClientError('Invalid role');
      await r.moderate({ action: 'role', uid, role, by: p.uid });
      return {};
    },

    async removeParticipant({ uid, banSeconds }) {
      const { p, r } = requireHost();
      if (!isName(uid)) throw new ClientError('Invalid uid');
      if (uid === p.uid) throw new ClientError('Use leave to leave the channel');
      const ban = Math.round(num(banSeconds, config.room.maxBanSeconds));
      await r.moderate({ action: 'remove', uid, banSeconds: ban, by: p.uid });
      return {};
    },

    async endChannel() {
      const { p, r } = requireHost();
      log.info('channel ended by host', { key: r.key, by: p.uid });
      endReason = 'channelEnded';
      r.end(p.uid, true);
      return {};
    },

    async leave() {
      endReason = 'left';
      leaveRoom();
      return {};
    },
  };

  ws.on('message', async (raw, isBinary) => {
    if (isBinary) return;
    let frame: RequestFrame;
    try {
      frame = JSON.parse(raw.toString()) as RequestFrame;
    } catch {
      return;
    }
    if (typeof frame?.id !== 'number' || typeof frame.method !== 'string') return;

    const respond = (response: ResponseFrame) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(response));
    };

    const handler = Object.hasOwn(handlers, frame.method)
      ? (handlers as Record<string, Handler<RequestMethod>>)[frame.method]
      : undefined;
    if (!handler) {
      respond({ id: frame.id, ok: false, error: `Unknown method "${frame.method}"`, code: 'unknown_method' });
      return;
    }

    try {
      const data = await handler((frame.data ?? {}) as never);
      respond({ id: frame.id, ok: true, data });
    } catch (error) {
      if (error instanceof ClientError) {
        respond({ id: frame.id, ok: false, error: error.message, code: error.code });
      } else {
        log.error('request failed', { sid: peer?.sid, method: frame.method, error: String(error) });
        respond({ id: frame.id, ok: false, error: 'Internal error', code: 'internal' });
      }
    }
  });

  ws.on('close', (code, reason) => {
    clearInterval(pinger);
    if (endReason === 'left' && code !== 1000 && code !== 1005) endReason = reason.toString() || 'disconnected';
    leaveRoom();
    if (peer) log.info('connection closed', { sid: peer.sid, uid: peer.uid, reason: endReason });
  });

  ws.on('error', (error) => log.warn('socket error', { sid: peer?.sid, error: String(error) }));
}
