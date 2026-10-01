import {
  createClient,
  createCameraTrack,
  createMicrophoneTrack,
  type LocalTrack,
  type RemoteTrack,
  type RemoteUser,
  type Role,
  type RtcClient,
} from '../../../sdk-web/src/index';
import { $, defaultAllocatorUrl, el, param, randomId, resolveAppId, uidFromName } from '../common';
import { createChirpTrack, type ToneSource } from '../tone';

const form = $('#join-form') as HTMLFormElement;
const roomInput = $('#room-id') as HTMLInputElement;
const nameInput = $('#display-name') as HTMLInputElement;
const roleSelect = $('#role') as HTMLSelectElement;
const allocatorInput = $('#allocator-url') as HTMLInputElement;
const appIdInput = $('#app-id') as HTMLInputElement;
const tokenInput = $('#token') as HTMLInputElement;
const useTone = $('#use-tone') as HTMLInputElement;
const forceRelay = $('#force-relay') as HTMLInputElement;
const joinBtn = $('#join-btn') as HTMLButtonElement;
const joinError = $('#join-error');
const roomError = $('#room-error');
const micBtn = $('#mic-btn') as HTMLButtonElement;
const camBtn = $('#cam-btn') as HTMLButtonElement;
const stageBtn = $('#stage-btn') as HTMLButtonElement;
const endBtn = $('#end-btn') as HTMLButtonElement;
const tiles = $('#tiles');
const audioSink = $('#audio-sink');
const logList = $('#log');

roomInput.value = param('room') || randomId();
nameInput.value = param('name') || `Guest ${Math.floor(Math.random() * 900 + 100)}`;
roleSelect.value = param('role') || 'speaker';
allocatorInput.value = defaultAllocatorUrl();
tokenInput.value = param('token');
void resolveAppId(allocatorInput.value).then((id) => (appIdInput.value = appIdInput.value || id));

let client: RtcClient | null = null;
let mic: LocalTrack | null = null;
let cam: LocalTrack | null = null;
let tone: ToneSource | null = null;
let statsTimer: ReturnType<typeof setInterval> | null = null;

type TileState = {
  root: HTMLElement;
  video: HTMLVideoElement;
  level: HTMLElement;
  micTag: HTMLElement;
  roleTag: HTMLElement;
  hostTools: HTMLElement;
};
const tileByUid = new Map<string, TileState>();
const audioByConsumer = new Map<string, HTMLAudioElement>();

function log(message: string) {
  const time = new Date().toLocaleTimeString();
  logList.prepend(el('li', { textContent: `${time}  ${message}` }));
  while (logList.children.length > 80) logList.lastElementChild?.remove();
}

function showError(target: HTMLElement, error: unknown) {
  target.textContent = error instanceof Error ? error.message : String(error);
  target.hidden = false;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

function roleLabel(role: Role): string {
  return role === 'audience' ? 'listener' : role;
}

function hostAction(label: string, run: () => Promise<void>): HTMLButtonElement {
  const button = el('button', { type: 'button', textContent: label, className: 'small' });
  button.addEventListener('click', () => void run().catch((e) => showError(roomError, e)));
  return button;
}

function ensureTile(uid: string, displayName: string, role: Role, isSelf = false): TileState {
  const existing = tileByUid.get(uid);
  if (existing) return existing;

  const video = el('video', { autoplay: true, playsInline: true, muted: true });
  video.hidden = true;
  const level = el('i');
  const micTag = el('span', { textContent: 'mic off' });
  const roleTag = el('span', { textContent: roleLabel(role) });
  const hostTools = el('div', { className: 'host-tools' });
  hostTools.hidden = true;
  if (!isSelf) {
    hostTools.append(
      hostAction('Mute', () => client!.muteRemoteUser(uid, 'audio')),
      hostAction('Stage', async () => {
        const user = client!.remoteUsers.find((u) => u.uid === uid);
        await client!.setRemoteUserRole(uid, user?.role === 'audience' ? 'speaker' : 'audience');
      }),
      hostAction('Remove', () => client!.removeRemoteUser(uid, { banSeconds: 60 })),
    );
  }
  const root = el('div', { className: 'tile' }, [
    video,
    el('div', { className: 'avatar', textContent: initials(displayName) }),
    el('div', { className: 'name', textContent: isSelf ? `${displayName} (you)` : displayName }),
    el('div', { className: 'meta' }, [roleTag, micTag]),
    el('div', { className: 'level' }, [level]),
    hostTools,
  ]);
  root.dataset.uid = uid;
  tiles.append(root);
  const state = { root, video, level, micTag, roleTag, hostTools };
  tileByUid.set(uid, state);
  refreshHostTools();
  return state;
}

function setMicTag(uid: string, state: 'on' | 'muted' | 'off') {
  const tile = tileByUid.get(uid);
  if (tile) tile.micTag.textContent = state === 'on' ? 'mic on' : state === 'muted' ? 'muted' : 'mic off';
}

function refreshHostTools() {
  const isHost = client?.role === 'host';
  for (const [uid, tile] of tileByUid) tile.hostTools.hidden = !isHost || uid === client?.uid;
  endBtn.hidden = !isHost;
}

function refreshControls() {
  if (!client) return;
  const publisher = client.role !== 'audience';
  micBtn.disabled = !publisher;
  camBtn.disabled = !publisher;
  micBtn.textContent = mic && !mic.muted ? 'Mute mic' : 'Turn mic on';
  micBtn.classList.toggle('on', Boolean(mic && !mic.muted));
  camBtn.textContent = cam ? 'Turn camera off' : 'Turn camera on';
  camBtn.classList.toggle('on', Boolean(cam));
  stageBtn.textContent = publisher ? 'Leave stage' : 'Go on stage';
  stageBtn.disabled = !publisher && client.maxRole === 'audience';
  $('#role-pill').textContent = roleLabel(client.role);
  $('#node-pill').textContent = client.nodeId || '–';
  const self = tileByUid.get(client.uid);
  if (self) self.roleTag.textContent = roleLabel(client.role);
  if (mic) setMicTag(client.uid, mic.muted ? 'muted' : 'on');
  refreshHostTools();
}

async function toggleMic() {
  if (!client) return;
  try {
    if (!mic) {
      let track: MediaStreamTrack;
      if (useTone.checked) {
        tone = createChirpTrack(new AudioContext());
        track = tone.track;
      } else {
        track = await createMicrophoneTrack();
      }
      mic = await client.publish(track, { source: useTone.checked ? 'tone' : 'mic' });
      log(useTone.checked ? 'publishing test tone' : 'microphone on');
    } else {
      await mic.setMuted(!mic.muted);
      log(mic.muted ? 'microphone muted' : 'microphone unmuted');
    }
  } catch (error) {
    showError(roomError, error);
  }
  refreshControls();
}

async function toggleCamera() {
  if (!client) return;
  const self = tileByUid.get(client.uid);
  try {
    if (!cam) {
      const track = await createCameraTrack();
      cam = await client.publish(track, { source: 'camera' });
      if (self) {
        self.video.srcObject = new MediaStream([track]);
        self.video.hidden = false;
      }
      log('camera on');
    } else {
      await cam.close();
      cam = null;
      if (self) {
        self.video.srcObject = null;
        self.video.hidden = true;
      }
      log('camera off');
    }
  } catch (error) {
    showError(roomError, error);
  }
  refreshControls();
}

function stopLocalMedia() {
  mic?.track.stop();
  cam?.track.stop();
  tone?.stop();
  mic = null;
  cam = null;
  tone = null;
  if (client) setMicTag(client.uid, 'off');
  const self = client ? tileByUid.get(client.uid) : undefined;
  if (self) self.video.hidden = true;
}

async function toggleStage() {
  if (!client) return;
  const next: Role = client.role === 'audience' ? 'speaker' : 'audience';
  try {
    await client.setRole(next);
  } catch (error) {
    showError(roomError, error);
  }
  refreshControls();
}

function onTrackSubscribed(user: RemoteUser, remote: RemoteTrack) {
  const tile = ensureTile(user.uid, user.displayName, user.role);
  if (remote.kind === 'audio') {
    const audio = el('audio', { autoplay: true });
    audio.srcObject = new MediaStream([remote.track]);
    audioSink.append(audio);
    void audio.play().catch(() => log('audio autoplay blocked: click anywhere on the page'));
    audioByConsumer.set(remote.consumerId, audio);
    setMicTag(user.uid, remote.muted ? 'muted' : 'on');
  } else {
    tile.video.srcObject = new MediaStream([remote.track]);
    tile.video.hidden = false;
  }
  log(`receiving ${remote.kind} from ${user.displayName}`);
}

function onTrackUnsubscribed(user: RemoteUser, remote: RemoteTrack) {
  if (remote.kind === 'audio') {
    audioByConsumer.get(remote.consumerId)?.remove();
    audioByConsumer.delete(remote.consumerId);
    setMicTag(user.uid, 'off');
  } else {
    const tile = tileByUid.get(user.uid);
    if (tile) {
      tile.video.srcObject = null;
      tile.video.hidden = true;
    }
  }
}

function formatKbps(kbps: number): string {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
}

async function refreshStats() {
  if (!client || client.connectionState !== 'connected') return;
  const s = await client.getStats();
  $('#st-rtt').textContent = s.rttMs === null ? '–' : `${s.rttMs} ms`;
  $('#st-path').textContent = { udp: 'UDP (direct)', tcp: 'TCP (direct)', relay: 'TURN relay', unknown: '–' }[s.path];
  $('#st-in').textContent = `${formatKbps(s.inbound.bitrateKbps)} · ${s.inbound.streams} stream${s.inbound.streams === 1 ? '' : 's'}`;
  $('#st-in-loss').textContent = `${s.inbound.lossPercent}%`;
  $('#st-jitter').textContent = `${s.inbound.jitterMs} ms`;
  $('#st-out').textContent = formatKbps(s.outbound.bitrateKbps);
  $('#st-out-loss').textContent = `${s.outbound.lossPercent}%`;
}

const QUALITY = ['–', 'excellent', 'good', 'poor', 'bad', 'very bad', 'down'];

function wire(c: RtcClient) {
  c.on('connectionStateChanged', (state, _prev, reason) => {
    const pill = $('#state-pill');
    pill.textContent = state;
    pill.className = `pill ${state}`;
    log(`connection ${state}${reason ? ` (${reason})` : ''}`);
    if (state === 'connected') refreshControls();
    if (state === 'disconnected' && reason && reason !== 'leave') {
      const messages: Record<string, string> = {
        kicked: 'A host removed you from this room.',
        channelEnded: 'The host ended the room.',
        tokenExpired: 'Your access token expired.',
        replaced: 'You joined this room from another tab or device.',
        network: 'Lost the connection and could not reconnect.',
      };
      showError(roomError, messages[reason] ?? `Disconnected (${reason}).`);
      stopLocalMedia();
    }
  });
  c.on('userJoined', (user) => {
    ensureTile(user.uid, user.displayName, user.role);
    log(`${user.displayName} joined as ${roleLabel(user.role)}`);
  });
  c.on('userLeft', (user) => {
    tileByUid.get(user.uid)?.root.remove();
    tileByUid.delete(user.uid);
    log(`${user.displayName} left`);
  });
  c.on('userUpdated', (user) => {
    const tile = ensureTile(user.uid, user.displayName, user.role);
    tile.roleTag.textContent = roleLabel(user.role);
    log(`${user.displayName} is now ${roleLabel(user.role)}`);
  });
  c.on('trackSubscribed', onTrackSubscribed);
  c.on('trackUnsubscribed', onTrackUnsubscribed);
  c.on('userMuted', (user, kind, muted) => {
    if (kind === 'audio') setMicTag(user.uid, muted ? 'muted' : 'on');
  });
  c.on('volumeIndicator', (levels) => {
    const loud = new Map(levels.map((l) => [l.uid, l.level]));
    for (const [uid, tile] of tileByUid) {
      const pct = loud.get(uid) ?? 0;
      tile.level.style.width = `${pct}%`;
      tile.root.classList.toggle('speaking', pct > 15);
    }
  });
  c.on('networkQuality', (q) => {
    $('#st-quality').textContent = `up ${QUALITY[q.uplink]} · down ${QUALITY[q.downlink]}`;
  });
  c.on('mutedByHost', (kind, by) => {
    log(`${by} muted your ${kind === 'audio' ? 'microphone' : 'camera'}`);
    refreshControls();
  });
  c.on('roleChanged', (role, byHost) => {
    if (role === 'audience') stopLocalMedia();
    log(byHost ? `a host made you ${roleLabel(role)}` : role === 'audience' ? 'left the stage' : 'went on stage');
    refreshControls();
  });
  c.on('tokenWillExpire', () => log('token expires soon: renew it with client.renewToken()'));
  c.on('exception', (error) => log(`warning: ${error.message}`));
}

async function join(event: SubmitEvent) {
  event.preventDefault();
  joinError.hidden = true;
  joinBtn.disabled = true;

  const channel = roomInput.value.trim();
  const displayName = nameInput.value.trim();
  const role = roleSelect.value as Role;
  const url = new URL(location.href);
  url.searchParams.set('room', channel);
  history.replaceState(null, '', url);

  const c = createClient({
    appId: appIdInput.value.trim(),
    allocatorUrl: allocatorInput.value.trim(),
    forceRelay: forceRelay.checked,
  });
  client = c;
  wire(c);

  try {
    await c.join({ channel, uid: param('uid') || uidFromName(displayName), token: tokenInput.value.trim() || null, role, displayName });
  } catch (error) {
    showError(joinError, error);
    joinBtn.disabled = false;
    client = null;
    return;
  }

  $('#join-panel').hidden = true;
  $('#room-panel').hidden = false;
  $('#room-title').textContent = channel;
  ensureTile(c.uid, displayName, c.role, true);
  for (const user of c.remoteUsers) ensureTile(user.uid, user.displayName, user.role);
  refreshControls();
  log(`joined ${channel} as ${roleLabel(c.role)} on ${c.nodeId}, ${c.remoteUsers.length} other(s) here`);
  statsTimer = setInterval(() => void refreshStats().catch(() => {}), 2000);

  if (c.role !== 'audience') await toggleMic();
}

async function leave() {
  if (statsTimer) clearInterval(statsTimer);
  stopLocalMedia();
  await client?.leave();
  client = null;
  location.reload();
}

form.addEventListener('submit', (e) => void join(e));
micBtn.addEventListener('click', () => void toggleMic());
camBtn.addEventListener('click', () => void toggleCamera());
stageBtn.addEventListener('click', () => void toggleStage());
endBtn.addEventListener('click', () => void client?.endChannel().catch((e) => showError(roomError, e)));
$('#leave-btn').addEventListener('click', () => void leave());
$('#copy-btn').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomInput.value.trim())}&appId=${appIdInput.value.trim()}`;
  try {
    await navigator.clipboard.writeText(link);
    log('room link copied');
  } catch {
    prompt('Copy this link', link);
  }
});
// Browsers may block audio until the user interacts; retry playback on any click.
document.addEventListener('click', () => {
  for (const audio of audioByConsumer.values()) if (audio.paused) void audio.play().catch(() => {});
});
