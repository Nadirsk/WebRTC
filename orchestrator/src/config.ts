import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clusterSecret, int, str } from '../../shared/env';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  listenIp: str('ORCHESTRATOR_LISTEN_IP', '127.0.0.1'),
  port: int('ORCHESTRATOR_PORT', 4200),
  secret: clusterSecret(),
  /** A node that has not sent a heartbeat for this long is treated as dead. */
  nodeTimeoutMs: int('NODE_TIMEOUT_MS', 5000),
  /** How long a placement counts toward a node's load before its heartbeat reflects it. */
  pendingJoinMs: int('PENDING_JOIN_MS', 15_000),
  /** Where session and quality records are written (JSON lines). ClickHouse replaces this later. */
  dataDir: str('DATA_DIR', path.resolve(here, '../../data')),
};
