import Image from 'next/image';
import { site } from '@/site.config';

/** Wordmark plus the N mark. */
export function Logo() {
  return (
    <span className="brand-inner" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <Image src="/brand/logo-mark.png" alt="" width={838} height={612} style={{ height: 32, width: 'auto' }} priority aria-hidden="true" />
      <span className="brand-name">{site.name}</span>
    </span>
  );
}
