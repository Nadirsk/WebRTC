/**
 * React Native SDK. Needs react-native-webrtc (a development build, not Expo Go).
 *
 *   import { registerGlobals } from 'react-native-webrtc';
 *   registerGlobals();                        // once, in index.js, before anything else
 *
 *   import { createClient, createMicrophoneTrack } from '@nadir-network/react-native';
 *   const client = createClient({ appId, allocatorUrl });
 *   await client.join({ channel: 'room-1', uid: 'alice', token });
 *   await client.publish(await createMicrophoneTrack());
 *
 * Remote audio plays automatically through react-native-webrtc; show video with <RTCView streamURL>.
 */
import { RtcClient, type ClientConfig } from '../../sdk-core/src/index';

export * from '../../sdk-core/src/index';

/** mediasoup-client handler that matches react-native-webrtc 106+. */
export const REACT_NATIVE_HANDLER = 'ReactNative106' as const;

export function createClient(config: Omit<ClientConfig, 'handlerName'>): RtcClient {
  return new RtcClient({ ...config, handlerName: REACT_NATIVE_HANDLER });
}

type MediaDevicesLike = { getUserMedia(constraints: unknown): Promise<{ getAudioTracks(): unknown[]; getVideoTracks(): unknown[] }> };

function mediaDevices(): MediaDevicesLike {
  const devices = (globalThis as { navigator?: { mediaDevices?: MediaDevicesLike } }).navigator?.mediaDevices;
  if (!devices) throw new Error('Call registerGlobals() from react-native-webrtc before using the SDK');
  return devices;
}

export async function createMicrophoneTrack(): Promise<MediaStreamTrack> {
  const stream = await mediaDevices().getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return stream.getAudioTracks()[0] as MediaStreamTrack;
}

export async function createCameraTrack(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStreamTrack> {
  const stream = await mediaDevices().getUserMedia({
    video: { facingMode, width: 640, height: 480, frameRate: 24 },
  });
  return stream.getVideoTracks()[0] as MediaStreamTrack;
}
