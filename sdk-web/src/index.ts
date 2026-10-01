/**
 * Web SDK. Everything from the core client plus helpers for the browser's microphone and camera.
 *
 *   import { createClient, createMicrophoneTrack } from '@nadir-network/web';
 *
 *   const client = createClient({ appId: 'YOUR_APP_ID', allocatorUrl: 'https://api.example.com' });
 *   client.on('trackSubscribed', (user, track) => playRemoteTrack(track));
 *   await client.join({ channel: 'room-1', uid: 'alice', token });
 *   await client.publish(await createMicrophoneTrack());
 */
import { RtcClient, type ClientConfig } from '../../sdk-core/src/index';
import type { RemoteTrack } from '../../sdk-core/src/types';

export * from '../../sdk-core/src/index';

export function createClient(config: ClientConfig): RtcClient {
  return new RtcClient(config);
}

export type MicrophoneOptions = {
  deviceId?: string;
  /** Echo cancellation, noise suppression and automatic gain (default true). Turn off for music. */
  voiceProcessing?: boolean;
};

export async function createMicrophoneTrack(options: MicrophoneOptions = {}): Promise<MediaStreamTrack> {
  const processing = options.voiceProcessing ?? true;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      echoCancellation: processing,
      noiseSuppression: processing,
      autoGainControl: processing,
    },
  });
  return stream.getAudioTracks()[0]!;
}

export type CameraOptions = {
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  /** Default 640×480 at 24 fps (SD). */
  width?: number;
  height?: number;
  frameRate?: number;
};

export async function createCameraTrack(options: CameraOptions = {}): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      facingMode: options.facingMode,
      width: options.width ?? 640,
      height: options.height ?? 480,
      frameRate: options.frameRate ?? 24,
    },
  });
  return stream.getVideoTracks()[0]!;
}

/** Play a remote audio track. Returns the element so you can remove it later. */
export function playRemoteAudio(track: RemoteTrack, container: HTMLElement = document.body): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.srcObject = new MediaStream([track.track]);
  audio.dataset.consumerId = track.consumerId;
  container.append(audio);
  void audio.play().catch(() => {
    // Autoplay was blocked: play on the next click anywhere.
    document.addEventListener('click', () => void audio.play().catch(() => {}), { once: true });
  });
  return audio;
}

/** Show a remote (or local) video track in a <video> element. */
export function playVideo(track: MediaStreamTrack | RemoteTrack, video: HTMLVideoElement): void {
  const media = 'track' in track ? track.track : track;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = new MediaStream([media]);
  void video.play().catch(() => {});
}
