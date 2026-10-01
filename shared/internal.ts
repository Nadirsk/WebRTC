import type { Role } from './auth';

/** Messages between media nodes, the orchestrator and the allocator. Never exposed to customers. */

export type NodeHeartbeat = {
  nodeId: string;
  region: string;
  /** WebSocket URL clients connect to. */
  publicUrl: string;
  /** WebSocket URL other media nodes use for cascading. */
  clusterUrl: string;
  /** Peers this node accepts before rooms spill to another node. */
  capacity: number;
  draining: boolean;
  load: { peers: number; rooms: number; maxWorkerCpu: number };
  rooms: { key: string; peers: number }[];
  startedAt: number;
  /** When this snapshot was taken (ms). Joins before it are included in load.peers. */
  sentAt: number;
};

export type HeartbeatResponse = {
  /** For each room on this node: the other live nodes that also host it (cascade links to keep). */
  roomPeers: Record<string, { nodeId: string; clusterUrl: string }[]>;
  /** The orchestrator asked this node to drain (move everyone elsewhere, then take no new rooms). */
  drain: boolean;
};

export type SessionStart = {
  type: 'session.start';
  sid: string;
  nodeId: string;
  appId: string;
  channel: string;
  uid: string;
  role: Role;
  at: number;
};

export type SessionEnd = {
  type: 'session.end';
  sid: string;
  at: number;
  /** Time with at least one video track sent or received, for video billing. */
  videoMs: number;
  reason: string;
};

export type QualityReport = {
  type: 'quality';
  sid: string;
  appId: string;
  channel: string;
  uid: string;
  at: number;
  rttMs: number | null;
  path: string;
  inKbps: number;
  outKbps: number;
  inLossPercent: number;
  outLossPercent: number;
  jitterMs: number;
};

/** A host removed someone with a ban; the allocator refuses them until `until` (ms). */
export type BanEvent = {
  type: 'ban';
  appId: string;
  channel: string;
  uid: string;
  until: number;
};

export type NodeEvent = SessionStart | SessionEnd | QualityReport | BanEvent;

export type AllocateRequest = {
  appId: string;
  channel: string;
  uid: string;
  /** Nodes the client just failed to reach, so they are not offered again. */
  exclude: string[];
  limits: { maxConcurrentUsers: number; maxChannels: number };
};

export type EdgeCandidate = { nodeId: string; region: string; url: string };

export type AllocateResponse = { edges: EdgeCandidate[] };

export type UsageSummary = {
  appId: string;
  from: number;
  to: number;
  sessions: number;
  /** Participant-minutes, all media. */
  totalMinutes: number;
  /** Participant-minutes with video active (billed at the video rate). */
  videoMinutes: number;
  /** Participant-minutes of audio only. */
  audioMinutes: number;
  byChannel: { channel: string; sessions: number; minutes: number }[];
};
