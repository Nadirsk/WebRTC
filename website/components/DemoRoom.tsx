'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createClient,
  createMicrophoneTrack,
  type ConnectionState,
  type ConnectionStats,
  type LocalTrack,
  type RemoteTrack,
  type RemoteUser,
  type Role,
  type RtcClient,
} from '../../sdk-web/src/index';

type Person = { uid: string; displayName: string; role: Role; mic: 'on' | 'muted' | 'off'; level: number; self?: boolean };

const stateLabel: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
};

const routeLabel: Record<ConnectionStats['path'], string> = {
  udp: 'Direct (UDP)',
  tcp: 'Direct (TCP)',
  relay: 'Relay (TURN)',
  unknown: '–',
};

const endedMessage: Record<string, string> = {
  kicked: 'A host removed you from this room.',
  channelEnded: 'The host ended the room.',
  replaced: 'You joined this room from another tab.',
  network: 'Lost the connection to the demo server. Join again to retry.',
};

function randomRoom() {
  return `demo-${Math.random().toString(36).slice(2, 7)}`;
}

function uidFor(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'guest';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

/** Live demo on the public testing-mode project: no token needed, anyone with the link can join. */
export function DemoRoom({ allocatorUrl, appId: configuredAppId }: { allocatorUrl: string; appId?: string }) {
  const [roomId, setRoomId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('speaker');
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [stats, setStats] = useState<ConnectionStats | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [copied, setCopied] = useState(false);

  const client = useRef<RtcClient | null>(null);
  const mic = useRef<LocalTrack | null>(null);
  const audioEls = useRef(new Map<string, HTMLAudioElement>());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRoomId(params.get('room') ?? randomRoom());
    setName(`Guest ${Math.floor(Math.random() * 900 + 100)}`);
  }, []);

  const patch = useCallback((uid: string, update: Partial<Person>) => {
    setPeople((prev) => {
      const current = prev.get(uid);
      if (!current) return prev;
      return new Map(prev).set(uid, { ...current, ...update });
    });
  }, []);

  const upsert = useCallback((user: RemoteUser) => {
    setPeople((prev) => {
      const current = prev.get(user.uid);
      return new Map(prev).set(user.uid, {
        uid: user.uid,
        displayName: user.displayName,
        role: user.role,
        mic: current?.mic ?? 'off',
        level: current?.level ?? 0,
      });
    });
  }, []);

  const startMic = useCallback(
    async (c: RtcClient) => {
      mic.current = await c.publish(await createMicrophoneTrack());
      setMicMuted(false);
      patch(c.uid, { mic: 'on' });
    },
    [patch],
  );

  const stopMic = useCallback(() => {
    mic.current?.track.stop();
    mic.current = null;
  }, []);

  const onTrackSubscribed = useCallback(
    (user: RemoteUser, remote: RemoteTrack) => {
      if (remote.kind !== 'audio') return;
      const audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = new MediaStream([remote.track]);
      void audio.play().catch(() => {});
      audioEls.current.set(remote.consumerId, audio);
      patch(user.uid, { mic: remote.muted ? 'muted' : 'on' });
    },
    [patch],
  );

  const onTrackUnsubscribed = useCallback(
    (user: RemoteUser, remote: RemoteTrack) => {
      if (remote.kind !== 'audio') return;
      const audio = audioEls.current.get(remote.consumerId);
      if (audio) audio.srcObject = null;
      audioEls.current.delete(remote.consumerId);
      patch(user.uid, { mic: 'off' });
    },
    [patch],
  );

  const resetRoom = useCallback(() => {
    stopMic();
    client.current = null;
    for (const audio of audioEls.current.values()) audio.srcObject = null;
    audioEls.current.clear();
    setJoined(false);
    setPeople(new Map());
    setStats(null);
  }, [stopMic]);

  const join = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);

      try {
        let appId = configuredAppId;
        if (!appId) {
          const res = await fetch(`${allocatorUrl.replace(/\/$/, '')}/v1/demo`).catch(() => null);
          if (!res?.ok) throw new Error('unreachable');
          appId = ((await res.json()) as { appId: string }).appId;
        }

        const c = createClient({ appId, allocatorUrl });
        client.current = c;
        c.on('connectionStateChanged', (next, _prev, reason) => {
          setState(next);
          if (next === 'disconnected' && reason && reason !== 'leave') {
            setError(endedMessage[reason] ?? 'Disconnected from the demo server.');
            resetRoom();
          }
        });
        c.on('userJoined', upsert);
        c.on('userUpdated', upsert);
        c.on('userLeft', (user) =>
          setPeople((prev) => {
            const next = new Map(prev);
            next.delete(user.uid);
            return next;
          }),
        );
        c.on('trackSubscribed', onTrackSubscribed);
        c.on('trackUnsubscribed', onTrackUnsubscribed);
        c.on('userMuted', (user, kind, muted) => kind === 'audio' && patch(user.uid, { mic: muted ? 'muted' : 'on' }));
        c.on('volumeIndicator', (levels) => {
          const loud = new Map(levels.map((l) => [l.uid, l.level / 100]));
          setPeople((prev) => {
            const next = new Map(prev);
            for (const [id, p] of next) next.set(id, { ...p, level: loud.get(id) ?? 0 });
            return next;
          });
        });

        await c.join({ channel: roomId.trim(), uid: uidFor(name), role, displayName: name.trim() });
        const initial = new Map<string, Person>();
        initial.set(c.uid, { uid: c.uid, displayName: name.trim(), role, mic: 'off', level: 0, self: true });
        for (const u of c.remoteUsers) initial.set(u.uid, { uid: u.uid, displayName: u.displayName, role: u.role, mic: 'off', level: 0 });
        setPeople(initial);
        setJoined(true);
        const url = new URL(window.location.href);
        url.searchParams.set('room', roomId.trim());
        window.history.replaceState(null, '', url);
        if (role !== 'audience') await startMic(c);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const offline = message === 'unreachable' || message.startsWith('Could not reach');
        setError(offline ? "Can't reach the demo network right now. It may be offline; try again later." : message);
        client.current = null;
      } finally {
        setBusy(false);
      }
    },
    [allocatorUrl, configuredAppId, roomId, name, role, patch, upsert, onTrackSubscribed, onTrackUnsubscribed, startMic, resetRoom],
  );

  const toggleMic = useCallback(async () => {
    const c = client.current;
    if (!c) return;
    try {
      if (!mic.current) {
        await startMic(c);
        return;
      }
      const next = !mic.current.muted;
      await mic.current.setMuted(next);
      setMicMuted(next);
      patch(c.uid, { mic: next ? 'muted' : 'on' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [patch, startMic]);

  const toggleStage = useCallback(async () => {
    const c = client.current;
    if (!c) return;
    const next: Role = c.role === 'audience' ? 'speaker' : 'audience';
    try {
      await c.setRole(next);
      setRole(next);
      patch(c.uid, { role: next });
      if (next === 'audience') {
        stopMic();
        patch(c.uid, { mic: 'off' });
      } else {
        await startMic(c);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [patch, startMic, stopMic]);

  const leave = useCallback(async () => {
    const c = client.current;
    resetRoom();
    await c?.leave();
    setState('disconnected');
  }, [resetRoom]);

  const copyLink = useCallback(async () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Copy this link to invite someone: ${link}`);
    }
  }, [roomId]);

  useEffect(() => {
    if (!joined) return;
    const timer = setInterval(async () => {
      const c = client.current;
      if (c && c.connectionState === 'connected') setStats(await c.getStats().catch(() => null));
    }, 2000);
    return () => clearInterval(timer);
  }, [joined]);

  useEffect(() => () => void client.current?.leave(), []);

  if (!joined) {
    return (
      <form className="panel form" onSubmit={join} style={{ maxWidth: 760 }}>
        <div className="field">
          <label htmlFor="demo-room">Room</label>
          <input id="demo-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} required pattern="[A-Za-z0-9_.\-]{1,64}" />
          <span className="hint">Share the same room with someone to talk to them.</span>
        </div>
        <div className="field">
          <label htmlFor="demo-name">Your name</label>
          <input id="demo-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} />
        </div>
        <fieldset className="field full" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 'var(--step--1)', marginBottom: 6 }}>Join as</legend>
          <div className="actions">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" name="role" checked={role === 'speaker'} onChange={() => setRole('speaker')} style={{ width: 'auto' }} />
              Speaker (talk and listen)
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" name="role" checked={role === 'audience'} onChange={() => setRole('audience')} style={{ width: 'auto' }} />
              Listener
            </label>
          </div>
        </fieldset>
        <div className="full actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !roomId}>
            {busy ? 'Joining…' : 'Join room'}
          </button>
          <span className="small muted">Your browser will ask to use the microphone if you join as a speaker.</span>
        </div>
        {error && <p className="form-error full" role="alert">{error}</p>}
      </form>
    );
  }

  const list = [...people.values()];
  return (
    <div className="demo">
      <div className="panel stack" style={{ '--gap': '20px' } as React.CSSProperties}>
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <div className="actions" style={{ gap: 10 }}>
            <span className="live-dot" aria-hidden="true" />
            <strong>{roomId}</strong>
            <span className="small muted">
              {stateLabel[state]}, {list.length} {list.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="actions">
            <button className="btn btn-secondary" type="button" onClick={copyLink}>
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
          </div>
        </div>
        <div className="demo-people">
          {list.map((p) => (
            <div className="speaker" key={p.uid}>
              <div className="avatar" data-speaking={p.level > 0.15}>
                {initials(p.displayName)}
              </div>
              <div className="speaker-name">
                {p.displayName}
                {p.self ? ' (you)' : ''}
              </div>
              <div className="speaker-role">
                {p.role === 'audience' ? 'Listener' : p.role === 'host' ? 'Host' : 'Speaker'},{' '}
                {p.mic === 'on' ? 'mic on' : p.mic === 'muted' ? 'muted' : 'mic off'}
              </div>
              <div aria-hidden="true" style={{ width: 64, height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round(p.level * 100)}%`, height: '100%', background: 'var(--signal)', transition: 'width .2s' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="btn btn-primary" type="button" onClick={toggleMic} disabled={role === 'audience'}>
            {!mic.current ? 'Turn mic on' : micMuted ? 'Unmute' : 'Mute'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={toggleStage}>
            {role === 'audience' ? 'Go on stage' : 'Leave stage'}
          </button>
          <button className="btn btn-quiet" type="button" onClick={leave}>
            Leave room
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <aside className="panel">
        <h3 style={{ marginBottom: 8 }}>Your connection</h3>
        <ul className="stat-list">
          <li><span>Round trip to server</span><span>{stats?.rttMs == null ? '–' : `${stats.rttMs} ms`}</span></li>
          <li><span>Route</span><span>{stats ? routeLabel[stats.path] : '–'}</span></li>
          <li><span>Receiving</span><span>{stats ? `${stats.inbound.bitrateKbps} kbps` : '–'}</span></li>
          <li><span>Packet loss in</span><span>{stats ? `${stats.inbound.lossPercent}%` : '–'}</span></li>
          <li><span>Jitter</span><span>{stats ? `${stats.inbound.jitterMs} ms` : '–'}</span></li>
          <li><span>Sending</span><span>{stats ? `${stats.outbound.bitrateKbps} kbps` : '–'}</span></li>
        </ul>
        <p className="small muted" style={{ marginTop: 12 }}>
          Measured live from your browser every 2 seconds. If a server fails, the demo moves you to another one by itself.
        </p>
      </aside>
    </div>
  );
}
