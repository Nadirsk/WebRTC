import { site } from '@/site.config';

export type ProductStatus = 'beta' | 'preview' | 'soon';

export const statusLabel: Record<ProductStatus, string> = {
  beta: 'Beta',
  preview: 'Preview',
  soon: 'Coming soon',
};

export type Product = {
  slug: string;
  name: string;
  status: ProductStatus;
  summary: string;
  intro: string;
  features: { title: string; body: string }[];
  code: { label: string; source: string };
  specs: [string, string][];
  goodFor: string[];
};

export const products: Product[] = [
  {
    slug: 'voice-calling',
    name: 'Voice calling',
    status: 'beta',
    summary: '1-to-1 calls, group calls and voice rooms with hosts, speakers and listeners.',
    intro:
      'Put a call button or a full voice room in your app. Speakers talk, listeners listen, and anyone can be invited on stage. We carry the audio over our own servers so it stays clear on mobile data.',
    features: [
      {
        title: 'Clear on weak mobile data',
        body: 'Opus audio with built-in error correction rebuilds lost packets, so a patchy 4G connection still sounds like a conversation.',
      },
      {
        title: 'Rooms with roles',
        body: 'Hosts and speakers publish audio; listeners only receive. Move people on and off stage with one call.',
      },
      {
        title: 'Who is speaking',
        body: 'Speaking levels arrive twice a second, so you can light up the right avatar without processing audio yourself.',
      },
      {
        title: 'Silence costs nothing',
        body: 'When someone stops talking their app stops sending audio, which saves your users’ data and battery.',
      },
    ],
    code: {
      label: 'Join a voice room and start talking',
      source: `import { createClient, createMicrophoneTrack } from '${site.sdkPackage}';

const client = createClient({ appId, allocatorUrl: '${site.apiUrl}' });

await client.join({ channel: 'cricket-talk', uid: user.id, token, role: 'speaker' });

const mic = await client.publish(await createMicrophoneTrack());

// Mute and unmute
await mic.setMuted(true);
await mic.setMuted(false);`,
    },
    specs: [
      ['Audio codec', 'Opus, 48 kHz, with in-band error correction and silence suppression'],
      ['Roles', 'Host, speaker, listener'],
      ['Speakers per room', 'Up to 16 (configurable)'],
      ['Platforms', 'Web and React Native today; Flutter, Android and iOS planned'],
    ],
    goodFor: ['Social voice rooms', 'In-app calling', 'Customer support', 'Gaming voice chat'],
  },
  {
    slug: 'video-calling',
    name: 'Video calling',
    status: 'preview',
    summary: '1-to-1 and group video calls that adapt to each person’s connection.',
    intro:
      'Add face-to-face calls for consultations, classes or dating. Video runs on the same rooms and SDK as voice, so turning on the camera is one more line of code.',
    features: [
      {
        title: 'Same SDK as voice',
        body: 'Publish a camera track the same way you publish a microphone. Participants receive it automatically.',
      },
      {
        title: 'Standard codecs',
        body: 'VP8 and H.264, supported by every modern browser and phone without plugins.',
      },
      {
        title: 'Camera on and off',
        body: 'People can join by voice and switch the camera on later, and everyone else is told straight away.',
      },
      {
        title: 'Pay by resolution',
        body: 'Minutes are billed at the resolution actually received, so a small thumbnail costs less than full screen.',
      },
    ],
    code: {
      label: 'Turn on the camera',
      source: `import { createCameraTrack, playVideo } from '${site.sdkPackage}';

await client.publish(await createCameraTrack({ width: 1280, height: 720 }));

client.on('trackSubscribed', (user, track) => {
  if (track.kind === 'video') playVideo(track, videoFor(user.uid));
});`,
    },
    specs: [
      ['Video codecs', 'VP8, H.264'],
      ['Resolutions', 'SD, HD and Full HD'],
      ['Status', 'Working in preview; adaptive quality for large group calls arrives before general availability'],
      ['Platforms', 'Web and React Native'],
    ],
    goodFor: ['Telehealth', 'Online classes', 'Dating apps', 'Interviews'],
  },
  {
    slug: 'live-streaming',
    name: 'Interactive live streaming',
    status: 'beta',
    summary: 'A few hosts on stage, a large audience listening, and anyone can be invited up.',
    intro:
      'Run live talk shows, AMAs and live commerce sessions where the audience can join the conversation. Listeners connect without publishing anything, which keeps large rooms light for their phones and for your bill.',
    features: [
      {
        title: 'Invite to stage',
        body: 'Switch a listener to speaker and back without them leaving the room or reconnecting.',
      },
      {
        title: 'Built for big audiences',
        body: 'Listeners only receive, so one server carries far more of them. Rooms spread across servers as they grow.',
      },
      {
        title: 'Real-time, not broadcast delay',
        body: 'Everyone hears the host within a fraction of a second, so questions and answers feel live.',
      },
      {
        title: 'Stream out to other platforms',
        body: 'Send the room to YouTube or your CDN at the same time. Arrives with cloud recording.',
      },
    ],
    code: {
      label: 'Bring a listener on stage',
      source: `// A listener joins (their token allows up to 'speaker')
await client.join({ channel: 'live-show', uid: user.id, token, role: 'audience' });

// The host invites them up
await host.setRemoteUserRole(user.id, 'speaker');

// The listener's app hears about it and turns on the mic
client.on('roleChanged', async (role) => {
  if (role === 'speaker') await client.publish(await createMicrophoneTrack());
});`,
    },
    specs: [
      ['Audience role', 'Receive-only listeners'],
      ['Stage changes', 'Instant, no reconnect'],
      ['Streaming out (RTMP/HLS)', 'Planned'],
      ['Platforms', 'Web and React Native'],
    ],
    goodFor: ['Live talk shows', 'Live shopping', 'Town halls', 'Fan events'],
  },
  {
    slug: 'cloud-recording',
    name: 'Cloud recording',
    status: 'soon',
    summary: 'Record calls and rooms on our servers and get a file when they end.',
    intro:
      'Keep a copy of consultations, classes or support calls without recording on the user’s phone. Start and stop from your server, and we notify you when the file is ready.',
    features: [
      {
        title: 'Start and stop from your server',
        body: 'A REST call starts recording a room. Nothing to install in the app.',
      },
      {
        title: 'Your storage or ours',
        body: 'Save recordings to our storage or straight into your own S3-compatible bucket.',
      },
      {
        title: 'Notified when ready',
        body: 'A webhook tells your backend the moment the file is available.',
      },
      {
        title: 'Retention you control',
        body: 'Choose how long recordings are kept, per project.',
      },
    ],
    code: {
      label: 'Planned REST API',
      source: `POST /v1/projects/{appId}/recordings
{
  "channel": "consult-2291",
  "mode": "mixed-audio",
  "storage": { "bucket": "clinic-recordings" }
}

→ webhook: recording.ready  { "channel": "consult-2291", "url": "..." }`,
    },
    specs: [
      ['Formats', 'Mixed audio first, video later'],
      ['Storage', 'Ours, or your S3-compatible bucket'],
      ['Status', 'Planned for the paid launch'],
      ['Billing', 'Per 1,000 recorded minutes'],
    ],
    goodFor: ['Telehealth', 'Online classes', 'Compliance', 'Support quality checks'],
  },
];

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}
