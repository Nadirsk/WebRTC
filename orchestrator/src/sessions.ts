import { createReadStream } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { HttpError } from '../../shared/http';
import type { AllocateRequest, NodeEvent, SessionStart, UsageSummary } from '../../shared/internal';
import { createLogger } from '../../shared/logger';
import { config } from './config';

const log = createLogger('sessions');

/**
 * The metering source of truth. Media nodes report session start/end; if a node dies, its open
 * sessions are closed at the node's last heartbeat so no minute is lost or invented.
 */

export type UsageRecord = {
  sid: string;
  appId: string;
  channel: string;
  uid: string;
  role: string;
  nodeId: string;
  joinedAt: number;
  leftAt: number;
  durationMs: number;
  videoMs: number;
  reason: string;
};

const open = new Map<string, SessionStart>();
/** "appId:channel/uid" → banned until (ms). */
const bans = new Map<string, number>();
/** Allocations not yet turned into a session: appId → "channel/uid" → expiry. Counted for quotas. */
const pendingJoins = new Map<string, Map<string, number>>();

const usageFile = () => path.join(config.dataDir, 'usage.jsonl');
const qualityFile = () => path.join(config.dataDir, 'quality.jsonl');

let writeChain: Promise<void> = mkdir(config.dataDir, { recursive: true }).then(() => {});
function append(file: string, lines: unknown[]) {
  if (lines.length === 0) return;
  const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  writeChain = writeChain.then(() => appendFile(file, text)).catch((error) => log.error('write failed', { file, error: String(error) }));
}

function close(sid: string, at: number, videoMs: number, reason: string): UsageRecord | null {
  const start = open.get(sid);
  if (!start) return null;
  open.delete(sid);
  const leftAt = Math.max(at, start.at);
  return {
    sid,
    appId: start.appId,
    channel: start.channel,
    uid: start.uid,
    role: start.role,
    nodeId: start.nodeId,
    joinedAt: start.at,
    leftAt,
    durationMs: leftAt - start.at,
    videoMs: Math.min(videoMs, leftAt - start.at),
    reason,
  };
}

export function handleEvents(events: NodeEvent[]): void {
  const usage: UsageRecord[] = [];
  const quality: NodeEvent[] = [];
  for (const event of events) {
    if (event.type === 'session.start') {
      open.set(event.sid, event);
      pendingJoins.get(event.appId)?.delete(`${event.channel}/${event.uid}`);
    } else if (event.type === 'session.end') {
      const record = close(event.sid, event.at, event.videoMs, event.reason);
      if (record) usage.push(record);
    } else if (event.type === 'quality') {
      quality.push(event);
    } else if (event.type === 'ban') {
      const key = `${event.appId}:${event.channel}/${event.uid}`;
      bans.set(key, Math.max(event.until, bans.get(key) ?? 0));
    }
  }
  append(usageFile(), usage);
  append(qualityFile(), quality);
}

/** Close every session a dead (or restarted) node was carrying. */
export function closeNodeSessions(nodeId: string, lastSeen: number, startedAt: number): void {
  const usage: UsageRecord[] = [];
  for (const [sid, start] of open) {
    if (start.nodeId === nodeId && start.at >= startedAt - 1000) {
      const record = close(sid, lastSeen, 0, 'nodeFailed');
      if (record) usage.push(record);
    }
  }
  if (usage.length > 0) log.warn('closed sessions of a failed node', { nodeId, sessions: usage.length });
  append(usageFile(), usage);
}

function appActivity(appId: string, now: number) {
  const users = new Set<string>();
  const channels = new Set<string>();
  for (const s of open.values()) {
    if (s.appId !== appId) continue;
    users.add(`${s.channel}/${s.uid}`);
    channels.add(s.channel);
  }
  const pending = pendingJoins.get(appId);
  for (const [key, expires] of pending ?? []) {
    if (expires < now) {
      pending!.delete(key);
      continue;
    }
    users.add(key);
    channels.add(key.slice(0, key.indexOf('/')));
  }
  return { users, channels };
}

export function appNow(appId: string) {
  const { users, channels } = appActivity(appId, Date.now());
  return { concurrentUsers: users.size, channels: channels.size };
}

/** Enforce the project's concurrency limits, then hold a slot until the session starts. */
export function checkQuota(req: AllocateRequest): void {
  const now = Date.now();
  const self = `${req.channel}/${req.uid}`;
  const banKey = `${req.appId}:${self}`;
  const bannedUntil = bans.get(banKey);
  if (bannedUntil !== undefined) {
    if (bannedUntil > now) throw new HttpError(403, 'banned', 'This user was removed from the channel by a host');
    bans.delete(banKey);
  }
  const { users, channels } = appActivity(req.appId, now);
  if (!users.has(self) && users.size >= req.limits.maxConcurrentUsers) {
    throw new HttpError(429, 'quota_exceeded', `This project allows ${req.limits.maxConcurrentUsers} concurrent users`);
  }
  if (!channels.has(req.channel) && channels.size >= req.limits.maxChannels) {
    throw new HttpError(429, 'quota_exceeded', `This project allows ${req.limits.maxChannels} active channels`);
  }
  let pending = pendingJoins.get(req.appId);
  if (!pending) pendingJoins.set(req.appId, (pending = new Map()));
  pending.set(self, now + config.pendingJoinMs);
}

const minutes = (ms: number) => Math.round((ms / 60_000) * 100) / 100;

/** Participant-minutes for one app between `from` and `to` (ms), including sessions still open. */
export async function usageSummary(appId: string, from: number, to: number): Promise<UsageSummary> {
  let totalMs = 0;
  let videoMs = 0;
  let sessions = 0;
  const byChannel = new Map<string, { sessions: number; ms: number }>();

  const add = (channel: string, joinedAt: number, leftAt: number, video: number) => {
    const start = Math.max(joinedAt, from);
    const end = Math.min(leftAt, to);
    if (end <= start) return;
    const span = end - start;
    const share = leftAt > joinedAt ? span / (leftAt - joinedAt) : 1;
    sessions++;
    totalMs += span;
    videoMs += video * share;
    const c = byChannel.get(channel) ?? { sessions: 0, ms: 0 };
    c.sessions++;
    c.ms += span;
    byChannel.set(channel, c);
  };

  await writeChain;
  try {
    const lines = readline.createInterface({ input: createReadStream(usageFile()), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line) continue;
      const r = JSON.parse(line) as UsageRecord;
      if (r.appId === appId) add(r.channel, r.joinedAt, r.leftAt, r.videoMs);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const now = Date.now();
  for (const s of open.values()) if (s.appId === appId) add(s.channel, s.at, now, 0);

  return {
    appId,
    from,
    to,
    sessions,
    totalMinutes: minutes(totalMs),
    videoMinutes: minutes(videoMs),
    audioMinutes: minutes(totalMs - videoMs),
    byChannel: [...byChannel.entries()]
      .map(([channel, c]) => ({ channel, sessions: c.sessions, minutes: minutes(c.ms) }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

/** The node where this user already has a session in this channel (a second device replaces it there). */
export function nodeOfUser(appId: string, channel: string, uid: string): string | undefined {
  for (const s of open.values()) if (s.appId === appId && s.channel === channel && s.uid === uid) return s.nodeId;
  return undefined;
}

export function openSessionCount(): number {
  return open.size;
}
