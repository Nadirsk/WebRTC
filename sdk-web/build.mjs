/**
 * Builds a publishable SDK package: one ESM bundle (mediasoup-client stays an external
 * dependency) plus TypeScript declarations.
 *
 *   node build.mjs                                   (sdk-web)
 *   node ../sdk-web/build.mjs --entry src/index.ts --out dist   (from another SDK package)
 */
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';

const { values } = parseArgs({
  options: { entry: { type: 'string', default: 'src/index.ts' }, out: { type: 'string', default: 'dist' } },
});
const cwd = process.cwd();
const outdir = path.resolve(cwd, values.out);
await rm(outdir, { recursive: true, force: true });

await esbuild.build({
  entryPoints: [path.resolve(cwd, values.entry)],
  outfile: path.join(outdir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: ['es2020'],
  external: ['mediasoup-client', 'react-native-webrtc'],
  sourcemap: true,
  logLevel: 'info',
});

// Declarations: tsc emits the whole source tree; index.d.ts re-exports from it.
const tsc = path.resolve(cwd, '../node_modules/typescript/bin/tsc');
execFileSync(
  process.execPath,
  [
    tsc,
    path.resolve(cwd, values.entry),
    '--declaration', '--emitDeclarationOnly',
    '--outDir', path.join(outdir, 'types'),
    '--rootDir', path.resolve(cwd, '..'),
    '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--lib', 'ES2022,DOM,DOM.Iterable', '--strict', '--skipLibCheck',
  ],
  { stdio: 'inherit' },
);
const pkg = path.basename(cwd);
const { writeFile } = await import('node:fs/promises');
await writeFile(path.join(outdir, 'index.d.ts'), `export * from './types/${pkg}/src/index';\n`);
console.log(`built ${pkg} → ${path.relative(cwd, outdir)}`);
