/**
 * Signaling protocol between client SDKs and a media node (WebSocket, JSON text frames).
 *
 * Three frame shapes:
 *   request      client → server   { id, method, data }
 *   response     server → client   { id, ok: true, data } | { id, ok: false, error, code? }
 *   notification server → client   { notification: true, method, data }
 *
 * Bump PROTOCOL_VERSION on any breaking change; the server rejects clients on another version.
 * See docs/SIGNALING_PROTOCOL.md for the full flow.
 *
 * v2 (Phase 1): clients get an edge ticket from the allocator first and present it in `connect`.
 * Participants are identified by the customer's `uid`. Hosts can moderate.
 */

export const PROTOCOL_VERSION = 2;

export type Role = 'host' | 'speaker' | 'audience';
export type MediaKind = 'audio' | 'video';
export type TransportDirection = 'send' | 'recv';

/** Roles allowed to publish media. Audience members only receive. */
export const PUBLISHING_ROLES: readonly Role[] = ['host', 'speaker'];

// These mirror the mediasoup JSON shapes. They are kept opaque here so the protocol
// has no dependency on either mediasoup package.
export type RtpCapabilities = Record<string, unknown>;
export type RtpParameters = Record<string, unknown>;
export type DtlsParameters = Record<string, unknown>;
export type IceParameters = Record<string, unknown>;
export type IceCandidate = Record<string, unknown>;

export type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

export type PeerInfo = {
  uid: string;
  displayName: string;
  role: Role;
};

export type ProducerInfo = {
  producerId: string;
  uid: string;
  kind: MediaKind;
  paused: boolean;
};

export type TransportInfo = {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
};

/** Why the server ended a participant's session. */
export type RemovedReason =
  | 'kicked'
  | 'channelEnded'
  | 'tokenExpired'
  /** The same uid joined again from another device or tab. */
  | 'replaced';

/** Client-measured quality, uploaded every few seconds for the call inspector. */
export type StatsReport = {
  rttMs: number | null;
  path: string;
  inKbps: number;
  outKbps: number;
  inLossPercent: number;
  outLossPercent: number;
  jitterMs: number;
};

/** Request name → [request data, response data]. */
export type Requests = {
  /** First request on every connection. */
  connect: [
    { protocolVersion: number; ticket: string },
    { routerRtpCapabilities: RtpCapabilities; uid: string; channel: string; nodeId: string; maxRole: Role },
  ];
  join: [
    { displayName: string; role: Role; rtpCapabilities: RtpCapabilities },
    {
      uid: string;
      peers: PeerInfo[];
      producers: ProducerInfo[];
      iceServers: IceServer[];
      /** Unix seconds when the access token runs out, or null if it never does. */
      sessionExpiresAt: number | null;
    },
  ];
  createWebRtcTransport: [{ direction: TransportDirection }, TransportInfo];
  connectTransport: [{ transportId: string; dtlsParameters: DtlsParameters }, Record<string, never>];
  restartIce: [{ transportId: string }, { iceParameters: IceParameters }];
  produce: [
    { transportId: string; kind: MediaKind; rtpParameters: RtpParameters; appData?: Record<string, unknown> },
    { producerId: string },
  ];
  pauseProducer: [{ producerId: string }, Record<string, never>];
  resumeProducer: [{ producerId: string }, Record<string, never>];
  closeProducer: [{ producerId: string }, Record<string, never>];
  consume: [
    { transportId: string; producerId: string },
    { consumerId: string; producerId: string; uid: string; kind: MediaKind; rtpParameters: RtpParameters },
  ];
  resumeConsumer: [{ consumerId: string }, Record<string, never>];
  setRole: [{ role: Role }, { role: Role }];
  /** Present a fresh ticket (from the allocator's /v1/renew) before the token runs out. */
  renewTicket: [{ ticket: string }, { sessionExpiresAt: number | null }];
  reportStats: [StatsReport, Record<string, never>];
  /** Liveness check: the client treats a missing reply as a dead server. */
  ping: [Record<string, never>, { t: number }];

  // Host only.
  muteParticipant: [{ uid: string; kind: MediaKind }, Record<string, never>];
  setParticipantRole: [{ uid: string; role: Role }, Record<string, never>];
  removeParticipant: [{ uid: string; banSeconds?: number }, Record<string, never>];
  endChannel: [Record<string, never>, Record<string, never>];

  leave: [Record<string, never>, Record<string, never>];
};

/** Notification name → data. */
export type Notifications = {
  peerJoined: PeerInfo;
  peerLeft: { uid: string };
  peerRoleChanged: PeerInfo;
  newProducer: ProducerInfo;
  producerPaused: { producerId: string; uid: string };
  producerResumed: { producerId: string; uid: string };
  producerClosed: { producerId: string; uid: string };
  consumerClosed: { consumerId: string; producerId: string };
  /** Loudest peers first. volume is dBov: 0 is loudest, -127 is silence. */
  audioLevels: { levels: { uid: string; volume: number }[] };

  /** A host muted one of this client's tracks. The client may unmute again. */
  mutedByHost: { kind: MediaKind; by: string };
  /** A host changed this client's role. Becoming audience closes its published tracks. */
  roleChangedByHost: { role: Role; by: string };
  /** The session is over; the server closes the connection right after. */
  removed: { reason: RemovedReason; by?: string };
  /** Renew before `expiresAt` or the session ends with reason tokenExpired. */
  tokenWillExpire: { expiresAt: number };
  /** Move to another node (this one is draining for maintenance). Allocate again and rejoin. */
  reconnectRequired: { reason: 'nodeDraining' };
};

export type RequestMethod = keyof Requests;
export type NotificationMethod = keyof Notifications;

export type RequestFrame<M extends RequestMethod = RequestMethod> = {
  id: number;
  method: M;
  data: Requests[M][0];
};

export type ResponseFrame =
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: string; code?: string };

export type NotificationFrame<M extends NotificationMethod = NotificationMethod> = {
  notification: true;
  method: M;
  data: Notifications[M];
};

// ---------------------------------------------------------------- allocator (HTTPS, public)

export type AllocateRequestBody = {
  appId: string;
  channel: string;
  /** Required unless the project is in testing mode (App ID only). */
  token?: string;
  /** Testing-mode projects only; with a token, uid and role come from the token. */
  uid?: string;
  role?: Role;
  exclude?: string[];
};

export type AllocateResponseBody = {
  edges: { nodeId: string; region: string; url: string }[];
  ticket: string;
  uid: string;
  channel: string;
  maxRole: Role;
  sessionExpiresAt: number | null;
};

export type RenewResponseBody = { ticket: string; sessionExpiresAt: number | null };

export type ApiErrorBody = { error: { code: string; message: string } };
