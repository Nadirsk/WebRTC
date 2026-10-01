import Link from 'next/link';
import { codeToHtml } from 'shiki';
import { CodeBlock } from '@/components/CodeBlock';
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline';
import { CountUp } from '@/components/motion/CountUp';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { HeroCanvas } from '@/components/visuals/HeroCanvas';
import { LiveRoomHero } from '@/components/visuals/LiveRoomHero';
import { Marquee } from '@/components/visuals/Marquee';
import { Globe } from '@/components/network/Globe';
import { ProductShowcase } from '@/components/visuals/ProductShowcase';
import { StepsTimeline } from '@/components/visuals/StepsTimeline';
import { UseCaseIcon } from '@/components/visuals/UseCaseIcon';
import { solutions } from '@/content/solutions';
import { pricing, site } from '@/site.config';

const heroCode = `const client = createClient({ appId, allocatorUrl });

await client.join({
  channel: 'cricket-talk',
  uid: user.id,
  token,
  role: 'host',
});

await client.publish(await createMicrophoneTrack());

client.on('activeSpeaker', showWhoIsSpeaking);`;

const installCode = `npm install ${site.sdkPackage}`;

const tokenCode = `// On your server: allow this user into this channel
const token = buildToken({ appId, appCertificate, channel: 'cricket-talk', uid: user.id, role: 'speaker' });`;

const joinCode = `const client = createClient({ appId, allocatorUrl: '${site.apiUrl}' });
await client.join({ channel: 'cricket-talk', uid: user.id, token, role: 'speaker' });`;

const marqueeA = ['Voice rooms', 'Dating calls', 'Online classes', 'Doctor consultations', 'Support calls', 'Team voice chat', 'Live shopping', 'Town halls'];
const marqueeB = ['Opus audio', 'Error correction', 'Silence suppression', 'Speaking indicators', 'Host and listener roles', 'TURN fallback on 443', 'Automatic reconnect', 'Per-minute billing'];

export default async function Home() {
  const freeMinutes = pricing.freeMinutesPerMonth;
  const heroHtml = await codeToHtml(heroCode, { lang: 'ts', theme: 'github-light' });

  return (
    <>
      <section className="hero">
        <div className="glow glow-a" aria-hidden="true" />
        <div className="glow glow-b" aria-hidden="true" />
        <HeroCanvas />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <Reveal y={12}>
              <span className="hero-badge">
                <b>Beta</b> Real-time infrastructure for South Asia and the Gulf
              </span>
            </Reveal>
            <AnimatedHeadline text="Voice and video calling for your app" delay={0.1} />
            <Reveal delay={0.45}>
              <p className="lede">
                Add calls, voice rooms and live audio to any app with a few lines of code. We run the servers, keep
                calls clear on mobile data, and bill only for the minutes people use.
              </p>
            </Reveal>
            <Reveal delay={0.6}>
              <div className="actions">
                <Link href="/signup" className="btn btn-primary">
                  Get started free
                </Link>
                <Link href="/demo" className="btn btn-secondary">
                  Try the live demo
                </Link>
              </div>
            </Reveal>
            <Reveal delay={0.75}>
              <p className="hero-note">
                {freeMinutes.toLocaleString('en-US')} free minutes every month. No card needed for the beta.
              </p>
            </Reveal>
          </div>
          <LiveRoomHero codeHtml={heroHtml} />
        </div>
      </section>

      <div className="strip">
        <Marquee items={marqueeA} />
        <Marquee items={marqueeB} reverse />
      </div>

      <section className="section band">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>One SDK for every real-time conversation</h2>
            <p className="lede">Start with voice, add video or a live audience later. Same rooms, same code, one bill.</p>
          </Reveal>
          <ProductShowcase />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>Built for the networks your users are on</h2>
            <p className="lede">Numbers the platform is designed and tested against during the beta.</p>
          </Reveal>
          <RevealGroup className="stats">
            <RevealItem className="stat">
              <span className="stat-value">
                <CountUp to={freeMinutes} />
              </span>
              <p>free minutes every month</p>
            </RevealItem>
            <RevealItem className="stat">
              <span className="stat-value">
                &lt;<CountUp to={2} />
                <small>s</small>
              </span>
              <p>to join a room</p>
              <span className="small">target</span>
            </RevealItem>
            <RevealItem className="stat">
              <span className="stat-value">
                <CountUp to={20} />
                <small>%</small>
              </span>
              <p>packet loss and audio still clear</p>
              <span className="small">target</span>
            </RevealItem>
            <RevealItem className="stat">
              <span className="stat-value">
                <CountUp to={5} />
              </span>
              <p>launch regions, starting with Dubai</p>
            </RevealItem>
          </RevealGroup>
        </div>
      </section>

      <section className="section section-dark">
        <div className="wrap">
          <div className="split" style={{ alignItems: 'center' }}>
            <Reveal className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
              <h2>Our own network, not the public internet&rsquo;s best guess</h2>
              <p className="lede">
                Internet providers route traffic along the cheapest path, not the fastest. Your users connect to our
                nearest server, and their audio travels between our servers on routes we choose and watch every few
                seconds.
              </p>
              <div className="actions">
                <Link href="/network" className="btn btn-secondary">
                  How the network works
                </Link>
              </div>
            </Reveal>
            <Reveal delay={0.15} className="net-hero-globe">
              <Globe />
            </Reveal>
          </div>
          <RevealGroup className="net-facts">
            <RevealItem className="net-fact">
              <span className="net-fact-value">
                <CountUp to={150} />
                <small>ms</small>
              </span>
              <p>target delay between people in the same region</p>
            </RevealItem>
            <RevealItem className="net-fact">
              <span className="net-fact-value">
                <CountUp to={3} />
                <small>s</small>
              </span>
              <p>target time to move a room when a server fails</p>
            </RevealItem>
            <RevealItem className="net-fact">
              <span className="net-fact-value">
                <CountUp to={443} />
              </span>
              <p>the port our relay falls back to, so calls get through strict office and mobile networks</p>
            </RevealItem>
          </RevealGroup>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <Reveal className="stack" style={{ '--gap': '16px', position: 'sticky', top: 110 } as React.CSSProperties}>
            <h2>From sign-up to first call</h2>
            <p className="lede">Most teams have a working voice room the same afternoon.</p>
            <div className="actions">
              <Link href="/docs/quickstart-web" className="btn btn-secondary">
                Read the quick start
              </Link>
            </div>
          </Reveal>
          <StepsTimeline>
            <li className="step">
              <Reveal className="step-body">
                <h3>Create a project</h3>
                <p className="muted">
                  Sign up and create a project in the console. You get an App ID for your app and an App Certificate
                  that stays on your server.
                </p>
              </Reveal>
            </li>
            <li className="step">
              <Reveal className="step-body">
                <h3>Add the SDK and issue tokens</h3>
                <p className="muted">Install the SDK in your app. Your server signs a short-lived token for each user.</p>
                <CodeBlock code={installCode} lang="bash" />
                <CodeBlock code={tokenCode} label="Your server" />
              </Reveal>
            </li>
            <li className="step">
              <Reveal className="step-body">
                <h3>Join a room</h3>
                <p className="muted">Everyone who joins the same room ID can hear each other.</p>
                <CodeBlock code={joinCode} label="Your app" />
              </Reveal>
            </li>
          </StepsTimeline>
        </div>
      </section>

      <section className="section band">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>Made for these apps</h2>
            <p className="lede">The same rooms power very different products.</p>
          </Reveal>
          <RevealGroup className="case-grid">
            {solutions.slice(0, 6).map((s) => (
              <RevealItem key={s.id}>
                <Link href={`/solutions#${s.id}`} className="case-card">
                  <UseCaseIcon id={s.id} />
                  <h3>{s.name}</h3>
                  <p>{s.body}</p>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      <section className="section">
        <div className="wrap split" style={{ alignItems: 'center' }}>
          <Reveal className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
            <h2>Simple per-minute pricing</h2>
            <p className="lede">
              A participant-minute is one person in a room for one minute. Five people talking for ten minutes is 50
              minutes.
            </p>
            <div className="actions">
              <Link href="/pricing" className="btn btn-secondary">
                See pricing and calculator
              </Link>
            </div>
          </Reveal>
          <Reveal className="table-frame" delay={0.1}>
            <table>
              <thead>
                <tr>
                  <th>Minutes of</th>
                  <th className="num">Per 1,000 minutes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>First {freeMinutes.toLocaleString('en-US')} each month</td>
                  <td className="num">Free</td>
                </tr>
                {pricing.rates.slice(0, 3).map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td className="num">
                      <CountUp to={r.per1000} decimals={2} prefix="$" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal>
            <div className="cta-band animated">
              <svg className="cta-wave" viewBox="0 0 360 120" aria-hidden="true">
                {Array.from({ length: 30 }, (_, i) => {
                  const h = 20 + Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.3)) * 90;
                  return <rect key={i} x={i * 12} y={(120 - h) / 2} width="6" height={h} rx="3" fill="#F0994D" />;
                })}
              </svg>
              <div>
                <h2>Join the beta</h2>
                <p>We&rsquo;re opening the platform to a small group of teams first. Tell us what you&rsquo;re building.</p>
              </div>
              <div className="actions">
                <Link href="/signup" className="btn btn-primary">
                  Request beta access
                </Link>
                <Link href="/contact" className="btn btn-secondary">
                  Talk to sales
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
