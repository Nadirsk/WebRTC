import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { mediaDevices } from 'react-native-webrtc';
import type { PeerInfo, Role } from '../protocol';
import { RtcClient, type ConnectionState, type ConnectionStats, type LocalTrack } from '../web-client/src/rtc-client';

// Android emulator reaches the host machine at 10.0.2.2. On a phone, enter the server's LAN or public address.
const DEFAULT_SERVER = Platform.OS === 'android' ? 'ws://10.0.2.2:3000/ws' : 'ws://localhost:3000/ws';

type Participant = PeerInfo & { mic: 'on' | 'muted' | 'off'; level: number };

export default function App() {
  const dark = useColorScheme() === 'dark';
  const c = dark ? palette.dark : palette.light;

  const [server, setServer] = useState(DEFAULT_SERVER);
  const [roomId, setRoomId] = useState('test');
  const [name, setName] = useState(`Phone ${Math.floor(Math.random() * 900 + 100)}`);
  const [role, setRole] = useState<Role>('speaker');
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ConnectionState>('new');
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [stats, setStats] = useState<ConnectionStats | null>(null);
  const [micPaused, setMicPaused] = useState(false);

  const clientRef = useRef<RtcClient | null>(null);
  const micRef = useRef<LocalTrack | null>(null);

  const patch = useCallback((peerId: string, update: Partial<Participant>) => {
    setParticipants((prev) => {
      const current = prev.get(peerId);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(peerId, { ...current, ...update });
      return next;
    });
  }, []);

  const startMic = useCallback(async (client: RtcClient) => {
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    const track = stream.getAudioTracks()[0];
    micRef.current = await client.publish(track as unknown as MediaStreamTrack, { source: 'mic' });
    setMicPaused(false);
    patch(client.peerId, { mic: 'on' });
  }, [patch]);

  const stopMic = useCallback(() => {
    micRef.current?.track.stop();
    micRef.current = null;
  }, []);

  const join = useCallback(async () => {
    setBusy(true);
    setError(null);
    const client = new RtcClient({ serverUrl: server.trim(), handlerName: 'ReactNative106' });
    clientRef.current = client;

    client.on('connectionStateChanged', setState);
    client.on('peerJoined', (p) => setParticipants((prev) => new Map(prev).set(p.peerId, { ...p, mic: 'off', level: 0 })));
    client.on('peerLeft', ({ peerId }) =>
      setParticipants((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      }),
    );
    client.on('peerRoleChanged', (p) => patch(p.peerId, { role: p.role }));
    // react-native-webrtc plays remote audio tracks automatically once they arrive.
    client.on('trackAdded', (t) => t.kind === 'audio' && patch(t.peerId, { mic: t.paused ? 'muted' : 'on' }));
    client.on('trackRemoved', (t) => t.kind === 'audio' && patch(t.peerId, { mic: 'off' }));
    client.on('trackPaused', (t) => t.kind === 'audio' && patch(t.peerId, { mic: 'muted' }));
    client.on('trackResumed', (t) => t.kind === 'audio' && patch(t.peerId, { mic: 'on' }));
    client.on('audioLevels', (levels) => {
      const loud = new Map(levels.map((l) => [l.peerId, l.volume]));
      setParticipants((prev) => {
        const next = new Map(prev);
        for (const [id, p] of next) {
          const v = loud.get(id);
          next.set(id, { ...p, level: v === undefined ? 0 : Math.max(0, Math.min(1, (v + 70) / 50)) });
        }
        return next;
      });
    });
    client.on('disconnected', (reason) => setError(`Disconnected from the media server (${reason}).`));

    try {
      await client.join({ roomId: roomId.trim(), displayName: name.trim(), role });
      const initial = new Map<string, Participant>();
      initial.set(client.peerId, { peerId: client.peerId, displayName: `${name.trim()} (you)`, role, mic: 'off', level: 0 });
      for (const p of client.peers.values()) initial.set(p.peerId, { ...p, mic: 'off', level: 0 });
      setParticipants(initial);
      setJoined(true);
      if (role !== 'audience') await startMic(client);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      clientRef.current = null;
    } finally {
      setBusy(false);
    }
  }, [server, roomId, name, role, patch, startMic]);

  const toggleMic = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      if (!micRef.current) await startMic(client);
      else if (micRef.current.paused) {
        await micRef.current.resume();
        setMicPaused(false);
        patch(client.peerId, { mic: 'on' });
      } else {
        await micRef.current.pause();
        setMicPaused(true);
        patch(client.peerId, { mic: 'muted' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [patch, startMic]);

  const toggleStage = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const next: Role = client.role === 'audience' ? 'speaker' : 'audience';
    try {
      await client.setRole(next);
      setRole(next);
      patch(client.peerId, { role: next });
      if (next === 'audience') {
        stopMic();
        patch(client.peerId, { mic: 'off' });
      } else {
        await startMic(client);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [patch, startMic, stopMic]);

  const leave = useCallback(async () => {
    stopMic();
    await clientRef.current?.leave();
    clientRef.current = null;
    setJoined(false);
    setParticipants(new Map());
    setStats(null);
    setState('new');
  }, [stopMic]);

  useEffect(() => {
    if (!joined) return;
    const timer = setInterval(async () => {
      const client = clientRef.current;
      if (client) setStats(await client.getStats().catch(() => null));
    }, 2000);
    return () => clearInterval(timer);
  }, [joined]);

  useEffect(() => () => void clientRef.current?.leave(), []);

  const publisher = role !== 'audience';

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: c.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.eyebrow, { color: c.muted }]}>PHASE 0 · PROOF OF CONCEPT</Text>
        <Text style={[styles.title, { color: c.ink }]}>{joined ? `Room ${roomId}` : 'Voice room test'}</Text>

        {!joined ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Field label="Media server" value={server} onChangeText={setServer} c={c} />
            <Field label="Room ID" value={roomId} onChangeText={setRoomId} c={c} />
            <Field label="Your name" value={name} onChangeText={setName} c={c} />
            <Text style={[styles.label, { color: c.muted }]}>Role</Text>
            <View style={styles.row}>
              <Chip label="Speaker" active={role === 'speaker'} onPress={() => setRole('speaker')} c={c} />
              <Chip label="Listener" active={role === 'audience'} onPress={() => setRole('audience')} c={c} />
            </View>
            <Button label={busy ? 'Joining…' : 'Join room'} onPress={join} disabled={busy} primary c={c} />
          </View>
        ) : (
          <>
            <View style={styles.row}>
              <Text style={[styles.pill, { color: stateColor(state, c), borderColor: stateColor(state, c) }]}>● {state}</Text>
              <Text style={[styles.pill, { color: c.muted, borderColor: c.line }]}>{role === 'audience' ? 'listener' : role}</Text>
            </View>
            <View style={styles.row}>
              <Button
                label={!micRef.current ? 'Turn mic on' : micPaused ? 'Unmute' : 'Mute'}
                onPress={toggleMic}
                disabled={!publisher}
                c={c}
              />
              <Button label={publisher ? 'Leave stage' : 'Go on stage'} onPress={toggleStage} c={c} />
              <Button label="Leave" onPress={leave} danger c={c} />
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Text style={[styles.cardTitle, { color: c.ink }]}>People ({participants.size})</Text>
              {[...participants.values()].map((p) => (
                <View key={p.peerId} style={[styles.person, { borderColor: c.line }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.personName, { color: c.ink }]}>{p.displayName}</Text>
                    <Text style={[styles.small, { color: c.muted }]}>
                      {p.role === 'audience' ? 'listener' : p.role} · {p.mic === 'on' ? 'mic on' : p.mic === 'muted' ? 'muted' : 'mic off'}
                    </Text>
                  </View>
                  <View style={[styles.levelTrack, { backgroundColor: c.line }]}>
                    <View style={[styles.levelFill, { width: `${Math.round(p.level * 100)}%`, backgroundColor: c.media }]} />
                  </View>
                </View>
              ))}
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Text style={[styles.cardTitle, { color: c.ink }]}>Connection</Text>
              <Stat label="Round trip to server" value={stats?.rttMs == null ? '–' : `${stats.rttMs} ms`} c={c} />
              <Stat label="Route" value={stats ? routeLabel[stats.path] : '–'} c={c} />
              <Stat label="Receiving" value={stats ? `${stats.inbound.bitrateKbps} kbps` : '–'} c={c} />
              <Stat label="Packet loss (receiving)" value={stats ? `${stats.inbound.lossPercent}%` : '–'} c={c} />
              <Stat label="Jitter" value={stats ? `${stats.inbound.jitterMs} ms` : '–'} c={c} />
              <Stat label="Sending" value={stats ? `${stats.outbound.bitrateKbps} kbps` : '–'} c={c} />
              <Stat label="Packet loss (sending)" value={stats ? `${stats.outbound.lossPercent}%` : '–'} c={c} />
            </View>
          </>
        )}

        {error && <Text style={[styles.error, { color: c.bad }]}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const routeLabel: Record<ConnectionStats['path'], string> = {
  udp: 'UDP (direct)',
  tcp: 'TCP (direct)',
  relay: 'TURN relay',
  unknown: '–',
};

type Colors = typeof palette.light;

function stateColor(state: ConnectionState, c: Colors) {
  if (state === 'connected') return c.good;
  if (state === 'failed' || state === 'closed') return c.bad;
  return c.warn;
}

function Field(props: { label: string; value: string; onChangeText: (v: string) => void; c: Colors }) {
  const { c } = props;
  return (
    <View style={{ gap: 4 }}>
      <Text style={[styles.label, { color: c.muted }]}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: c.ink, borderColor: c.lineStrong, backgroundColor: c.bg }]}
        placeholderTextColor={c.muted}
      />
    </View>
  );
}

function Chip(props: { label: string; active: boolean; onPress: () => void; c: Colors }) {
  const { c } = props;
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.chip, { borderColor: props.active ? c.accent : c.lineStrong, backgroundColor: props.active ? c.accent : 'transparent' }]}
    >
      <Text style={{ color: props.active ? c.accentInk : c.ink, fontWeight: '600' }}>{props.label}</Text>
    </Pressable>
  );
}

function Button(props: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; c: Colors }) {
  const { c } = props;
  const bg = props.primary ? c.accent : c.surface;
  const fg = props.primary ? c.accentInk : props.danger ? c.bad : c.ink;
  const border = props.primary ? c.accent : props.danger ? c.bad : c.lineStrong;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, borderColor: border, opacity: props.disabled ? 0.45 : pressed ? 0.8 : 1 }]}
    >
      <Text style={{ color: fg, fontWeight: '600' }}>{props.label}</Text>
    </Pressable>
  );
}

function Stat(props: { label: string; value: string; c: Colors }) {
  return (
    <View style={[styles.stat, { borderColor: props.c.line }]}>
      <Text style={{ color: props.c.ink }}>{props.label}</Text>
      <Text style={[styles.mono, { color: props.c.ink }]}>{props.value}</Text>
    </View>
  );
}

const palette = {
  light: {
    bg: '#EEF1F4', surface: '#FFFFFF', ink: '#15212C', muted: '#55677A', line: '#CAD4DE', lineStrong: '#97A8B9',
    accent: '#2A57AE', accentInk: '#FFFFFF', media: '#B5540C', good: '#1E7A46', warn: '#A86A00', bad: '#B53232',
  },
  dark: {
    bg: '#0E151B', surface: '#151F28', ink: '#E3E9EF', muted: '#95A6B6', line: '#2B3A48', lineStrong: '#4C6074',
    accent: '#88AAF2', accentInk: '#0E151B', media: '#F0994D', good: '#5CCB8A', warn: '#E6B450', bad: '#F07A7A',
  },
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingTop: 56, gap: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 1, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  button: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  personName: { fontWeight: '600', fontSize: 15 },
  small: { fontSize: 12.5 },
  levelTrack: { width: 70, height: 5, borderRadius: 3, overflow: 'hidden' },
  levelFill: { height: '100%' },
  stat: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontVariant: ['tabular-nums'] },
  error: { fontSize: 14 },
});
