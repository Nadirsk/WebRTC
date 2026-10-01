import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap" style={{ paddingBlock: 'clamp(64px, 10vw, 140px)', display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 'var(--step-4)' }}>This page doesn&rsquo;t exist</h1>
      <p className="lede">The link may be old, or the address may have a typo.</p>
      <div className="actions">
        <Link href="/" className="btn btn-primary">
          Go to the home page
        </Link>
        <Link href="/docs" className="btn btn-secondary">
          Open the docs
        </Link>
      </div>
    </div>
  );
}
