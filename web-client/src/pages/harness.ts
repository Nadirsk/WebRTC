import * as sdk from '../../../sdk-web/src/index';
import { createChirpTrack } from '../tone';

/**
 * Test harness: exposes the web SDK to automated tests (tools/p1/*), which drive it with
 * page.evaluate(). Not linked from the tools index.
 */
declare global {
  interface Window {
    harness: typeof harness;
  }
}

const harness = {
  sdk,
  /** A synthetic audio track (repeating chirps), so tests need no microphone. */
  toneTrack(): MediaStreamTrack {
    return createChirpTrack(new AudioContext()).track;
  },
  /** Named clients created by tests, plus a per-client event log. */
  clients: {} as Record<string, sdk.RtcClient>,
  events: {} as Record<string, { t: number; name: string; data: unknown }[]>,
  create(name: string, config: sdk.ClientConfig): sdk.RtcClient {
    const client = sdk.createClient(config);
    const log: { t: number; name: string; data: unknown }[] = [];
    const record = (event: string) => (...args: unknown[]) =>
      log.push({ t: Date.now(), name: event, data: JSON.parse(JSON.stringify(args, (_k, v) => (v instanceof MediaStreamTrack ? v.id : v))) });
    for (const event of [
      'connectionStateChanged', 'userJoined', 'userLeft', 'userUpdated', 'trackSubscribed', 'trackUnsubscribed',
      'userMuted', 'activeSpeaker', 'tokenWillExpire', 'tokenDidExpire', 'mutedByHost', 'roleChanged', 'exception',
    ] as const) {
      client.on(event, record(event) as never);
    }
    this.clients[name] = client;
    this.events[name] = log;
    return client;
  },
  /** Inbound audio bitrate of one client, in kbps (0 when nothing arrives). */
  async inboundKbps(name: string): Promise<number> {
    const client = this.clients[name];
    if (!client || client.connectionState !== 'connected') return 0;
    return (await client.getStats()).inbound.bitrateKbps;
  },
};

window.harness = harness;
document.body.dataset.ready = '1';
