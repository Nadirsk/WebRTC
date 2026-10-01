import type { Metadata } from 'next';
import { RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { PageHero } from '@/components/PageHero';
import Link from 'next/link';
import { site } from '@/site.config';

export const metadata: Metadata = {
  title: 'About',
  description: `Why we are building ${site.name}.`,
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        title={`Why we're building ${site.name}`}
        lede="Apps in Pakistan, the Gulf and South Asia run on real-time conversation: voice rooms, calls with family abroad, tutoring, doctor consultations. Most of the infrastructure behind them is built and priced for other markets."
      />
      <section className="section band">
        <RevealGroup className="wrap facts">
          <RevealItem className="fact">
            <h3>Servers where the users are</h3>
            <p>
              Delay is mostly distance. We put servers close to the people using your app, starting in Dubai and
              adding regions as our customers&rsquo; users grow.
            </p>
          </RevealItem>
          <RevealItem className="fact">
            <h3>Built on open standards</h3>
            <p>
              The platform runs on WebRTC, the standard behind calling in every modern browser and phone. No plugins,
              and no lock-in to one device maker.
            </p>
          </RevealItem>
          <RevealItem className="fact">
            <h3>Priced for how apps here grow</h3>
            <p>
              Free to start, per-minute after that, and support in your time zone from people who build the platform.
            </p>
          </RevealItem>
        </RevealGroup>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="cta-band animated">
            <div>
              <h2>Work with us from the start</h2>
              <p>Beta teams shape what we build next.</p>
            </div>
            <div className="actions">
              <Link href="/signup" className="btn btn-primary">
                Request beta access
              </Link>
              <Link href="/contact" className="btn btn-secondary">
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
