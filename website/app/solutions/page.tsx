import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { PageHero } from '@/components/PageHero';
import { UseCaseIcon } from '@/components/visuals/UseCaseIcon';
import { getProduct } from '@/content/products';
import { solutions } from '@/content/solutions';

export const metadata: Metadata = {
  title: 'Solutions',
  description: 'How social apps, dating apps, online classes, telehealth, support teams, games and live shopping use real-time voice and video.',
};

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        title="What teams build with it"
        lede="The same rooms and SDK power very different apps. Here is how each kind of product usually puts them together."
      />
      <section className="section band">
        <div className="wrap">
          <RevealGroup className="case-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {solutions.map((s) => (
              <RevealItem key={s.id}>
                <div className="case-card" id={s.id} style={{ scrollMarginTop: 100 }}>
                  <UseCaseIcon id={s.id} />
                  <h3>{s.name}</h3>
                  <p>{s.body}</p>
                  <ul className="check-list" style={{ marginTop: 4 }}>
                    {s.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <div className="tags" style={{ marginTop: 6 }}>
                    {s.products.map((slug) => {
                      const product = getProduct(slug);
                      return product ? (
                        <Link key={slug} href={`/products/${slug}`} className="tag">
                          {product.name}
                        </Link>
                      ) : null;
                    })}
                  </div>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <Reveal>
            <div className="cta-band animated">
              <div>
                <h2>Building something else?</h2>
                <p>Tell us about your app and we&rsquo;ll suggest how to set up rooms, roles and pricing for it.</p>
              </div>
              <div className="actions">
                <Link href="/contact" className="btn btn-primary">
                  Talk to us
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
