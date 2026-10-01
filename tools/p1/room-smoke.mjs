#!/usr/bin/env node
/** Runs the voice room page smoke test (tools/loadtest/room-smoke.mjs) against a fresh test cluster. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { project, root, startCluster } from './lib.mjs';

const demo = { ...project('Demo', { testing: true }), demo: true };
const cluster = await startCluster({ nodes: 2, projects: [demo] });
const result = spawnSync(process.execPath, [path.join(root, 'tools/loadtest/room-smoke.mjs'), cluster.pageBase, cluster.allocatorUrl], {
  stdio: 'inherit',
});
await cluster.stop();
process.exitCode = result.status ?? 1;
