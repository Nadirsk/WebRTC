import { readFileSync, watchFile } from 'node:fs';
import { APP_ID_PATTERN } from '../../shared/auth';
import { createLogger } from '../../shared/logger';

const log = createLogger('projects');

/**
 * Customer projects. Two sources, picked by config:
 *   - file (default): a JSON file (config/projects.json), reloaded when it changes. Used by the
 *     local dev cluster, the Phase 1 test suite and any run with no PLATFORM_URL set.
 *   - platform: polls the Laravel console's GET /internal/projects, with the last good list kept
 *     as a fallback if the platform is briefly unreachable.
 */

export type Project = {
  appId: string;
  name: string;
  status: 'active' | 'suspended';
  /** token: every join needs an access token. appIdOnly: testing mode, anyone with the App ID can join. */
  authMode: 'token' | 'appIdOnly';
  /** [primary, secondary?]. Tokens signed with either are accepted, for zero-downtime rotation. */
  certificates: string[];
  /** The public demo project used by the website and test pages. */
  demo?: boolean;
  limits: { maxConcurrentUsers: number; maxChannels: number };
};

let byAppId = new Map<string, Project>();

function validate(raw: unknown): Project | null {
  const p = raw as Partial<Project>;
  if (!p || typeof p.appId !== 'string' || !APP_ID_PATTERN.test(p.appId)) return null;
  if (p.status !== 'active' && p.status !== 'suspended') return null;
  if (p.authMode !== 'token' && p.authMode !== 'appIdOnly') return null;
  if (!Array.isArray(p.certificates) || !p.certificates.every((c) => typeof c === 'string' && c.length >= 16)) return null;
  if (p.authMode === 'token' && p.certificates.length === 0) return null;
  return {
    appId: p.appId,
    name: String(p.name ?? p.appId),
    status: p.status,
    authMode: p.authMode,
    certificates: p.certificates.slice(0, 2),
    demo: p.demo === true,
    limits: {
      maxConcurrentUsers: Number(p.limits?.maxConcurrentUsers ?? 100),
      maxChannels: Number(p.limits?.maxChannels ?? 20),
    },
  };
}

function applyList(list: unknown[], source: string) {
  const next = new Map<string, Project>();
  for (const raw of list) {
    const project = validate(raw);
    if (project) next.set(project.appId, project);
    else log.warn('skipping invalid project entry', { appId: (raw as { appId?: string })?.appId, source });
  }
  byAppId = next;
  log.info('projects loaded', { count: next.size, source });
}

function loadFile(file: string) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { projects?: unknown[] };
    applyList(data.projects ?? [], 'file');
  } catch (error) {
    log.error('could not read projects file, keeping the previous list', { file, error: String(error) });
  }
}

async function loadPlatform(platformUrl: string, secret: string) {
  try {
    const res = await fetch(`${platformUrl.replace(/\/$/, '')}/internal/projects`, {
      headers: { 'x-cluster-secret': secret },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = (await res.json()) as { projects?: unknown[] };
    applyList(data.projects ?? [], 'platform');
  } catch (error) {
    log.warn('could not reach the platform, keeping the previous list', { platformUrl, error: String(error) });
  }
}

/** File-based store: used when no platform URL is configured. */
export function startProjectStore(file: string): void {
  loadFile(file);
  watchFile(file, { interval: 1000 }, () => loadFile(file));
}

/** Platform-backed store: polls Laravel's internal project feed. */
export function startPlatformProjectStore(platformUrl: string, secret: string, intervalMs = 3000): void {
  void loadPlatform(platformUrl, secret);
  setInterval(() => void loadPlatform(platformUrl, secret), intervalMs).unref();
}

export function getProject(appId: string): Project | undefined {
  return byAppId.get(appId);
}

export function demoProject(): Project | undefined {
  for (const p of byAppId.values()) if (p.demo && p.authMode === 'appIdOnly' && p.status === 'active') return p;
  return undefined;
}
