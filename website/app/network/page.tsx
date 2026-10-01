import type { Metadata } from 'next';
import Link from 'next/link';
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline';
import { CountUp } from '@/components/motion/CountUp';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { CallJourney } from '@/components/network/CallJourney';
import { Globe } from '@/components/network/Globe';
import { LossSimulator } from '@/components/network/LossSimulator';
import { Pillars } from '@/components/network/Pillars';
import { RouteCompare } from '@/components/network/RouteCompare';
import { NetworkShowcase } from '@/components/visuals/NetworkShowcase';
import { products } from '@/content/products';
import { pricing, site } from '@/site.config';

export const metadata: Metadata = {
  title: 'Network',
  description: `${site.networkName}: nearest server first, then our own monitored routes between regions, with automatic failover.`,
};

const devPerks = [
  {
    title: 'Integrate in an afternoon',
    body: 'One small SDK for web and React Native. Join a room, publish a track, listen for events.',
    icon: 'M5 7l-3 5 3 5M19 7l3 5-3 5M14 4l-4 16',
  },
  {
    title: `${pricing.freeMinutesPerMonth.toLocaleString('en-US')} free minutes a month`,
    body: 'Build and test without a bill. After that you pay per minute, with no seat licences.',
    icon: 'M12 3v18M16.5 7.5c0-1.9-2-3-4.5-3s-4.5 1.2-4.5 3.2c0 4.6 9 2.4 9 7 0 2-2 3.3-4.5 3.3S7.5 17.8 7.5 16',
  },
  {
    title: 'Open standards, no plugins',
    body: 'Built on WebRTC, the calling standard in every modern browser and phone.',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  },
  {
    title: 'Support from the builders',
    body: 'Beta teams talk directly to the engineers running the network, in your time zone.',
    icon: 'M4 13v-1.5a8 8 0 0 1 16 0V13M4 13h3v6H5.5A1.5 1.5 0 0 1 4 17.5V13Zm16 0h-3v6h1.5a1.5 1.5 0 0 0 1.5-1.5V13Z',
  },
];

const resources = [
  { href: '/docs/concepts', title: 'Rooms, roles and tracks', body: 'How a room works, who can speak, and what a participant-minute is.', hue: '#DDE6FA' },
  { href: '/docs/limits', title: 'Limits and quality', body: 'How audio survives packet loss, jitter and strict networks.', hue: '#FCE6D3' },
  { href: '/docs/signaling', title: 'Signaling protocol', body: 'The messages between SDKs and our servers, for custom platforms.', hue: '#DDF0E5' },
];

export default function NetworkPage() {
  const free = pricing.freeMinutesPerMonth.toLocaleString('en-US');

  return (
    <>
      {/* 1. Hero */}
      <section className="net-hero">
        <div className="wrap net-hero-grid">
          <div className="net-hero-copy">
            <Reveal y={10}>
              <span className="net-badge">{site.networkName}</span>
            </Reveal>
            <AnimatedHeadline text="The network under every call" />
            <Reveal delay={0.4}>
              <p className="lede">
                A software-defined network of our own servers, built for live voice and video. Users join the nearest
                one, and from there every packet travels on routes we choose, measure and repair in real time.
              </p>
            </Reveal>
            <Reveal delay={0.55}>
              <div className="actions">
                <Link href="/signup" className="btn btn-primary">
                  Start with {free} free minutes
                </Link>
                <a href="#journey" className="btn btn-secondary">
                  See how a call travels
                </a>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.2} className="net-hero-globe">
            <Globe />
          </Reveal>
        </div>
        <div className="wrap">
          <RevealGroup className="net-strip">
            <RevealItem className="net-strip-item">
              <strong><CountUp to={5} /></strong>
              <span>launch regions, Dubai first</span>
            </RevealItem>
            <RevealItem className="net-strip-item">
              <strong>&lt;<CountUp to={150} /><small>ms</small></strong>
              <span>delay within a region (target)</span>
            </RevealItem>
            <RevealItem className="net-strip-item">
              <strong>&lt;<CountUp to={3} /><small>s</small></strong>
              <span>to recover from a server failure (target)</span>
            </RevealItem>
            <RevealItem className="net-strip-item">
              <strong><CountUp to={99.9} decimals={1} /><small>%</small></strong>
              <span>availability at paid launch (target)</span>
            </RevealItem>
          </RevealGroup>
        </div>
      </section>

      {/* 2. Four pillars */}
      <section className="section">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>Four things the network is built to do</h2>
            <p className="lede">Reach your users, keep delay low, grow with your rooms, and keep calls alive when something breaks.</p>
          </Reveal>
          <Pillars />
        </div>
      </section>

      {/* 3. How a call travels */}
      <section className="section band" id="journey">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>How a call travels</h2>
            <p className="lede">Scroll through one call, from the moment someone taps join.</p>
          </Reveal>
          <CallJourney />
        </div>
      </section>

      {/* 4. Versus the public internet */}
      <section className="section">
        <div className="wrap split" style={{ alignItems: 'center' }}>
          <Reveal className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
            <h2>Why not just use the internet?</h2>
            <p className="lede">
              The internet is built to deliver everything eventually, not to deliver a voice on time. Each provider
              sends traffic along whichever route costs it least. We keep your audio off that lottery for all but the
              first and last hop.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <RouteCompare />
          </Reveal>
        </div>
      </section>

      {/* 5. Weak mobile networks */}
      <section className="section band">
        <div className="wrap split" style={{ alignItems: 'center' }}>
          <Reveal className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
            <h2>Made for patchy mobile data</h2>
            <p className="lede">
              On a crowded 4G cell, packets go missing. Our audio carries a small copy of each packet inside the
              next, so a lost one is rebuilt instead of heard as a gap. Drag the slider to see the difference.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <LossSimulator />
          </Reveal>
        </div>
      </section>

      {/* 6. Regions */}
      <section className="section section-dark">
        <div className="wrap split" style={{ alignItems: 'center' }}>
          <Reveal className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
            <h2>Launch regions</h2>
            <p className="lede">
              We start in Dubai, a short hop from Pakistan and the Gulf, then add Mumbai, Frankfurt and Singapore. A
              data centre inside Pakistan is under evaluation.
            </p>
            <p>New regions open based on where beta teams&rsquo; users are.</p>
          </Reveal>
          <Reveal delay={0.15}>
            <NetworkShowcase />
          </Reveal>
        </div>
      </section>

      {/* 7. For developers */}
      <section className="section">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>Built for the people who integrate it</h2>
          </Reveal>
          <RevealGroup className="case-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {devPerks.map((perk) => (
              <RevealItem key={perk.title}>
                <div className="case-card">
                  <span className="case-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d={perk.icon} />
                    </svg>
                  </span>
                  <h3>{perk.title}</h3>
                  <p>{perk.body}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* 8. Resources */}
      <section className="section band">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>Go deeper</h2>
          </Reveal>
          <RevealGroup className="case-grid">
            {resources.map((r, i) => (
              <RevealItem key={r.href}>
                <Link href={r.href} className="case-card resource-card">
                  <span className="resource-thumb" style={{ background: r.hue }} aria-hidden="true">
                    <svg viewBox="0 0 200 90">
                      {Array.from({ length: 18 }, (_, k) => {
                        const hgt = 12 + Math.abs(Math.sin((k + i * 5) * 0.8)) * 56;
                        return <rect key={k} x={12 + k * 10.3} y={(90 - hgt) / 2} width="5" height={hgt} rx="2.5" fill={k % 5 === 2 ? '#C8630F' : '#2449A8'} opacity={0.75} />;
                      })}
                    </svg>
                  </span>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* 9. Products on the network */}
      <section className="section">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>Everything runs on it</h2>
          </Reveal>
          <RevealGroup className="case-grid">
            {products.slice(0, 3).map((p) => (
              <RevealItem key={p.slug}>
                <Link href={`/products/${p.slug}`} className="case-card">
                  <h3>{p.name}</h3>
                  <p>{p.summary}</p>
                  <span className="card-more">Explore {p.name.toLowerCase()}</span>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* 10. Calls to action */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap cta-trio">
          <Reveal className="cta-band animated cta-main">
            <div>
              <h2>Get started with {free} free minutes</h2>
              <p>Every month, on the same network you&rsquo;ll run in production.</p>
            </div>
            <div className="actions">
              <Link href="/signup" className="btn btn-primary">
                Request beta access
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="cta-side">
            <h3>Talk to us</h3>
            <p className="muted">Planning a launch or expecting millions of minutes?</p>
            <Link href="/contact" className="btn btn-secondary">
              Contact sales
            </Link>
          </Reveal>
          <Reveal delay={0.2} className="cta-side">
            <h3>Developer resources</h3>
            <p className="muted">Quick starts, API reference and the signaling protocol.</p>
            <Link href="/docs" className="btn btn-secondary">
              Go to the docs
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
