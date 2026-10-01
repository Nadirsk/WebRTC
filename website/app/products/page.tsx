import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { PageHero } from '@/components/PageHero';
import { StatusBadge } from '@/components/StatusBadge';
import { ProductShowcase } from '@/components/visuals/ProductShowcase';
import { products } from '@/content/products';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Voice calling, video calling, interactive live streaming and cloud recording on one SDK.',
};

export default function ProductsPage() {
  return (
    <>
      <PageHero
        title="Products"
        lede="Everything runs on the same rooms, the same SDK and the same network. Start with voice and add video or live audiences later without changing how your app connects."
      />
      <section className="section band">
        <div className="wrap">
          <ProductShowcase />
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>All products</h2>
          </Reveal>
          <RevealGroup className="rows">
            {products.map((p) => (
              <RevealItem key={p.slug}>
                <Link href={`/products/${p.slug}`} className="row">
                  <h3>{p.name}</h3>
                  <p>{p.summary}</p>
                  <StatusBadge status={p.status} />
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
          <p className="small muted" style={{ marginTop: 20, maxWidth: '70ch' }}>
            Beta: ready to build on, open to beta teams. Preview: works today, details may still change. Coming soon:
            planned for the paid launch.
          </p>
        </div>
      </section>
    </>
  );
}
