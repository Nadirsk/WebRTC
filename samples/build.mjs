/** Bundles the web samples into token-server/public so the sample backend can serve them. */
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'token-server/public');
const samples = { 'voice-room': 'web-voice-room', call: 'web-1to1-call' };

for (const [route, dir] of Object.entries(samples)) {
  await mkdir(path.join(out, route), { recursive: true });
  await cp(path.join(here, dir, 'index.html'), path.join(out, route, 'index.html'));
  await esbuild.build({
    entryPoints: [path.join(here, dir, 'main.ts')],
    outfile: path.join(out, route, 'main.js'),
    bundle: true,
    format: 'esm',
    target: ['chrome110', 'safari16', 'firefox115'],
    sourcemap: true,
    logLevel: 'warning',
  });
}
console.log('samples built → samples/token-server/public');
