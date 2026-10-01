#!/usr/bin/env node
/**
 * Functional smoke test of the voice room page with two headless browsers:
 * join, receive audio, mute, go on stage, camera, leave.
 *
 *   node tools/loadtest/room-smoke.mjs http://localhost:3001 [allocator URL]
 */
import puppeteer from 'puppeteer-core';

const base = (process.argv[2] ?? 'http://localhost:3001').replace(/\/$/, '');
const allocator = process.argv[3] ? `&allocator=${encodeURIComponent(process.argv[3])}` : '';
const chrome =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
  ],
});

const room = `smoke-${Date.now().toString(36)}`;

async function open(name, role, useTone) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error: ${e.message}`));
  await page.bringToFront();
  await page.goto(`${base}/room.html?room=${room}&name=${name}&role=${role}${allocator}`);
  await page.waitForFunction(() => document.querySelector('#app-id').value.length === 32, { timeout: 5000 });
  if (useTone) await page.click('#use-tone');
  await page.click('#join-btn');
  await page.waitForSelector('#room-panel:not([hidden])', { timeout: 10_000 });
  return page;
}

const tiles = (page) =>
  page.$$eval('.tile', (ts) =>
    ts.map((t) => ({ name: t.querySelector('.name').textContent, meta: t.querySelector('.meta').textContent })),
  );
const tileOf = async (page, name) => (await tiles(page)).find((t) => t.name.startsWith(name));

try {
  const alice = await open('Alice', 'speaker', true);
  const bob = await open('Bob', 'audience', false);
  // Bitrate needs two stats samples (taken every 2 s), so wait a little longer than that.
  await sleep(5000);

  const aliceOnBob = await tileOf(bob, 'Alice');
  check('Bob sees Alice with her mic on', aliceOnBob?.meta.includes('mic on'), aliceOnBob?.meta);
  const receiving = await bob.$eval('#st-in', (e) => e.textContent);
  check('Bob is receiving audio', /[1-9]\d* kbps/.test(receiving), receiving);
  check('Bob cannot use the mic as a listener', await bob.$eval('#mic-btn', (e) => e.disabled));

  // Headless Chrome pauses rendering in background tabs, so bring a tab forward before clicking in it.
  await alice.bringToFront();
  await alice.click('#mic-btn');
  await sleep(1000);
  check('Bob sees Alice muted', (await tileOf(bob, 'Alice'))?.meta.includes('muted'));

  await bob.bringToFront();
  await bob.click('#stage-btn');
  await sleep(1500);
  check('Alice sees Bob as a speaker', (await tileOf(alice, 'Bob'))?.meta.includes('speaker'));
  check('Bob can now use the mic', await bob.$eval('#mic-btn', (e) => !e.disabled));

  await bob.click('#cam-btn');
  await sleep(3000);
  await alice.bringToFront();
  const hasVideo = await alice.$$eval('.tile video', (vs) => vs.some((v) => !v.hidden && v.videoWidth > 0));
  check("Alice receives Bob's camera", hasVideo);

  await bob.bringToFront();
  await bob.click('#leave-btn');
  await sleep(1500);
  await alice.bringToFront();
  check("Bob is gone from Alice's room", !(await tileOf(alice, 'Bob')));
} catch (error) {
  failures++;
  console.log(`FAIL  ${error.message}`);
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
