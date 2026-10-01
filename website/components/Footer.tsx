import Link from 'next/link';
import { products } from '@/content/products';
import { site } from '@/site.config';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="stack" style={{ '--gap': '14px' } as React.CSSProperties}>
            <Logo />
            <p className="muted small" style={{ maxWidth: '36ch' }}>
              Real-time voice and video infrastructure for apps built in and for South Asia and the Gulf.
            </p>
          </div>
          <div>
            <h3>Products</h3>
            <ul>
              {products.map((p) => (
                <li key={p.slug}>
                  <Link href={`/products/${p.slug}`}>{p.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Developers</h3>
            <ul>
              <li><Link href="/docs">Documentation</Link></li>
              <li><Link href="/docs/quickstart-web">Web quick start</Link></li>
              <li><Link href="/docs/quickstart-react-native">React Native quick start</Link></li>
              <li><Link href="/developers">SDKs</Link></li>
              <li><Link href="/demo">Live demo</Link></li>
            </ul>
          </div>
          <div>
            <h3>Company</h3>
            <ul>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/network">Network</Link></li>
              <li><Link href="/pricing">Pricing</Link></li>
              <li><Link href="/contact">Contact sales</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-base small muted">
          <span>© {site.year} {site.name}. Pre-launch beta.</span>
          <span>{site.supportEmail}</span>
        </div>
      </div>
    </footer>
  );
}
