import type { MediaKind, Role } from '../../protocol/index';

export type { MediaKind, Role };

/**
 * disconnected → connecting → connected ⇄ reconnecting → disconnected.
 * reconnecting means the SDK lost its media node and is moving to another one on its own.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type DisconnectReason =
  | 'leave'
  | 'kicked'
  | 'channelEnded'
  | 'tokenExpired'
  | 'replaced'
  /** Could not reconnect within the reconnect window. */
  | 'network'
  | 'error';

/** 0 unknown, 1 excellent, 2 good, 3 poor, 4 bad, 5 very bad, 6 down. */
export type QualityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type NetworkQuality = {
  uplink: QualityLevel;
  downlink: QualityLevel;
  rttMs: number | null;
};

export type ConnectionStats = {
  /** Round trip to the media server, from the active ICE candidate pair. */
  rttMs: number | null;
  /** How media reaches the server: direct UDP, direct TCP, or through a TURN relay. */
  path: 'udp' | 'tcp' | 'relay' | 'unknown';
  inbound: { bitrateKbps: number; lossPercent: number; jitterMs: number; streams: number };
  /** lossPercent here is what the server reports it lost of our upload. */
  outbound: { bitrateKbps: number; lossPercent: number };
};

export type RemoteTrack = {
  uid: string;
  kind: MediaKind;
  track: MediaStreamTrack;
  /** The sender muted it (or a host did). */
  muted: boolean;
  readonly producerId: string;
  readonly consumerId: string;
};

export type RemoteUser = {
  uid: string;
  displayName: string;
  role: Role;
  audioTrack: RemoteTrack | null;
  videoTrack: RemoteTrack | null;
};

export type VolumeLevel = {
  uid: string;
  /** 0–100 */
  level: number;
};
