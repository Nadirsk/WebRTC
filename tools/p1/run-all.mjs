#!/usr/bin/env node
/**
 * The Phase 1 test suite. Builds everything, then runs each test with its own local cluster.
 *
 *   npm run test:p1            everything (about 6 minutes)
 *   npm run test:p1 -- --quick  skip the 300-listener scale test
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const quick = process.argv.includes('--quick');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps = [
  ['build', npm, ['run', 'build']],
  ['build samples', process.execPath, ['samples/build.mjs']],
  ['typecheck', npm, ['run', 'typecheck']],
  ['unit: tokens (Node, PHP, Python)', npm, ['run', 'test:unit']],
  ['tenancy and security', process.execPath, ['tools/p1/tenancy.mjs']],
  ['voice room page', process.execPath, ['tools/p1/room-smoke.mjs']],
  ['moderation across nodes', process.execPath, ['tools/p1/moderation.mjs']],
  ['failover and drain', process.execPath, ['tools/p1/failover.mjs']],
  ['tokens and metering', process.execPath, ['tools/p1/session-life.mjs']],
  ['samples end to end', process.execPath, ['tools/p1/samples.mjs']],
  ...(quick ? [] : [['cascade: 300 listeners over 3 nodes', process.execPath, ['tools/p1/cascade-scale.mjs']]]),
];

const results = [];
for (const [name, cmd, args] of steps) {
  console.log(`\n━━ ${name}`);
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd === npm });
  results.push({ name, ok: r.status === 0, seconds: Math.round((Date.now() - started) / 1000) });
}

console.log('\n━━ Summary');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.seconds}s)`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\nAll Phase 1 tests passed.' : `\n${failed} step(s) failed.`);
process.exitCode = failed === 0 ? 0 : 1;
