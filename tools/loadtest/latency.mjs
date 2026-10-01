#!/usr/bin/env node
/**
 * Runs the browser latency test (latency.html) headlessly and prints the result.
 * Useful as a smoke test after deploys and for repeated measurements from a test machine.
 *
 *   node tools/loadtest/latency.mjs --url http://localhost:3000 --beeps 20
 */
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    beeps: { type: 'string', default: '20' },
    interval: { type: 'string', default: '0.8' },
    relay: { type: 'boolean', default: false },
    chrome: {
      type: 'string',
      default:
        process.env.CHROME_PATH ??
        (process.platform === 'win32'
          ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
          : process.platform === 'darwin'
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : '/usr/bin/google-chrome'),
    },
  },
});

const browser = await puppeteer.launch({
  executablePath: args.chrome,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(`[page] ${error.message}`));
  await page.goto(`${args.url.replace(/\/$/, '')}/latency.html`);
  await page.$eval('#count', (el, v) => (el.value = v), args.beeps);
  await page.$eval('#interval', (el, v) => (el.value = v), args.interval);
  if (args.relay) await page.click('#force-relay');
  await page.click('#start-btn');

  const timeoutMs = (Number(args.beeps) * Number(args.interval) + 20) * 1000;
  await page.waitForFunction(
    () => /done|failed/.test(document.querySelector('#status')?.textContent ?? ''),
    { timeout: timeoutMs },
  );

  const result = await page.evaluate(() => ({
    status: document.querySelector('#status')?.textContent,
    median: document.querySelector('#k-median')?.textContent,
    p95: document.querySelector('#k-p95')?.textContent,
    range: document.querySelector('#k-range')?.textContent,
    heard: document.querySelector('#k-heard')?.textContent,
    rtt: document.querySelector('#k-rtt')?.textContent,
    route: document.querySelector('#k-path')?.textContent,
    error: document.querySelector('#error')?.hidden ? null : document.querySelector('#error')?.textContent,
  }));
  console.log(JSON.stringify(result, null, 2));
  if (result.error || /failed/.test(result.status ?? '')) process.exitCode = 1;
} finally {
  await browser.close();
}
