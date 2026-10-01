/** Helpers shared by the test pages. */

/** The access point. ?allocator=… overrides; by default the same host on port 4100. */
export function defaultAllocatorUrl(): string {
  const value = param('allocator');
  if (value) return value;
  return `${location.protocol}//${location.hostname}:4100`;
}

/** App ID from ?appId=…, otherwise the public testing-mode demo project. */
export async function resolveAppId(allocatorUrl: string): Promise<string> {
  const value = param('appId');
  if (value) return value;
  try {
    const res = await fetch(`${allocatorUrl.replace(/\/$/, '')}/v1/demo`);
    if (res.ok) return ((await res.json()) as { appId: string }).appId;
  } catch {
    // Fall through: the caller shows the empty field.
  }
  return '';
}

export function param(name: string, fallback = ''): string {
  return new URLSearchParams(location.search).get(name) ?? fallback;
}

export function intParam(name: string, fallback: number): number {
  const value = Number.parseInt(param(name), 10);
  return Number.isNaN(value) ? fallback : value;
}

export function randomId(prefix = 'room'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A uid derived from a display name: "Guest 482" → "guest-482-k3f". */
export function uidFromName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'user';
  return `${base}-${Math.random().toString(36).slice(2, 5)}`;
}

export function $(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Missing element ${selector}`);
  return el;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) node.append(child);
  return node;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

/** Chrome only routes a remote WebRTC track into Web Audio if it is also attached to a media element. */
export function attachSilently(track: MediaStreamTrack): HTMLAudioElement {
  const audio = new Audio();
  audio.muted = true;
  audio.srcObject = new MediaStream([track]);
  void audio.play().catch(() => {});
  return audio;
}
