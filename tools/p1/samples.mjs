#!/usr/bin/env node
/**
 * The customer path end to end: the sample backend issues real access tokens with the Node server
 * SDK, and two browsers use the voice room and video call samples.
 *
 *   node samples/build.mjs && node tools/p1/samples.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { check, launchBrowser, project, root, sleep, startCluster, summary } from './lib.mjs';

const app = project('Samples test');
const cluster = await startCluster({ nodes: 2, projects: [app] });
const backend = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'samples/token-server/server.ts')], {
  cwd: root,
  env: { ...process.env, PORT: '5055', APP_ID: app.appId, APP_CERTIFICATE: app.certificates[0], ALLOCATOR_URL: cluster.allocatorUrl },
  stdio: 'ignore',
});
const base = 'http://localhost:5055';
for (let i = 0; i < 100; i++) {
  if (await fetch(base).then((r) => r.ok, () => false)) break;
  await sleep(150);
}
const browser = await launchBrowser();

try {
  const tok = await fetch(`${base}/api/token`, { method: 'POST', body: JSON.stringify({ channel: 'x', uid: 'y', role: 'host' }) }).then((r) => r.json());
  check('sample backend issues a token', typeof tok.token === 'string' && tok.token.split('.').length === 3);

  // ---------------------------------------------------------------- voice room
  const host = await browser.newPage();
  const guest = await browser.newPage();
  for (const p of [host, guest]) {
    p.on('pageerror', (e) => console.log(`  [page error] ${e.message}`));
    p.on('dialog', (d) => { console.log(`  [dialog] ${d.message()}`); void d.dismiss(); });
  }
  const channel = `lounge-${Date.now().toString(36)}`;

  await host.bringToFront();
  await host.goto(`${base}/voice-room/`);
  await host.$eval('#channel', (el, v) => (el.value = v), channel);
  await host.$eval('#name', (el) => (el.value = 'Hana'));
  await host.select('#role', 'host');
  await host.click('#join button');
  await host.waitForSelector('#room:not([hidden])', { timeout: 10_000 });

  await guest.bringToFront();
  await guest.goto(`${base}/voice-room/`);
  await guest.$eval('#channel', (el, v) => (el.value = v), channel);
  await guest.$eval('#name', (el) => (el.value = 'Omar'));
  await guest.click('#join button');
  await guest.waitForSelector('#room:not([hidden])', { timeout: 10_000 });
  check('host and guest joined the voice room with real tokens', true);

  await host.bringToFront();
  await host.waitForFunction(() => document.querySelector('#people li')?.textContent.includes('Omar'), { timeout: 5000 });
  check('host sees the guest in the audience', (await host.$eval('#people', (el) => el.textContent)).includes('audience'));
  await host.evaluate(() => [...document.querySelectorAll('#people button')].find((b) => b.textContent === 'Invite to speak').click());
  await guest.bringToFront();
  const promoted = await guest.waitForFunction(() => document.querySelector('#me').textContent.includes('speaker'), { timeout: 5000 }).then(() => true, () => false);
  check('guest is invited on stage by the host', promoted);
  await sleep(2500);
  await host.bringToFront();
  const hostHears = await host.evaluate(() => [...document.querySelectorAll('audio')].some((a) => a.srcObject && a.srcObject.getAudioTracks()[0]?.readyState === 'live'));
  check("host receives the guest's microphone", hostHears);
  await host.click('#end');
  await guest.bringToFront();
  const ended = await guest.waitForFunction(() => document.querySelector('#state').textContent.includes('channelEnded'), { timeout: 5000 }).then(() => true, () => false);
  check('host ends the room for everyone', ended);

  // ---------------------------------------------------------------- video call
  const a = await browser.newPage();
  const b = await browser.newPage();
  const call = `call-${Date.now().toString(36)}`;
  await a.bringToFront();
  await a.goto(`${base}/call/?call=${call}`);
  await a.click('#start button');
  await a.waitForSelector('#call:not([hidden])', { timeout: 10_000 });
  await b.bringToFront();
  await b.goto(`${base}/call/?call=${call}`);
  await b.click('#start button');
  await b.waitForSelector('#call:not([hidden])', { timeout: 10_000 });
  await sleep(3000);
  for (const [label, page] of [['caller', a], ['callee', b]]) {
    await page.bringToFront();
    const width = await page.waitForFunction(() => document.querySelector('#remote').videoWidth > 0, { timeout: 8000 }).then(() => page.$eval('#remote', (v) => v.videoWidth), () => 0);
    check(`${label} sees the other person's video`, width > 0, `${width}px wide`);
  }
  await b.bringToFront();
  await b.click('#hangup');
  await a.bringToFront();
  const left = await a.waitForFunction(() => document.querySelector('#status').textContent.includes('left'), { timeout: 5000 }).then(() => true, () => false);
  check('caller is told when the other person hangs up', left);
} catch (error) {
  check(`unexpected error: ${error.stack}`, false);
} finally {
  await browser.close();
  backend.kill();
  await cluster.stop();
  summary('samples');
}
