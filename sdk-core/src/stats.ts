import type { types } from 'mediasoup-client';
import type { ConnectionStats, QualityLevel } from './types';

type Sample = { bytes: number; packetsLost: number; packets: number; at: number };

const MIN_WINDOW_MS = 1000;

/** Turns WebRTC getStats() reports into bitrates and loss over the interval since the last call. */
export class StatsCollector {
  /** Per stream: the latest baseline and the one before it (always ≥ MIN_WINDOW_MS older). */
  private readonly last = new Map<string, { recent: Sample; older: Sample | null }>();

  async collect(transports: (types.Transport | null)[]): Promise<ConnectionStats> {
    const result: ConnectionStats = {
      rttMs: null,
      path: 'unknown',
      inbound: { bitrateKbps: 0, lossPercent: 0, jitterMs: 0, streams: 0 },
      outbound: { bitrateKbps: 0, lossPercent: 0 },
    };
    const now = Date.now();
    let inBytes = 0;
    let inLost = 0;
    let inPackets = 0;
    let outBytes = 0;
    let elapsedIn = 0;
    let elapsedOut = 0;
    let remoteLossMax = 0;

    for (const transport of transports) {
      if (!transport || transport.closed) continue;
      const report = await transport.getStats();
      const byId = new Map<string, RTCStats & Record<string, unknown>>();
      report.forEach((s) => byId.set(s.id, s as RTCStats & Record<string, unknown>));

      for (const s of byId.values()) {
        if (s.type === 'candidate-pair' && (s.nominated || s.selected) && s.state === 'succeeded') {
          if (typeof s.currentRoundTripTime === 'number') result.rttMs = Math.round((s.currentRoundTripTime as number) * 1000);
          const local = byId.get(String(s.localCandidateId));
          if (local) {
            if (local.candidateType === 'relay') result.path = 'relay';
            else if (local.protocol === 'tcp') result.path = 'tcp';
            else if (local.protocol === 'udp') result.path = 'udp';
          }
        }
        if (s.type === 'inbound-rtp') {
          result.inbound.streams++;
          const jitter = typeof s.jitter === 'number' ? (s.jitter as number) * 1000 : 0;
          result.inbound.jitterMs = Math.max(result.inbound.jitterMs, Math.round(jitter));
          const d = this.delta(s.id, Number(s.bytesReceived ?? 0), Number(s.packetsLost ?? 0), Number(s.packetsReceived ?? 0), now);
          if (d) {
            inBytes += d.bytes;
            inLost += d.packetsLost;
            inPackets += d.packets;
            elapsedIn = Math.max(elapsedIn, d.elapsedMs);
          }
        }
        if (s.type === 'outbound-rtp') {
          const d = this.delta(s.id, Number(s.bytesSent ?? 0), 0, Number(s.packetsSent ?? 0), now);
          if (d) {
            outBytes += d.bytes;
            elapsedOut = Math.max(elapsedOut, d.elapsedMs);
          }
        }
        if (s.type === 'remote-inbound-rtp' && typeof s.fractionLost === 'number') {
          remoteLossMax = Math.max(remoteLossMax, (s.fractionLost as number) * 100);
        }
      }
    }

    if (elapsedIn > 0) result.inbound.bitrateKbps = Math.round((inBytes * 8) / elapsedIn);
    if (elapsedOut > 0) result.outbound.bitrateKbps = Math.round((outBytes * 8) / elapsedOut);
    const expected = inPackets + inLost;
    result.inbound.lossPercent = expected > 0 ? round1((Math.max(0, inLost) / expected) * 100) : 0;
    result.outbound.lossPercent = round1(remoteLossMax);
    return result;
  }

  reset(): void {
    this.last.clear();
  }

  /**
   * Rates are always measured against a baseline at least a second old, so callers reading stats
   * moments apart (the app and the SDK's own quality monitor) both get a meaningful number.
   */
  private delta(id: string, bytes: number, packetsLost: number, packets: number, at: number) {
    const sample = { bytes, packetsLost, packets, at };
    const entry = this.last.get(id);
    if (!entry) {
      this.last.set(id, { recent: sample, older: null });
      return null;
    }
    let prev: Sample | null;
    if (at - entry.recent.at >= MIN_WINDOW_MS) {
      prev = entry.recent;
      this.last.set(id, { recent: sample, older: entry.recent });
    } else {
      prev = entry.older;
    }
    if (!prev || at <= prev.at) return null;
    return { bytes: bytes - prev.bytes, packetsLost: packetsLost - prev.packetsLost, packets: packets - prev.packets, elapsedMs: at - prev.at };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Map loss, delay and jitter to a 1 (excellent) … 5 (very bad) score. */
export function qualityLevel(lossPercent: number, rttMs: number | null, jitterMs: number): QualityLevel {
  const rtt = rttMs ?? 0;
  if (lossPercent > 20 || rtt > 800) return 5;
  if (lossPercent > 10 || rtt > 500 || jitterMs > 100) return 4;
  if (lossPercent > 5 || rtt > 300 || jitterMs > 60) return 3;
  if (lossPercent > 2 || rtt > 150 || jitterMs > 30) return 2;
  return 1;
}

/** dBov (-127 silent … 0 loudest) to 0–100, with -70 dBov as the floor. */
export function volumeToLevel(dbov: number): number {
  return Math.max(0, Math.min(100, Math.round(((dbov + 70) / 50) * 100)));
}
