'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const groups: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Get started',
    links: [
      { href: '/docs', label: 'Overview' },
      { href: '/docs/quickstart-web', label: 'Web quick start' },
      { href: '/docs/quickstart-react-native', label: 'React Native quick start' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { href: '/docs/concepts', label: 'Rooms, roles and tracks' },
      { href: '/docs/tokens', label: 'Tokens' },
      { href: '/docs/client-api', label: 'Client API reference' },
      { href: '/docs/limits', label: 'Limits and quality' },
    ],
  },
  {
    title: 'Advanced',
    links: [{ href: '/docs/signaling', label: 'Signaling protocol' }],
  },
];

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className="docs-nav" aria-label="Documentation">
      {groups.map((g) => (
        <div key={g.title} style={{ display: 'contents' }}>
          <h2>{g.title}</h2>
          {g.links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
