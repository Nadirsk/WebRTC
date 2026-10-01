import * as mediasoup from 'mediasoup';
import type { types } from 'mediasoup';
import { config } from './config';
import { createLogger } from '../../shared/logger';

const log = createLogger('workers');

export type WorkerEntry = {
  index: number;
  worker: types.Worker;
  webRtcServer: types.WebRtcServer;
  /** Routers (rooms) placed on this worker. Used for least-loaded placement. */
  routerCount: number;
  /** CPU usage of the worker process over the last sampling window, 0–100 (one core = 100). */
  cpuPercent: number;
};

const entries: WorkerEntry[] = [];

export async function startWorkers(): Promise<WorkerEntry[]> {
  const { numWorkers, workerSettings, webRtcServer } = config.mediasoup;

  for (let index = 0; index < numWorkers; index++) {
    const worker = await mediasoup.createWorker(workerSettings);
    const port = webRtcServer.basePort + index;

    const server = await worker.createWebRtcServer({
      listenInfos: [
        { protocol: 'udp', ip: webRtcServer.listenIp, announcedAddress: webRtcServer.announcedAddress, port },
        { protocol: 'tcp', ip: webRtcServer.listenIp, announcedAddress: webRtcServer.announcedAddress, port },
      ],
    });

    worker.on('died', (error) => {
      // A dead worker takes its rooms with it. Exit so the process supervisor restarts the node;
      // clients reconnect through their normal reconnect path.
      log.error('mediasoup worker died, exiting', { index, pid: worker.pid, error: String(error) });
      setTimeout(() => process.exit(1), 1000);
    });

    entries.push({ index, worker, webRtcServer: server, routerCount: 0, cpuPercent: 0 });
    log.info('worker started', { index, pid: worker.pid, port });
  }

  startCpuSampling();
  return entries;
}

/** Least-loaded worker by router count. A room lives entirely on one worker in P0. */
export function pickWorker(): WorkerEntry {
  if (entries.length === 0) throw new Error('workers not started');
  return entries.reduce((best, e) => (e.routerCount < best.routerCount ? e : best));
}

export function getWorkers(): readonly WorkerEntry[] {
  return entries;
}

function startCpuSampling(intervalMs = 2000) {
  const last = new Map<number, { cpuMs: number; at: number }>();

  const sample = async () => {
    for (const entry of entries) {
      try {
        const usage = await entry.worker.getResourceUsage();
        const cpuMs = usage.ru_utime + usage.ru_stime;
        const at = Date.now();
        const prev = last.get(entry.index);
        if (prev) {
          entry.cpuPercent = Math.round(((cpuMs - prev.cpuMs) / (at - prev.at)) * 1000) / 10;
        }
        last.set(entry.index, { cpuMs, at });
      } catch {
        // The worker may be closing; skip this sample.
      }
    }
  };

  setInterval(() => void sample(), intervalMs).unref();
  void sample();
}
