'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Fragment } from 'react';

type Props = {
  text: string;
  as?: 'h1' | 'h2';
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
};

/** Words slide up out of a mask one after another. The text stays one heading for screen readers. */
export function AnimatedHeadline({ text, as = 'h1', className, style, delay = 0 }: Props) {
  const reduce = useReducedMotion();
  const Tag = as;
  const words = text.split(' ');
  return (
    <Tag className={className} style={style} aria-label={text}>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span className="word-mask" aria-hidden="true">
            <motion.span
              className="word"
              initial={reduce ? false : { y: '110%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              transition={{ duration: 0.75, ease: [0.2, 0.7, 0.2, 1], delay: delay + i * 0.07 }}
            >
              {word}
            </motion.span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </Tag>
  );
}
