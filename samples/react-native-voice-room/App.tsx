/**
 * React Native voice room sample (react-native-webrtc needs a development build, not Expo Go).
 *
 * index.js, before anything else:
 *   import { registerGlobals } from 'react-native-webrtc';
 *   registerGlobals();
 *
 * Android: add RECORD_AUDIO and INTERNET permissions. iOS: add NSMicrophoneUsageDescription.
 * TOKEN_URL is your backend's token endpoint (see samples/token-server).
 */
import { useEffect, useRef, useState } from 'react';
import { Button, FlatList, PermissionsAndroid, Platform, SafeAreaView, Text, TextInput, View } from 'react-native';
import { createClient, createMicrophoneTrack, type LocalTrack, type RemoteUser, type Role, type RtcClient } from '../../sdk-react-native/src/index';

const TOKEN_URL = 'https://your-backend.example.com/api/token';

async function getToken(channel: string, uid: string, role: Role) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, uid, role }),
  });
  if (!res.ok) throw new Error('Could not get a token');
  return (await res.json()) as { token: string; appId: string; allocatorUrl: string };
}

async function micPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export default function App() {
  const [channel, setChannel] = useState('lounge');
  const [name, setName] = useState('Guest');
  const [state, setState] = useState('disconnected');
  const [users, setUsers] = useState<RemoteUser[]>([]);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const client = useRef<RtcClient | null>(null);
  const mic = useRef<LocalTrack | null>(null);

  useEffect(() => () => void client.current?.leave(), []);

  async function join(role: Role) {
    if (role !== 'audience' && !(await micPermission())) return;
    const uid = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 5)}`;
    // The token's role is a ceiling: listeners get "speaker" so a host can invite them up.
    const maxRole: Role = role === 'host' ? 'host' : 'speaker';
    const { token, appId, allocatorUrl } = await getToken(channel, uid, maxRole);

    const c = createClient({ appId, allocatorUrl });
    client.current = c;
    const refresh = () => setUsers([...c.remoteUsers]);
    c.on('userJoined', refresh);
    c.on('userLeft', refresh);
    c.on('userUpdated', refresh);
    c.on('activeSpeaker', setSpeaking);
    c.on('connectionStateChanged', (s) => setState(s));
    c.on('tokenWillExpire', async () => c.renewToken((await getToken(channel, uid, maxRole)).token));
    // Remote audio plays by itself through react-native-webrtc once subscribed.

    await c.join({ channel, uid, token, role, displayName: name });
    if (c.role !== 'audience') mic.current = await c.publish(await createMicrophoneTrack());
    refresh();
  }

  async function leave() {
    mic.current?.track.stop();
    mic.current = null;
    await client.current?.leave();
    client.current = null;
    setUsers([]);
  }

  if (state === 'disconnected') {
    return (
      <SafeAreaView style={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Voice room</Text>
        <TextInput value={channel} onChangeText={setChannel} placeholder="Room" style={{ borderWidth: 1, padding: 8 }} />
        <TextInput value={name} onChangeText={setName} placeholder="Your name" style={{ borderWidth: 1, padding: 8 }} />
        <Button title="Join as speaker" onPress={() => void join('speaker')} />
        <Button title="Join to listen" onPress={() => void join('audience')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ padding: 24, gap: 12, flex: 1 }}>
      <Text>
        {channel} · {state}
      </Text>
      <FlatList
        data={users}
        keyExtractor={(u) => u.uid}
        renderItem={({ item }) => (
          <Text style={{ paddingVertical: 6, fontWeight: item.uid === speaking ? '700' : '400' }}>
            {item.displayName} · {item.role}
          </Text>
        )}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {mic.current && (
          <Button
            title={muted ? 'Unmute' : 'Mute'}
            onPress={async () => {
              await mic.current?.setMuted(!muted);
              setMuted(!muted);
            }}
          />
        )}
        <Button title="Leave" onPress={() => void leave()} />
      </View>
    </SafeAreaView>
  );
}
