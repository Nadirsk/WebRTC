import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { types } from 'mediasoup';
import { clusterSecret, int, optional, str } from '../../shared/env';

const here = path.dirname(fileURLToPath(import.meta.url));

const mediaCodecs: types.RouterRtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    // In-band FEC lets the receiver rebuild a lost packet from the next one.
    parameters: { useinbandfec: 1, usedtx: 1 },
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: { 'x-google-start-bitrate': 800 },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 800,
    },
  },
];

const httpPort = int('HTTP_PORT', 3000);

export const config = {
  nodeId: str('NODE_ID', `${os.hostname()}-${httpPort}`),
  region: str('REGION', 'local'),
  secret: clusterSecret(),

  http: {
    listenIp: str('HTTP_LISTEN_IP', '0.0.0.0'),
    port: httpPort,
    /** Both set → serve HTTPS/WSS directly. Otherwise plain HTTP (put a TLS proxy in front). */
    tlsCertFile: optional('TLS_CERT_FILE'),
    tlsKeyFile: optional('TLS_KEY_FILE'),
    staticDir: str('STATIC_DIR', path.resolve(here, '../../web-client/dist')),
  },

  cluster: {
    orchestratorUrl: str('ORCHESTRATOR_URL', 'http://127.0.0.1:4200'),
    /** What clients are told to connect to. */
    publicUrl: str('PUBLIC_WS_URL', `ws://localhost:${httpPort}/ws`),
    /** What other media nodes use for cascading (private network in production). */
    clusterUrl: str('CLUSTER_WS_URL', `ws://127.0.0.1:${httpPort}/cluster`),
    heartbeatMs: int('HEARTBEAT_MS', 2000),
    /** Peers this node takes before new ones spill to another node. */
    capacity: int('NODE_MAX_PEERS', 2000),
    /** How long a draining node waits for clients to move before exiting. */
    drainTimeoutMs: int('DRAIN_TIMEOUT_MS', 10_000),
  },

  mediasoup: {
    numWorkers: int('MEDIASOUP_NUM_WORKERS', os.availableParallelism()),
    workerSettings: {
      logLevel: str('MEDIASOUP_LOG_LEVEL', 'warn') as types.WorkerLogLevel,
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'] as types.WorkerLogTag[],
    },
    /**
     * One WebRtcServer per worker: every transport on a worker shares one UDP and one TCP port,
     * so the firewall only needs BASE_PORT .. BASE_PORT + workers - 1 open.
     */
    webRtcServer: {
      listenIp: str('WEBRTC_LISTEN_IP', '0.0.0.0'),
      /** Public IP or hostname clients should reach. Required when the server is behind NAT. */
      announcedAddress: optional('ANNOUNCED_ADDRESS'),
      basePort: int('WEBRTC_BASE_PORT', 44444),
    },
    /** Server-to-server RTP for cascading. Use the private network address in production. */
    pipe: {
      listenIp: str('PIPE_LISTEN_IP', '127.0.0.1'),
      announcedAddress: optional('PIPE_ANNOUNCED_ADDRESS'),
    },
    mediaCodecs,
    webRtcTransport: {
      initialAvailableOutgoingBitrate: int('TRANSPORT_INITIAL_OUTGOING_BITRATE', 600_000),
      maxIncomingBitrate: int('TRANSPORT_MAX_INCOMING_BITRATE', 1_500_000),
    },
  },

  turn: {
    /** Comma-separated, e.g. "turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349". */
    urls: (optional('TURN_URLS') ?? '').split(',').map((u) => u.trim()).filter(Boolean),
    /** coturn `static-auth-secret`. Used to mint short-lived credentials per peer. */
    secret: optional('TURN_SECRET'),
    credentialTtlSeconds: int('TURN_CREDENTIAL_TTL', 6 * 60 * 60),
  },

  room: {
    maxSpeakers: int('ROOM_MAX_SPEAKERS', 16),
    maxPeers: int('ROOM_MAX_PEERS', 5000),
    audioLevelIntervalMs: int('AUDIO_LEVEL_INTERVAL_MS', 500),
    /** Warn clients this long before their token runs out. */
    tokenWarningSeconds: int('TOKEN_WARNING_SECONDS', 30),
    maxBanSeconds: int('MAX_BAN_SECONDS', 24 * 60 * 60),
  },
};

export type Config = typeof config;
