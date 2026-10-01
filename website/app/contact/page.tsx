import type { Metadata } from 'next';
import { LeadForm } from '@/components/LeadForm';
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline';
import { Reveal } from '@/components/motion/Reveal';
import { site } from '@/site.config';

export const metadata: Metadata = {
  title: 'Contact sales',
  description: 'Talk to us about volume pricing, uptime agreements and your use case.',
};

export default function ContactPage() {
  return (
    <section className="page-hero" style={{ borderBottom: 'none' }}>
      <div className="glow glow-a" aria-hidden="true" />
      <div className="glow glow-b" aria-hidden="true" />
      <div className="wrap split page-hero-inner">
      <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
        <AnimatedHeadline text="Talk to sales" style={{ fontSize: 'var(--step-4)' }} />
        <p className="lede">
          Planning a launch, expecting a lot of minutes, or not sure which products you need? Tell us about it.
        </p>
        <p className="muted">
          Or email <span style={{ userSelect: 'all', color: 'var(--ink)' }}>{site.salesEmail}</span>
        </p>
      </div>
      <Reveal delay={0.2}>
        <LeadForm type="sales" />
      </Reveal>
      </div>
    </section>
  );
}
