import type { Metadata } from 'next';
import { LeadForm } from '@/components/LeadForm';
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline';
import { Reveal } from '@/components/motion/Reveal';
import { pricing } from '@/site.config';

export const metadata: Metadata = {
  title: 'Get started',
  description: 'Request access to the beta.',
};

export default function SignupPage() {
  return (
    <section className="page-hero" style={{ borderBottom: 'none' }}>
      <div className="glow glow-a" aria-hidden="true" />
      <div className="glow glow-b" aria-hidden="true" />
      <div className="wrap split page-hero-inner">
      <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
        <AnimatedHeadline text="Request beta access" style={{ fontSize: 'var(--step-4)' }} />
        <p className="lede">
          We&rsquo;re opening the platform to a small group of teams first, so we can work closely with each one.
        </p>
        <ul className="stack muted" style={{ '--gap': '8px', paddingLeft: 18, margin: 0 } as React.CSSProperties}>
          <li>{pricing.freeMinutesPerMonth.toLocaleString('en-US')} free minutes every month</li>
          <li>Console access with your App ID and App Certificate</li>
          <li>A direct line to the engineers building the platform</li>
        </ul>
      </div>
      <Reveal delay={0.2}>
        <LeadForm type="beta" />
      </Reveal>
      </div>
    </section>
  );
}
