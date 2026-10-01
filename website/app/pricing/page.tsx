import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/Reveal';
import { PageHero } from '@/components/PageHero';
import Link from 'next/link';
import { PricingCalculator } from '@/components/PricingCalculator';
import { pricing } from '@/site.config';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Pay per participant-minute. The first 10,000 minutes every month are free.',
};

const faqs: [string, string][] = [
  [
    'What is a participant-minute?',
    'One person connected to a room for one minute. Five people in a room for ten minutes is 50 participant-minutes. Minutes are counted per person, from join to leave.',
  ],
  [
    'How is video priced?',
    'By the resolution each person actually receives. Someone watching a small thumbnail is billed at the SD rate even if the sender publishes HD.',
  ],
  [
    'Does a listener who never speaks cost the same?',
    'Yes, a listener is billed at the voice rate for the time they are in the room. Silence is not billed separately.',
  ],
  [
    'What happens to unused free minutes?',
    `The ${pricing.freeMinutesPerMonth.toLocaleString('en-US')} free minutes reset at the start of each calendar month and don't carry over.`,
  ],
  [
    'Can we get volume pricing?',
    'Yes. Teams expecting several million minutes a month can talk to us about committed-use pricing and an uptime agreement.',
  ],
];

export default function PricingPage() {
  const free = pricing.freeMinutesPerMonth.toLocaleString('en-US');
  return (
    <>
      <PageHero
        title="Pay for the minutes you use"
        lede={`The first ${free} participant-minutes every month are free. After that, one price per 1,000 minutes, with no seat licences, setup fees or minimum contract.`}
      />

      <section className="section band">
        <div className="wrap stack" style={{ '--gap': '32px' } as React.CSSProperties}>
          <Reveal className="table-frame">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Includes</th>
                    <th className="num">Per 1,000 minutes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Free every month</strong></td>
                    <td>First {free} minutes of any kind</td>
                    <td className="num">$0.00</td>
                  </tr>
                  {pricing.rates.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.label}</strong></td>
                      <td>{r.detail}</td>
                      <td className="num">${r.per1000.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Cloud recording</strong></td>
                    <td>Per recorded minute (coming soon)</td>
                    <td className="num">${pricing.recordingPer1000.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <PricingCalculator />
          </Reveal>
          <p className="small muted">
            Beta pricing, shown in US dollars. Final prices and local-currency billing are confirmed before the paid
            launch.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="stack" style={{ '--gap': '14px' } as React.CSSProperties}>
            <h2>Questions about billing</h2>
            <p className="muted">
              Something not covered here? <Link href="/contact">Ask us</Link>.
            </p>
          </div>
          <div className="stack" style={{ '--gap': '0' } as React.CSSProperties}>
            {faqs.map(([q, a]) => (
              <details key={q} className="case" style={{ paddingBlock: 18 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{q}</summary>
                <p className="muted" style={{ marginTop: 10 }}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section band">
        <div className="wrap">
          <div className="cta-band animated">
            <div>
              <h2>Expecting millions of minutes?</h2>
              <p>Committed-use pricing, an uptime agreement and a named contact for your team.</p>
            </div>
            <div className="actions">
              <Link href="/contact" className="btn btn-primary">
                Talk to sales
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
