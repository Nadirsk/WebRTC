'use client';

import { motion, useInView, useReducedMotion } from 'motion/react';
import { useRef } from 'react';
import { CountUp } from '../motion/CountUp';

const ease = [0.2, 0.7, 0.2, 1] as const;

/** Coverage: region dots light up one by one, with a ripple on the launch region. */
function CoverageArt({ on }: { on: boolean }) {
  const pts = [
    [22, 30, 'FRA'],
    [62, 56, 'DXB'],
    [74, 57, 'KHI'],
    [80, 66, 'BOM'],
    [118, 94, 'SIN'],
  ] as const;
  return (
    <svg viewBox="0 0 140 110" aria-hidden="true">
      {Array.from({ length: 11 }, (_, r) =>
        Array.from({ length: 14 }, (_, c) => <circle key={`${r}-${c}`} cx={6 + c * 10} cy={6 + r * 10} r={1} fill="#CBD5E1" />),
      )}
      {pts.map(([x, y, code], i) => (
        <g key={code}>
          {code === 'DXB' && (
            <motion.circle
              cx={x}
              cy={y}
              r={6}
              fill="none"
              stroke="#C8630F"
              strokeWidth={1.5}
              animate={on ? { r: [6, 22], opacity: [0.8, 0] } : undefined}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          <motion.circle
            cx={x}
            cy={y}
            r={code === 'DXB' ? 5 : 4}
            fill={code === 'KHI' ? '#FFFFFF' : '#C8630F'}
            stroke="#C8630F"
            strokeWidth={1.5}
            strokeDasharray={code === 'KHI' ? '2 2' : undefined}
            initial={{ scale: 0, opacity: 0 }}
            animate={on ? { scale: 1, opacity: 1 } : undefined}
            transition={{ delay: 0.2 + i * 0.15, type: 'spring', stiffness: 300, damping: 16 }}
          />
        </g>
      ))}
    </svg>
  );
}

/** Latency: a jittery line settles into a low, flat one. */
function LatencyArt({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 140 110" aria-hidden="true">
      <line x1="8" y1="92" x2="132" y2="92" stroke="#DCE2E9" />
      <line x1="8" y1="70" x2="132" y2="70" stroke="#C8630F" strokeDasharray="3 4" strokeWidth={1} />
      <motion.path
        d="M8,30 L20,52 L30,24 L42,60 L52,36 L62,62 L72,68 L84,66 L96,70 L108,67 L120,69 L132,68"
        fill="none"
        stroke="#2449A8"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={on ? { pathLength: 1 } : undefined}
        transition={{ duration: 1.8, ease }}
      />
      <text x="132" y="84" textAnchor="end" fontSize="9" fill="#C8630F" fontWeight={600}>
        target
      </text>
    </svg>
  );
}

/** Scale: one upload fans out to many listeners. */
function ScaleArt({ on }: { on: boolean }) {
  const targets = Array.from({ length: 9 }, (_, i) => ({ x: 118, y: 12 + i * 11 }));
  return (
    <svg viewBox="0 0 140 110" aria-hidden="true">
      <circle cx="20" cy="56" r="9" fill="#FBEFE4" stroke="#C8630F" strokeWidth={1.5} />
      <rect x="52" y="44" width="30" height="24" rx="5" fill="#E7EDFA" stroke="#2449A8" strokeWidth={1.2} />
      <line x1="29" y1="56" x2="52" y2="56" stroke="#C8630F" strokeWidth={2} />
      {targets.map((t, i) => (
        <g key={i}>
          <motion.line
            x1={82}
            y1={56}
            x2={t.x - 5}
            y2={t.y}
            stroke="#2449A8"
            strokeWidth={1}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={on ? { pathLength: 1, opacity: 0.7 } : undefined}
            transition={{ delay: 0.3 + i * 0.07, duration: 0.5 }}
          />
          <motion.circle
            cx={t.x}
            cy={t.y}
            r={4}
            fill="#2449A8"
            initial={{ scale: 0 }}
            animate={on ? { scale: 1 } : undefined}
            transition={{ delay: 0.5 + i * 0.07, type: 'spring', stiffness: 400, damping: 18 }}
          />
        </g>
      ))}
    </svg>
  );
}

/** Reliability: a heartbeat line keeps running across a server swap. */
function ReliabilityArt({ on }: { on: boolean }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 140 110" aria-hidden="true">
      <rect x="10" y="20" width="120" height="70" rx="10" fill="#F4F7FB" stroke="#DCE2E9" />
      <motion.path
        d="M16,56 L44,56 L50,40 L58,72 L64,50 L70,56 L124,56"
        fill="none"
        stroke="#1D7A4A"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={on && !reduce ? { pathLength: [0, 1], opacity: [1, 1, 0] } : on ? { pathLength: 1 } : undefined}
        transition={on && !reduce ? { duration: 2.2, repeat: Infinity, ease: 'linear', times: [0, 0.85, 1] } : { duration: 1 }}
      />
      <circle cx="124" cy="30" r="4" fill="#1D7A4A" />
    </svg>
  );
}

const pillars = [
  {
    title: 'Coverage where your users are',
    body: 'Launching in Dubai, then Mumbai, Frankfurt and Singapore. A Karachi data centre is under evaluation.',
    stat: <><CountUp to={5} /> launch regions</>,
    Art: CoverageArt,
  },
  {
    title: 'Low delay',
    body: 'Users connect to the nearest server, and our routing picks the fastest path between regions.',
    stat: <>&lt;<CountUp to={150} /> ms in a region (target)</>,
    Art: LatencyArt,
  },
  {
    title: 'Grows with your rooms',
    body: 'A speaker uploads once and servers make every copy. Listeners only receive, so big rooms stay light.',
    stat: <>1 upload, any number of listeners</>,
    Art: ScaleArt,
  },
  {
    title: 'Keeps calls running',
    body: 'Servers report their health every few seconds. If one fails, the app moves to the next without a tap.',
    stat: <>&lt;<CountUp to={3} /> s to recover (target)</>,
    Art: ReliabilityArt,
  },
];

export function Pillars() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -100px 0px' });
  const reduce = useReducedMotion();
  const on = inView || Boolean(reduce);

  return (
    <div className="pillars" ref={ref}>
      {pillars.map(({ title, body, stat, Art }, i) => (
        <motion.article
          key={title}
          className="pillar"
          initial={reduce ? false : { opacity: 0, y: 30 }}
          animate={on ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.6, ease, delay: i * 0.1 }}
        >
          <div className="pillar-art">
            <Art on={on} />
          </div>
          <h3>{title}</h3>
          <p>{body}</p>
          <span className="pillar-stat">{stat}</span>
        </motion.article>
      ))}
    </div>
  );
}
