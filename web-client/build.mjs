import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(here, 'dist');
const watch = process.argv.includes('--watch');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp(path.join(here, 'public'), outdir, { recursive: true });

const options = {
  entryPoints: {
    room: path.join(here, 'src/pages/room.ts'),
    latency: path.join(here, 'src/pages/latency.ts'),
    loadtest: path.join(here, 'src/pages/loadtest.ts'),
    harness: path.join(here, 'src/pages/harness.ts'),
  },
  outdir: path.join(outdir, 'js'),
  bundle: true,
  format: 'esm',
  target: ['chrome110', 'safari16', 'firefox115'],
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('watching web-client…');
} else {
  await esbuild.build(options);
}
