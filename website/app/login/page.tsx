import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to the developer console.',
};

export default function LoginPage() {
  return (
    <section className="page-hero" style={{ borderBottom: 'none' }}>
      <div className="glow glow-a" aria-hidden="true" />
      <div className="glow glow-b" aria-hidden="true" />
      <div className="wrap" style={{ position: 'relative', paddingBlock: 'clamp(56px, 8vw, 112px)', maxWidth: 560 }}>
      <Reveal className="panel stack" style={{ '--gap': '18px' } as React.CSSProperties}>
        <h1 style={{ fontSize: 'var(--step-3)' }}>Log in to the console</h1>
        <p className="muted">
          The console, where you create projects and get your App ID, opens to beta teams first. Once your request is
          approved we&rsquo;ll email you a link to set your password.
        </p>
        <div className="actions">
          <Link href="/signup" className="btn btn-primary">
            Request beta access
          </Link>
          <Link href="/demo" className="btn btn-secondary">
            Try the live demo
          </Link>
        </div>
      </Reveal>
      </div>
    </section>
  );
}
