'use client';

import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { useRef } from 'react';

/** A vertical line that draws itself down the steps as the reader scrolls through them. */
export function StepsTimeline({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const scaleY = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });

  return (
    <ol className="steps timeline" ref={ref}>
      <span className="timeline-track" aria-hidden="true" />
      <motion.span className="timeline-fill" aria-hidden="true" style={{ scaleY: reduce ? 1 : scaleY }} />
      {children}
    </ol>
  );
}
