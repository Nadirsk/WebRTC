#!/usr/bin/env node
/**
 * Manage projects in config/projects.json until the developer console (Phase 2) replaces it.
 * The allocator reloads the file automatically when it changes.
 *
 *   node tools/project.mjs list
 *   node tools/project.mjs create "Acme Chat" [--testing] [--max-users 1000] [--max-channels 200]
 *   node tools/project.mjs suspend <appId>
 *   node tools/project.mjs activate <appId>
 *   node tools/project.mjs rotate <appId>            add a new primary certificate, keep the old one as secondary
 *   node tools/project.mjs drop-secondary <appId>    finish a rotation
 *   node tools/project.mjs token <appId> <channel> <uid> [role] [ttlSeconds]
 */
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.PROJECTS_FILE ?? path.resolve(here, '../config/projects.json');

const load = () => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { projects: [] };
  }
};
const save = (data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const hex = (bytes) => randomBytes(bytes).toString('hex');

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    testing: { type: 'boolean', default: false },
    demo: { type: 'boolean', default: false },
    'max-users': { type: 'string', default: '1000' },
    'max-channels': { type: 'string', default: '200' },
  },
});
const [command, ...rest] = positionals;
const data = load();
const find = (appId) => {
  const project = data.projects.find((p) => p.appId === appId);
  if (!project) {
    console.error(`No project with App ID ${appId}`);
    process.exit(1);
  }
  return project;
};

switch (command) {
  case 'list':
    for (const p of data.projects) {
      console.log(`${p.appId}  ${p.status.padEnd(9)} ${p.authMode.padEnd(9)} ${p.name}`);
    }
    break;

  case 'create': {
    const name = rest[0];
    if (!name) throw new Error('Usage: create "<name>"');
    const project = {
      appId: hex(16),
      name,
      status: 'active',
      authMode: values.testing ? 'appIdOnly' : 'token',
      certificates: values.testing ? [] : [hex(16)],
      demo: values.demo || undefined,
      limits: { maxConcurrentUsers: Number(values['max-users']), maxChannels: Number(values['max-channels']) },
      createdAt: new Date().toISOString(),
    };
    data.projects.push(project);
    save(data);
    console.log(JSON.stringify(project, null, 2));
    break;
  }

  case 'suspend':
  case 'activate':
    find(rest[0]).status = command === 'suspend' ? 'suspended' : 'active';
    save(data);
    console.log(`${rest[0]} is now ${command === 'suspend' ? 'suspended' : 'active'}`);
    break;

  case 'rotate': {
    const p = find(rest[0]);
    p.certificates = [hex(16), p.certificates[0]].filter(Boolean);
    save(data);
    console.log(`New primary certificate: ${p.certificates[0]}`);
    break;
  }

  case 'drop-secondary': {
    const p = find(rest[0]);
    p.certificates = p.certificates.slice(0, 1);
    save(data);
    console.log('Secondary certificate removed');
    break;
  }

  case 'token': {
    const [appId, channel, uid, role = 'speaker', ttl = '3600'] = rest;
    const p = find(appId);
    if (!p.certificates[0]) throw new Error('Testing-mode projects do not use tokens');
    const iat = Math.floor(Date.now() / 1000);
    const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ v: 1, appId, channel, uid, role, iat, exp: iat + Number(ttl) })}`;
    console.log(`${body}.${createHmac('sha256', p.certificates[0]).update(body).digest('base64url')}`);
    break;
  }

  default:
    console.log('Commands: list, create, suspend, activate, rotate, drop-secondary, token');
}
