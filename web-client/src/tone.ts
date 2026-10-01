/**
 * Synthetic audio sources, so tests run on machines without a microphone and give repeatable input.
 */

export type ToneSource = {
  track: MediaStreamTrack;
  context: AudioContext;
  /** Schedule a beep at an AudioContext time (seconds). */
  beepAt(time: number, durationSec?: number): void;
  stop(): void;
};

/** A silent track that only makes sound when beepAt() is called. */
export function createBeepSource(context: AudioContext, frequency = 1000): ToneSource {
  const oscillator = context.createOscillator();
  oscillator.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.value = 0;
  const destination = context.createMediaStreamDestination();
  oscillator.connect(gain).connect(destination);
  oscillator.start();

  const track = destination.stream.getAudioTracks()[0]!;
  return {
    track,
    context,
    beepAt(time, durationSec = 0.06) {
      // Short ramps avoid clicks, which would smear the onset the latency test detects.
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.8, time + 0.002);
      gain.gain.setValueAtTime(0.8, time + durationSec - 0.002);
      gain.gain.linearRampToValueAtTime(0, time + durationSec);
    },
    stop() {
      oscillator.stop();
      track.stop();
    },
  };
}

/** A steady pattern (a soft two-note chirp every second) you can hear in a room test. */
export function createChirpTrack(context: AudioContext): ToneSource {
  const source = createBeepSource(context, 660);
  let timer: ReturnType<typeof setInterval> | null = setInterval(() => {
    const t = context.currentTime + 0.05;
    source.beepAt(t, 0.12);
  }, 1000);
  return {
    ...source,
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      source.stop();
    },
  };
}

/**
 * A quiet continuous tone. Load tests use it because the encoder never goes silent (no DTX gaps),
 * so a listener's bitrate is a reliable "is audio arriving" signal at any moment.
 */
export function createSteadyTrack(context: AudioContext, frequency = 440): ToneSource {
  const source = createBeepSource(context, frequency);
  const gain = context.createGain();
  gain.gain.value = 0.15;
  const oscillator = context.createOscillator();
  oscillator.frequency.value = frequency;
  const destination = context.createMediaStreamDestination();
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  const track = destination.stream.getAudioTracks()[0]!;
  return {
    ...source,
    track,
    stop() {
      oscillator.stop();
      track.stop();
      source.stop();
    },
  };
}
