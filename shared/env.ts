/** Typed environment variable readers shared by every service. */

export function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export function optional(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

export function int(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer, got "${value}"`);
  return parsed;
}

export function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

const DEV_CLUSTER_SECRET = 'dev-cluster-secret-change-me';

/**
 * Shared secret between the allocator, orchestrator and media nodes. It signs edge tickets and
 * authenticates internal calls. A development default keeps local runs simple; production must set it.
 */
export function clusterSecret(): string {
  const value = optional('CLUSTER_SECRET');
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CLUSTER_SECRET must be set in production');
  }
  return DEV_CLUSTER_SECRET;
}
