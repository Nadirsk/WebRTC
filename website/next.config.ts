import path from 'node:path';
import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

// The live demo imports the shared client library from ../web-client and ../protocol,
// so the build root is the repository, not this folder.
const repoRoot = path.resolve(process.cwd(), '..');

const withMDX = createMDX({
  options: {
    remarkPlugins: [['remark-gfm']],
    rehypePlugins: [['@shikijs/rehype', { theme: 'github-light' }]],
  },
});

const nextConfig: NextConfig = {
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default withMDX(nextConfig);
