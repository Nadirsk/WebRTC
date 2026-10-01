/**
 * One-to-one video call sample. Both people join the same channel (for example the ID of the
 * conversation in your app), publish camera and microphone, and show each other.
 */
import {
  createCameraTrack,
  createClient,
  createMicrophoneTrack,
  playRemoteAudio,
  playVideo,
  type LocalTrack,
} from '../../sdk-web/src/index';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

async function getToken(channel: string, uid: string) {
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, uid, role: 'speaker' }),
  });
  if (!res.ok) throw new Error('Could not get a token from the backend');
  return (await res.json()) as { token: string; appId: string; allocatorUrl: string };
}

const params = new URLSearchParams(location.search);
$<HTMLInputElement>('#channel').value = params.get('call') ?? `call-${Math.random().toString(36).slice(2, 8)}`;

$('#start').addEventListener('submit', async (event) => {
  event.preventDefault();
  const channel = $<HTMLInputElement>('#channel').value.trim();
  const uid = `user-${Math.random().toString(36).slice(2, 8)}`;
  const { token, appId, allocatorUrl } = await getToken(channel, uid);

  const client = createClient({ appId, allocatorUrl });
  const status = (text: string) => ($('#status').textContent = text);

  client.on('userJoined', () => status('Connected'));
  client.on('userLeft', () => status('The other person left'));
  client.on('trackSubscribed', (_user, track) => {
    if (track.kind === 'video') playVideo(track, $<HTMLVideoElement>('#remote'));
    else playRemoteAudio(track);
  });
  client.on('connectionStateChanged', (state) => {
    if (state === 'reconnecting') status('Reconnecting…');
  });
  client.on('networkQuality', ({ uplink, downlink }) => {
    const worst = Math.max(uplink, downlink);
    $('#quality').textContent = worst >= 4 ? 'Poor connection' : '';
  });

  await client.join({ channel, uid, token });
  const mic: LocalTrack = await client.publish(await createMicrophoneTrack());
  const cam: LocalTrack = await client.publish(await createCameraTrack());
  playVideo(cam.track, $<HTMLVideoElement>('#local'));

  $('#start').hidden = true;
  $('#call').hidden = false;
  const link = `${location.origin}${location.pathname}?call=${encodeURIComponent(channel)}`;
  $('#link').textContent = link;
  status(client.remoteUsers.length ? 'Connected' : 'Waiting for the other person… share the link');

  $('#mic').onclick = async () => {
    await mic.setMuted(!mic.muted);
    $('#mic').textContent = mic.muted ? 'Unmute' : 'Mute';
  };
  $('#cam').onclick = async () => {
    await cam.setMuted(!cam.muted);
    $('#cam').textContent = cam.muted ? 'Camera on' : 'Camera off';
  };
  $('#hangup').onclick = async () => {
    mic.track.stop();
    cam.track.stop();
    await client.leave();
    status('Call ended');
    $('#call').hidden = true;
  };
});
