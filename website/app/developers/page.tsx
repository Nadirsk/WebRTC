import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/Reveal';
import { PageHero } from '@/components/PageHero';
import Link from 'next/link';
import { CodeBlock } from '@/components/CodeBlock';
import { site } from '@/site.config';

export const metadata: Metadata = {
  title: 'Developers',
  description: 'SDKs for Web and React Native, server libraries for tokens, and documentation.',
};

type Sdk = { name: string; status: 'Preview' | 'Planned'; note: string; href?: string };

const clientSdks: Sdk[] = [
  { name: 'Web (JavaScript / TypeScript)', status: 'Preview', note: 'Chrome, Edge, Firefox, Safari', href: '/docs/quickstart-web' },
  { name: 'React Native', status: 'Preview', note: 'Android and iOS through react-native-webrtc', href: '/docs/quickstart-react-native' },
  { name: 'Flutter', status: 'Planned', note: 'Android and iOS' },
  { name: 'Android (Kotlin)', status: 'Planned', note: 'Native SDK' },
  { name: 'iOS (Swift)', status: 'Planned', note: 'Native SDK' },
];

const serverSdks: Sdk[] = [
  { name: 'PHP', status: 'Planned', note: 'Token builder and REST client, Laravel friendly' },
  { name: 'Node.js', status: 'Planned', note: 'Token builder and REST client' },
  { name: 'Python', status: 'Planned', note: 'Token builder and REST client' },
];

function SdkTable({ rows }: { rows: Sdk[] }) {
  return (
    <div className="table-frame">
      <table>
        <thead>
          <tr>
            <th>SDK</th>
            <th>Runs on</th>
            <th className="num">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.href ? <Link href={r.href}>{r.name}</Link> : r.name}</td>
              <td className="muted">{r.note}</td>
              <td className="num">
                <span className={`status ${r.status === 'Preview' ? 'status-preview' : 'status-soon'}`}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const events = `client.on('userJoined', (user) => addToList(user));
client.on('userLeft', (user) => removeFromList(user.uid));
client.on('trackSubscribed', (user, track) => play(track));
client.on('activeSpeaker', (uid) => highlight(uid));
client.on('connectionStateChanged', (state) => showBanner(state));
client.on('tokenWillExpire', async () => client.renewToken(await fetchToken()));`;

export default function DevelopersPage() {
  return (
    <>
      <PageHero
        title="Developers"
        lede="A small API: join a room, publish a track, listen for events. The SDKs handle connecting to the nearest server, reconnecting and reporting call quality."
      >
        <div className="actions">
          <Link href="/docs" className="btn btn-primary">
            Read the docs
          </Link>
          <Link href="/demo" className="btn btn-secondary">
            Open the live demo
          </Link>
        </div>
      </PageHero>

      <section className="section band">
        <div className="wrap split">
          <div className="stack" style={{ '--gap': '14px' } as React.CSSProperties}>
            <h2>Everything happens through events</h2>
            <p className="lede">
              Your UI reacts to what happens in the room. No polling, no audio processing on your side.
            </p>
            <p className="muted">
              Full list in the <Link href="/docs/client-api">client API reference</Link>.
            </p>
          </div>
          <Reveal delay={0.1}>
            <CodeBlock code={events} label="Room events" />
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="wrap stack" style={{ '--gap': '40px' } as React.CSSProperties}>
          <Reveal className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
            <h2>Client SDKs</h2>
            <SdkTable rows={clientSdks} />
          </Reveal>
          <div className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
            <h2>Server libraries</h2>
            <p className="muted" style={{ maxWidth: '70ch' }}>
              Your server uses these to sign join tokens with your App Certificate and to manage rooms. They ship
              with the beta console.
            </p>
            <SdkTable rows={serverSdks} />
          </div>
          <p className="small muted">
            Packages publish to npm as <code>{site.sdkPackage}</code> and <code>{site.sdkPackageRn}</code> when the
            beta opens.
          </p>
        </div>
      </section>
    </>
  );
}
