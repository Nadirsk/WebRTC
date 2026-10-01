'use client';

import { productVisuals } from './ProductVisuals';

/** Picks the animated illustration for a product (lets server pages render it by slug). */
export function ProductVisual({ slug }: { slug: string }) {
  const Visual = productVisuals[slug];
  return Visual ? <Visual /> : null;
}
