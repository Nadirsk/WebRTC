'use client';

import { motion, useReducedMotion } from 'motion/react';

type Props = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Seconds for one up-and-down bob. */
  period?: number;
};

/** A small glassy label that pops in and then bobs gently. */
export function FloatChip({ children, className = '', delay = 0, period = 5 }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`float-chip ${className}`}
      initial={reduce ? false : { opacity: 0, scale: 0.8, y: 12 }}
      animate={reduce ? undefined : { opacity: 1, scale: 1, y: [0, -9, 0] }}
      transition={{
        opacity: { duration: 0.5, delay },
        scale: { duration: 0.5, delay, ease: [0.2, 0.7, 0.2, 1] },
        y: { duration: period, delay, repeat: Infinity, ease: 'easeInOut' },
      }}
    >
      {children}
    </motion.div>
  );
}
