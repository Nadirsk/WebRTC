'use client';

import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { products, statusLabel } from '@/content/products';
import { productVisuals } from './ProductVisuals';

const ROTATE_MS = 7000;

/** Tabs that advance by themselves while in view; any click takes over. */
export function ProductShowcase() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-20% 0px -20% 0px' });
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const [hover, setHover] = useState(false);

  const running = auto && inView && !hover && !reduce;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % products.length), ROTATE_MS);
    return () => clearTimeout(t);
  }, [running, index]);

  const product = products[index]!;
  const Visual = productVisuals[product.slug]!;

  return (
    <div className="showcase" ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="showcase-tabs" role="tablist" aria-label="Products">
        {products.map((p, i) => (
          <button
            key={p.slug}
            role="tab"
            type="button"
            aria-selected={i === index}
            className="showcase-tab"
            onClick={() => {
              setIndex(i);
              setAuto(false);
            }}
          >
            <span className="showcase-tab-name">{p.name}</span>
            <span className={`status status-${p.status}`}>{statusLabel[p.status]}</span>
            <span className="showcase-progress" aria-hidden="true">
              {i === index && (
                <motion.i
                  key={`${index}-${running}`}
                  initial={{ scaleX: running ? 0 : 1 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: running ? ROTATE_MS / 1000 : 0, ease: 'linear' }}
                />
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="showcase-body">
        <AnimatePresence mode="wait">
          <motion.div
            key={product.slug}
            className="showcase-copy"
            role="tabpanel"
            initial={reduce ? false : { opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: 20 }}
            transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <h3>{product.name}</h3>
            <p className="lede">{product.intro}</p>
            <ul className="check-list">
              {product.features.map((f) => (
                <li key={f.title}>
                  <strong>{f.title}.</strong> {f.body}
                </li>
              ))}
            </ul>
            <Link href={`/products/${product.slug}`} className="btn btn-secondary">
              Explore {product.name.toLowerCase()}
            </Link>
          </motion.div>
        </AnimatePresence>

        <div className="showcase-stage">
          <AnimatePresence mode="wait">
            <motion.div
              key={product.slug}
              initial={reduce ? false : { opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.96, y: -12 }}
              transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <Visual />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
