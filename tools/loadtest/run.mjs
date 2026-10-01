#!/usr/bin/env node
/**
 * Capacity test for one media node.
 *
 * Opens one speaker tab plus enough listener tabs in headless Chrome to reach --listeners,
 * then samples the node's /api/stats (CPU per mediasoup worker) and each tab's receive quality.
 * Writes a JSON summary to tools/loadtest/results/.
 *
 *   npm run loadtest -- --url http://localhost:3000 --listeners 200 --per-tab 50 --duration 60
 *
 * One machine can only host so many WebRTC peers; for runs above a few hundred listeners,
 * run this from several machines at once against the same --room.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    room: { type: 'string', default: `load-${Date.now().toString(36)}` },
    listeners: { type: 'string', default: '50' },
    'per-tab': { type: 'string', default: '50' },
    duration: { type: 'string', default: '60' },
    stagger: { type: 'string', default: '60' },
    relay: { type: 'boolean', default: false },
    'no-speaker': { type: 'boolean', default: false },
    chrome: { type: 'string', default: process.env.CHROME_PATH ?? defaultChromePath() },
    headful: { type: 'boolean', default: false },
  },
});

const listeners = Number(args.listeners);
const perTab = Number(args['per-tab']);
const durationSec = Number(args.duration);
const baseUrl = args.url.replace(/\/$/, '');

function defaultChromePath() {
  switch (process.platform) {
    case 'win32':
      return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    case 'darwin':
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    default:
      return '/usr/bin/google-chrome';
  }
}

async function fetchStats() {
  const res = await fetch(`${baseUrl}/api/stats`);
  if (!res.ok) throw new Error(`/api/stats returned ${res.status}`);
  return res.json();
}

function pageUrl(params) {
  const query = new URLSearchParams({ room: args.room, stagger: args.stagger, ...params });
  if (args.relay) query.set('relay', '1');
  return `${baseUrl}/loadtest.html?${query}`;
}

function pad(value, width) {
  return String(value).padStart(width);
}

async function main() {
  await fetchStats().catch((error) => {
    throw new Error(`Media node not reachable at ${baseUrl}: ${error.message}`);
  });

  console.log(`Room ${args.room}: 1 speaker + ${listeners} listeners, ${perTab} per tab, ${durationSec}s`);
  const browser = await puppeteer.launch({
    executablePath: args.chrome,
    headless: !args.headful,
    args: [
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--mute-audio',
    ],
  });

  const pages = [];
  try {
    if (!args['no-speaker']) {
      const speaker = await browser.newPage();
      await speaker.goto(pageUrl({ listeners: '0', speaker: '1' }));
      pages.push({ page: speaker, role: 'speaker' });
      await new Promise((r) => setTimeout(r, 1500));
    }

    for (let remaining = listeners, tab = 0; remaining > 0; remaining -= perTab, tab++) {
      const count = Math.min(perTab, remaining);
      const page = await browser.newPage();
      page.on('pageerror', (error) => console.error(`[tab ${tab}] ${error.message}`));
      await page.goto(pageUrl({ listeners: String(count) }));
      pages.push({ page, role: 'listeners' });
    }

    const samples = [];
    const startedAt = Date.now();
    console.log('\n  time  connected  failed  receiving  loss%  jitter  worker CPU%            node RSS');
    while (Date.now() - startedAt < durationSec * 1000) {
      await new Promise((r) => setTimeout(r, 5000));
      const tabSummaries = await Promise.all(
        pages.filter((p) => p.role === 'listeners').map((p) => p.page.evaluate(() => window.__loadtest)),
      );
      const stats = await fetchStats();

      const connected = tabSummaries.reduce((n, s) => n + s.connected, 0);
      const failed = tabSummaries.reduce((n, s) => n + s.failed, 0);
      const receiving = tabSummaries.reduce((n, s) => n + s.receiving, 0);
      const weight = Math.max(1, connected);
      const loss = tabSummaries.reduce((n, s) => n + s.avgLossPercent * s.connected, 0) / weight;
      const jitter = tabSummaries.reduce((n, s) => n + s.avgJitterMs * s.connected, 0) / weight;
      const cpu = stats.workers.map((w) => w.cpuPercent);

      samples.push({
        t: Math.round((Date.now() - startedAt) / 1000),
        connected,
        failed,
        receiving,
        lossPercent: Math.round(loss * 10) / 10,
        jitterMs: Math.round(jitter),
        workerCpuPercent: cpu,
        consumers: stats.totals.consumers,
        rssMb: stats.process.rssMb,
      });
      const s = samples.at(-1);
      console.log(
        `${pad(s.t + 's', 6)} ${pad(connected, 10)} ${pad(failed, 7)} ${pad(receiving, 10)} ${pad(s.lossPercent, 6)} ${pad(s.jitterMs + 'ms', 7)}  ${cpu.map((c) => pad(c, 5)).join(' ').padEnd(22)} ${pad(s.rssMb + 'MB', 8)}`,
      );
    }

    const settled = samples.slice(Math.floor(samples.length / 2));
    const avg = (key) => settled.reduce((n, s) => n + s[key], 0) / Math.max(1, settled.length);
    const maxWorkerCpu = Math.max(...settled.flatMap((s) => s.workerCpuPercent));
    const last = samples.at(-1) ?? {};
    const result = {
      when: new Date().toISOString(),
      target: baseUrl,
      room: args.room,
      listenersRequested: listeners,
      perTab,
      durationSec,
      forcedRelay: args.relay,
      loadMachine: { platform: process.platform, cpus: os.cpus().length, hostname: os.hostname() },
      final: {
        connected: last.connected,
        failed: last.failed,
        receiving: last.receiving,
      },
      settledAverages: {
        lossPercent: Math.round(avg('lossPercent') * 10) / 10,
        jitterMs: Math.round(avg('jitterMs')),
        maxWorkerCpuPercent: maxWorkerCpu,
      },
      samples,
    };

    await mkdir(path.join(here, 'results'), { recursive: true });
    const file = path.join(here, 'results', `loadtest-${args.room}.json`);
    await writeFile(file, JSON.stringify(result, null, 2));

    console.log('\nSummary (second half of the run):');
    console.log(`  connected ${result.final.connected}/${listeners}, receiving audio ${result.final.receiving}, failed ${result.final.failed}`);
    console.log(`  avg loss ${result.settledAverages.lossPercent}%, avg jitter ${result.settledAverages.jitterMs} ms`);
    console.log(`  busiest mediasoup worker: ${maxWorkerCpu}% of one CPU core`);
    console.log(`  saved ${file}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
