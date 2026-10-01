export { RtcClient, LocalTrack, type ClientConfig, type JoinOptions } from './client';
export { RtcError } from './errors';
export { PROTOCOL_VERSION } from '../../protocol/index';
export type {
  ConnectionState,
  ConnectionStats,
  DisconnectReason,
  MediaKind,
  NetworkQuality,
  QualityLevel,
  RemoteTrack,
  RemoteUser,
  Role,
  VolumeLevel,
} from './types';

/** SDK version, reported to support. Follows semantic versioning. */
export const SDK_VERSION = '1.0.0-beta.1';
