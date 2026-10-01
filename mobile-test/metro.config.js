// The app reuses the browser client library (../web-client/src) and the protocol (../protocol)
// so web and mobile run the exact same signaling and mediasoup code.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const appEntry = path.join(projectRoot, 'index.ts');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(repoRoot, 'web-client', 'src'), path.join(repoRoot, 'protocol')];
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];

// Packages the shared code imports must come from this app, never from the repo root's
// node_modules, so there is exactly one copy at runtime.
const PINNED = ['mediasoup-client'];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (PINNED.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))) {
    return context.resolveRequest({ ...context, originModulePath: appEntry }, moduleName, platform);
  }
  // The shared TypeScript uses ESM-style "./file.js" imports that point at "./file.ts".
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      // Fall through to the name as written.
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
