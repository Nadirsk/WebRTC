'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

type Mode = 'internet' | 'ours';

const INTERNET = 'M50,130 L140,70 L220,180 L300,60 L380,190 L460,80 L540,170 L620,90 L710,130';
const HOPS = [
  [140, 70],
  [220, 180],
  [300, 60],
  [380, 190],
  [460, 80],
  [540, 170],
  [620, 90],
];
const OURS_MAIN = 'M50,130 L170,130 Q380,40 590,130 L710,130';
const OURS_BACKUP = 'M170,146 Q380,236 590,146';

const facts: Record<Mode, [string, string][]> = {
  internet: [
    ['Who picks the route', 'Each internet provider, usually by cost'],
    ['Hops you can’t control', 'The whole way'],
    ['If a link degrades', 'Traffic keeps using it until routing changes'],
  ],
  ours: [
    ['Who picks the route', 'We do, re-measured every few seconds'],
    ['Hops over the open internet', 'Only the first and the last'],
    ['If a link degrades', 'A backup path takes over'],
  ],
};

/** Toggle between a best-effort internet path and our routed path. Switches by itself until clicked. */
export function RouteCompare() {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>('internet');
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || reduce) return;
    const t = setTimeout(() => setMode((m) => (m === 'internet' ? 'ours' : 'internet')), 5200);
    return () => clearTimeout(t);
  }, [auto, mode, reduce]);

  const pick = (m: Mode) => {
    setMode(m);
    setAuto(false);
  };

  return (
    <div className="compare">
      <div className="compare-toggle" role="tablist" aria-label="Compare routes">
        <button type="button" role="tab" aria-selected={mode === 'internet'} onClick={() => pick('internet')}>
          Public internet
        </button>
        <button type="button" role="tab" aria-selected={mode === 'ours'} onClick={() => pick('ours')}>
          Our network
        </button>
        <motion.span className="compare-thumb" layout transition={{ type: 'spring', stiffness: 400, damping: 32 }} data-mode={mode} />
      </div>

      <div className="compare-stage">
        <svg viewBox="0 0 760 260" role="img" aria-label={mode === 'internet' ? 'Audio crosses many provider hops, and some packets are lost on the way.' : 'Audio takes a short hop to our server, crosses our backbone with a backup path ready, and takes a short hop to the listener.'}>
          <AnimatePresence mode="wait">
            {mode === 'internet' ? (
              <motion.g key="internet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                <path d={INTERNET} fill="none" stroke="#B9C4CF" strokeWidth={2} strokeLinejoin="round" />
                {HOPS.map(([x, y], i) => (
                  <g key={i}>
                    <circle cx={x} cy={y} r={7} fill="#FFFFFF" stroke="#97A6B6" strokeWidth={1.5} />
                  </g>
                ))}
                <g stroke="#B3322F" strokeWidth={2.4} strokeLinecap="round">
                  <line x1="333" y1="118" x2="347" y2="132" />
                  <line x1="347" y1="118" x2="333" y2="132" />
                  <line x1="573" y1="124" x2="587" y2="138" />
                  <line x1="587" y1="124" x2="573" y2="138" />
                </g>
                <text x="340" y="152" textAnchor="middle" fontSize="12" fill="#B3322F" fontWeight={600}>lost</text>
                <text x="580" y="158" textAnchor="middle" fontSize="12" fill="#B3322F" fontWeight={600}>lost</text>
                {[0, 1.1, 2.2].map((d) => (
                  <circle key={d} r={5} fill="#5A6878">
                    <animateMotion dur="3.4s" begin={`${d}s`} repeatCount="indefinite" path={INTERNET} />
                  </circle>
                ))}
                <circle r={5} fill="#5A6878">
                  <animateMotion dur="3.4s" begin="0.55s" repeatCount="indefinite" path={INTERNET} keyPoints="0;0.42;0.42" keyTimes="0;0.42;1" calcMode="linear" />
                  <animate attributeName="opacity" dur="3.4s" begin="0.55s" repeatCount="indefinite" values="1;1;0;0" keyTimes="0;0.4;0.45;1" />
                </circle>
              </motion.g>
            ) : (
              <motion.g key="ours" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                <path d={OURS_BACKUP} fill="none" stroke="#C8630F" strokeWidth={1.5} strokeDasharray="6 6" opacity={0.7} />
                <text x="380" y="222" textAnchor="middle" fontSize="12" fill="#C8630F">backup path, ready</text>
                <path d={OURS_MAIN} fill="none" stroke="#C8630F" strokeWidth={3} className="net-flow" />
                <rect x="130" y="110" width="80" height="40" rx="9" fill="#FFFFFF" stroke="#111C2B" strokeWidth={1.4} />
                <text x="170" y="135" textAnchor="middle" fontSize="13" fontWeight={650} fill="#111C2B">DXB</text>
                <rect x="550" y="110" width="80" height="40" rx="9" fill="#FFFFFF" stroke="#111C2B" strokeWidth={1.4} />
                <text x="590" y="135" textAnchor="middle" fontSize="13" fontWeight={650} fill="#111C2B">FRA</text>
                <text x="380" y="70" textAnchor="middle" fontSize="12.5" fill="#C8630F" fontWeight={600}>our backbone</text>
                {[0, 0.5, 1, 1.5, 2].map((d) => (
                  <circle key={d} r={5} fill="#C8630F">
                    <animateMotion dur="2.5s" begin={`${d}s`} repeatCount="indefinite" path={OURS_MAIN} />
                  </circle>
                ))}
              </motion.g>
            )}
          </AnimatePresence>
          <circle cx="50" cy="130" r="24" fill="#E7EDFA" stroke="#2449A8" strokeWidth={1.5} />
          <text x="50" y="135" textAnchor="middle" fontSize="14" fontWeight={650} fill="#111C2B">A</text>
          <circle cx="710" cy="130" r="24" fill="#FBEFE4" stroke="#C8630F" strokeWidth={1.5} />
          <text x="710" y="135" textAnchor="middle" fontSize="14" fontWeight={650} fill="#111C2B">B</text>
        </svg>
      </div>

      <AnimatePresence mode="wait">
        <motion.dl
          key={mode}
          className="compare-facts"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {facts[mode].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </motion.dl>
      </AnimatePresence>
      <p className="small muted">Illustration of how routing differs, not a measurement.</p>
    </div>
  );
}
