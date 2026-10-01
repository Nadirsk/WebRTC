import { createClient } from '../../../sdk-web/src/index';
import { $, attachSilently, defaultAllocatorUrl, el, median, percentile, randomId, resolveAppId } from '../common';
import { createBeepSource, type ToneSource } from '../tone';

/**
 * Sample-accurate beep timing: the beeps are scheduled and detected in the same AudioContext,
 * so emit and detect times share one clock (AudioContext frames).
 */
const DETECTOR_SOURCE = `
class OnsetDetector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.holdUntil = 0;
    this.threshold = 0.08;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    if (currentFrame + channel.length < this.holdUntil) return true;
    for (let i = 0; i < channel.length; i++) {
      if (Math.abs(channel[i]) > this.threshold) {
        const frame = currentFrame + i;
        this.port.postMessage({ frame });
        this.holdUntil = frame + sampleRate * 0.25;
        break;
      }
    }
    return true;
  }
}
registerProcessor('onset-detector', OnsetDetector);
`;

const allocatorInput = $('#allocator-url') as HTMLInputElement;
const appIdInput = $('#app-id') as HTMLInputElement;
const countInput = $('#count') as HTMLInputElement;
const intervalInput = $('#interval') as HTMLInputElement;
const forceRelay = $('#force-relay') as HTMLInputElement;
const startBtn = $('#start-btn') as HTMLButtonElement;
const stopBtn = $('#stop-btn') as HTMLButtonElement;
const errorBox = $('#error');
const status = $('#status');
const logList = $('#log');

allocatorInput.value = defaultAllocatorUrl();
void resolveAppId(allocatorInput.value).then((id) => (appIdInput.value = appIdInput.value || id));

let running: { stop: () => Promise<void> } | null = null;

function setStatus(text: string, cls = '') {
  status.textContent = text;
  status.className = `pill ${cls}`;
}

function log(message: string) {
  logList.prepend(el('li', { textContent: message }));
}

function renderResults(latencies: number[], sent: number) {
  if (latencies.length === 0) return;
  $('#k-median').innerHTML = `${Math.round(median(latencies))}<small> ms</small>`;
  $('#k-p95').innerHTML = `${Math.round(percentile(latencies, 95))}<small> ms</small>`;
  $('#k-range').innerHTML = `${Math.round(Math.min(...latencies))} / ${Math.round(Math.max(...latencies))}<small> ms</small>`;
  $('#k-heard').innerHTML = `${latencies.length}<small> of ${sent}</small>`;
}

async function start(event: SubmitEvent) {
  event.preventDefault();
  errorBox.hidden = true;
  logList.replaceChildren();
  startBtn.disabled = true;
  stopBtn.disabled = false;

  const count = Number(countInput.value);
  const interval = Number(intervalInput.value);
  const channel = randomId('latency');
  const clientConfig = { appId: appIdInput.value.trim(), allocatorUrl: allocatorInput.value.trim(), forceRelay: forceRelay.checked };

  const context = new AudioContext({ latencyHint: 'interactive' });
  await context.resume();
  const blobUrl = URL.createObjectURL(new Blob([DETECTOR_SOURCE], { type: 'text/javascript' }));
  await context.audioWorklet.addModule(blobUrl);
  URL.revokeObjectURL(blobUrl);

  const sender = createClient(clientConfig);
  const receiver = createClient(clientConfig);
  let beeps: ToneSource | null = null;
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;

  const stop = async () => {
    if (statsTimer) clearInterval(statsTimer);
    if (finishTimer) clearTimeout(finishTimer);
    beeps?.stop();
    await Promise.all([sender.leave(), receiver.leave()]);
    await context.close();
    running = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };
  running = { stop };

  try {
    setStatus('connecting', 'connecting');
    const heard = new Promise<MediaStreamTrack>((resolve) => {
      receiver.on('trackSubscribed', (_user, remote) => {
        if (remote.kind === 'audio') resolve(remote.track);
      });
    });
    await receiver.join({ channel, uid: 'latency-receiver', role: 'audience' });
    await sender.join({ channel, uid: 'latency-sender', role: 'speaker' });

    beeps = createBeepSource(context);
    await sender.publish(beeps.track, { source: 'latency-beeps' });
    const track = await Promise.race([
      heard,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('No audio came back from the server within 10 s')), 10_000)),
    ]);

    attachSilently(track);
    const detector = new AudioWorkletNode(context, 'onset-detector');
    context.createMediaStreamSource(new MediaStream([track])).connect(detector);

    // Give ICE/DTLS and the jitter buffer a moment to settle before the first beep.
    setStatus('measuring', 'connected');
    const firstAt = context.currentTime + 1.5;
    const emitFrames: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = firstAt + i * interval;
      beeps.beepAt(t);
      emitFrames.push(Math.round(t * context.sampleRate));
    }

    const latencies: number[] = [];
    const matched = new Set<number>();
    detector.port.onmessage = (msg: MessageEvent<{ frame: number }>) => {
      const frame = msg.data.frame;
      // Pair with the latest beep emitted before this detection that is not yet paired.
      for (let i = emitFrames.length - 1; i >= 0; i--) {
        const emitted = emitFrames[i]!;
        if (emitted > frame || matched.has(i)) continue;
        const ms = ((frame - emitted) / context.sampleRate) * 1000;
        if (ms > interval * 1000) break;
        matched.add(i);
        latencies.push(ms);
        log(`beep ${i + 1}: ${Math.round(ms)} ms`);
        renderResults(latencies, i + 1);
        break;
      }
    };

    statsTimer = setInterval(async () => {
      const s = await receiver.getStats();
      $('#k-rtt').innerHTML = s.rttMs === null ? '–' : `${s.rttMs}<small> ms</small>`;
      $('#k-path').textContent = { udp: 'UDP', tcp: 'TCP', relay: 'TURN', unknown: '–' }[s.path];
    }, 1000);

    const totalMs = (1.5 + count * interval + 1) * 1000;
    finishTimer = setTimeout(async () => {
      renderResults(latencies, count);
      setStatus(`done · ${latencies.length}/${count} heard`, latencies.length === count ? 'connected' : 'disconnected');
      log(`finished: median ${Math.round(median(latencies))} ms, p95 ${Math.round(percentile(latencies, 95))} ms`);
      await stop();
    }, totalMs);
  } catch (error) {
    errorBox.textContent = error instanceof Error ? error.message : String(error);
    errorBox.hidden = false;
    setStatus('failed', 'failed');
    await stop();
  }
}

$('#form').addEventListener('submit', (e) => void start(e as SubmitEvent));
stopBtn.addEventListener('click', async () => {
  await running?.stop();
  setStatus('stopped');
});
