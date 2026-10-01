import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CodeBlock } from '@/components/CodeBlock';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { PageHero } from '@/components/PageHero';
import { StatusBadge } from '@/components/StatusBadge';
import { ProductVisual } from '@/components/visuals/ProductVisual';
import { getProduct, products } from '@/content/products';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const product = getProduct((await params).slug);
  return product ? { title: product.name, description: product.summary } : {};
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const product = getProduct((await params).slug);
  if (!product) notFound();

  const others = products.filter((p) => p.slug !== product.slug);
  const isRest = product.slug === 'cloud-recording';

  return (
    <>
      <PageHero
        title={product.name}
        crumb={
          <span className="actions" style={{ gap: 12 }}>
            <Link href="/products">Products</Link>
            <StatusBadge status={product.status} />
          </span>
        }
        lede={product.intro}
        visual={<ProductVisual slug={product.slug} />}
      >
        <div className="actions">
          <Link href="/signup" className="btn btn-primary">
            Get started free
          </Link>
          {product.status !== 'soon' && (
            <Link href="/demo" className="btn btn-secondary">
              Try the live demo
            </Link>
          )}
        </div>
      </PageHero>

      <section className="section band">
        <div className="wrap">
          <RevealGroup className="case-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {product.features.map((f) => (
              <RevealItem key={f.title}>
                <div className="case-card">
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <Reveal className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
            <h2>{isRest ? 'How it will work' : 'How it looks in code'}</h2>
            <div className="table-frame">
              <table>
                <tbody>
                  {product.specs.map(([k, v]) => (
                    <tr key={k}>
                      <th style={{ width: '38%' }}>{k}</th>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tags">
              {product.goodFor.map((g) => (
                <span className="tag" key={g}>
                  {g}
                </span>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <CodeBlock code={product.code.source} lang={isRest ? 'http' : 'ts'} label={product.code.label} />
          </Reveal>
        </div>
      </section>

      <section className="section band">
        <div className="wrap">
          <Reveal className="section-head">
            <h2>Also on the platform</h2>
          </Reveal>
          <RevealGroup className="case-grid">
            {others.map((p) => (
              <RevealItem key={p.slug}>
                <Link href={`/products/${p.slug}`} className="case-card">
                  <StatusBadge status={p.status} />
                  <h3>{p.name}</h3>
                  <p>{p.summary}</p>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>
    </>
  );
}
