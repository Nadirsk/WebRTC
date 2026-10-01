/**
 * Voice room sample: hosts moderate, speakers talk, the audience listens and can be invited up.
 * The whole integration is the SDK calls below; everything else is plain DOM code.
 */
import {
  createClient,
  createMicrophoneTrack,
  playRemoteAudio,
  type LocalTrack,
  type RemoteUser,
  type Role,
} from '../../sdk-web/src/index';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

/** Ask our own backend for a token (see samples/token-server). */
async function getToken(channel: string, uid: string, role: Role) {
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, uid, role }),
  });
  if (!res.ok) throw new Error('Could not get a token from the backend');
  return (await res.json()) as { token: string; appId: string; allocatorUrl: string };
}

let mic: LocalTrack | null = null;
const audio = new Map<string, HTMLAudioElement>();

$('#join').addEventListener('submit', async (event) => {
  event.preventDefault();
  const channel = $<HTMLInputElement>('#channel').value.trim();
  const name = $<HTMLInputElement>('#name').value.trim();
  const role = $<HTMLSelectElement>('#role').value as Role;
  const uid = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 5)}`;

  // 1. Token from your backend. Its role is a ceiling: audience members get "speaker" so a host
  //    can invite them up; they still join as audience.
  const maxRole: Role = role === 'host' ? 'host' : 'speaker';
  const { token, appId, allocatorUrl } = await getToken(channel, uid, maxRole);

  // 2. Create the client and listen for what matters to the UI.
  const client = createClient({ appId, allocatorUrl });
  let updateButtons = () => {};
  const render = () => renderPeople(client.remoteUsers, client.role === 'host', client);
  client.on('userJoined', render);
  client.on('userLeft', render);
  client.on('userUpdated', render);
  client.on('trackSubscribed', (user, track) => {
    if (track.kind === 'audio') audio.set(user.uid, playRemoteAudio(track));
  });
  client.on('trackUnsubscribed', (user) => {
    audio.get(user.uid)?.remove();
    audio.delete(user.uid);
  });
  client.on('activeSpeaker', (speaking) => {
    document.querySelectorAll('[data-uid]').forEach((el) => el.classList.toggle('speaking', el.getAttribute('data-uid') === speaking));
  });
  client.on('connectionStateChanged', (state, _prev, reason) => {
    $('#state').textContent = reason ? `${state} (${reason})` : state;
  });
  client.on('roleChanged', async (newRole) => {
    $('#me').textContent = `${name} · ${newRole}`;
    if (newRole === 'audience') {
      mic?.track.stop();
      mic = null;
    } else if (!mic) {
      mic = await client.publish(await createMicrophoneTrack());
    }
    updateButtons();
  });
  client.on('tokenWillExpire', async () => client.renewToken((await getToken(channel, uid, maxRole)).token));

  // 3. Join, and publish the microphone if we are on stage.
  await client.join({ channel, uid, token, role, displayName: name });
  if (client.role !== 'audience') mic = await client.publish(await createMicrophoneTrack());

  $('#join').hidden = true;
  $('#room').hidden = false;
  $('#me').textContent = `${name} · ${client.role}`;
  render();

  updateButtons = () => {
    $<HTMLButtonElement>('#mute').hidden = !mic;
    $<HTMLButtonElement>('#mute').textContent = mic?.muted ? 'Unmute' : 'Mute';
    $<HTMLButtonElement>('#end').hidden = client.role !== 'host';
  };
  updateButtons();
  $('#mute').onclick = async () => {
    await mic?.setMuted(!mic.muted);
    updateButtons();
  };
  $('#end').onclick = () => client.endChannel();
  $('#leave').onclick = async () => {
    mic?.track.stop();
    await client.leave();
    location.reload();
  };
});

function renderPeople(users: RemoteUser[], isHost: boolean, client: ReturnType<typeof createClient>) {
  const list = $('#people');
  list.replaceChildren();
  for (const user of users) {
    const li = document.createElement('li');
    li.dataset.uid = user.uid;
    li.textContent = `${user.displayName} · ${user.role}`;
    if (isHost) {
      const onStage = user.role !== 'audience';
      for (const [label, action] of [
        [onStage ? 'Move to audience' : 'Invite to speak', () => client.setRemoteUserRole(user.uid, onStage ? 'audience' : 'speaker')],
        ['Mute', () => client.muteRemoteUser(user.uid)],
        ['Remove', () => client.removeRemoteUser(user.uid, { banSeconds: 600 })],
      ] as const) {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () => void action().catch((e: Error) => alert(e.message));
        li.append(' ', b);
      }
    }
    list.append(li);
  }
}
