'use client';

import { motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const steps = [
  {
    title: 'The app asks where to connect',
    body: 'Before joining, the SDK asks our access point for servers. It checks the token, where the user is and which servers are healthy, and replies with the best two or three.',
  },
  {
    title: 'The nearest server takes the audio',
    body: 'The app tests those servers, keeps the fastest, and starts sending. Only this short first hop crosses the open internet.',
  },
  {
    title: 'Our backbone carries it',
    body: 'Between regions, audio moves server to server on routes we measure every few seconds. A backup path is always ready if the main one slows down.',
  },
  {
    title: 'If a server fails, the call moves',
    body: 'Servers report their health constantly. When one goes quiet, the app reconnects to the next server on its list and the room carries on, targeted at under three seconds.',
  },
];

const MEDIA = '#C8630F';
const CONTROL = '#2449A8';
const DIM = '#C3CDD8';

function Packet({ path, dur, color, delay = 0 }: { path: string; dur: number; color: string; delay?: number }) {
  return (
    <circle r="5" fill={color}>
      <animateMotion dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" path={path} />
    </circle>
  );
}

function Box({ x, y, label, sub, active, failed }: { x: number; y: number; label: string; sub?: string; active: boolean; failed?: boolean }) {
  return (
    <motion.g animate={{ opacity: active || failed ? 1 : 0.45 }} transition={{ duration: 0.4 }}>
      <rect
        x={x - 58}
        y={y - 24}
        width={116}
        height={48}
        rx={10}
        fill={failed ? '#FDECEC' : '#FFFFFF'}
        stroke={failed ? '#B3322F' : active ? '#111C2B' : '#B9C4CF'}
        strokeWidth={active || failed ? 1.6 : 1.2}
      />
      <text x={x} y={sub ? y - 3 : y + 5} textAnchor="middle" fontSize="13" fontWeight={650} fill="#111C2B">
        {label}
      </text>
      {sub && (
        <text x={x} y={y + 14} textAnchor="middle" fontSize="11" fill={failed ? '#B3322F' : '#5A6878'}>
          {sub}
        </text>
      )}
      {failed && (
        <g stroke="#B3322F" strokeWidth={2.4} strokeLinecap="round">
          <line x1={x + 44} y1={y - 30} x2={x + 56} y2={y - 18} />
          <line x1={x + 56} y1={y - 30} x2={x + 44} y2={y - 18} />
        </g>
      )}
    </motion.g>
  );
}

function Person({ x, y, letter, label, active }: { x: number; y: number; letter: string; label: string; active: boolean }) {
  return (
    <motion.g animate={{ opacity: active ? 1 : 0.5 }}>
      <circle cx={x} cy={y} r={22} fill="#FFFFFF" stroke="#111C2B" strokeWidth={1.5} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight={650} fill="#111C2B">
        {letter}
      </text>
      <text x={x} y={y + 42} textAnchor="middle" fontSize="12" fill="#5A6878">
        {label}
      </text>
    </motion.g>
  );
}

function Diagram({ step }: { step: number }) {
  const controlOn = step === 0;
  const firstHopOn = step >= 1 && step < 3;
  const backboneOn = step === 2;
  const failover = step === 3;

  const pA_AP = 'M62,190 L150,84';
  const pAP_A = 'M150,84 L62,190';
  const pA_DXB1 = 'M72,200 L142,200';
  const pDXB1_FRA = 'M238,200 L342,200';
  const pBackup = 'M238,214 Q290,262 342,214';
  const pFRA_B = 'M438,200 L478,200';
  const pA_DXB2 = 'M68,214 Q100,300 142,300';
  const pDXB2_FRA = 'M238,300 Q300,300 342,216';

  return (
    <svg viewBox="0 0 540 380" role="img" aria-label={`${steps[step]!.title}. ${steps[step]!.body}`}>
      <defs>
        <pattern id="cj-dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#DCE2E9" />
        </pattern>
      </defs>
      <rect width="540" height="380" fill="url(#cj-dots)" />

      {/* control plane */}
      <path d={pA_AP} stroke={controlOn ? CONTROL : DIM} strokeWidth={1.8} strokeDasharray="5 5" fill="none" />
      {/* first hop */}
      <path d={pA_DXB1} stroke={firstHopOn ? MEDIA : failover ? '#E5B3B1' : DIM} strokeWidth={firstHopOn ? 3 : 2} fill="none" className={firstHopOn ? 'net-flow' : undefined} />
      {/* backbone + backup */}
      <path d={pDXB1_FRA} stroke={backboneOn ? MEDIA : DIM} strokeWidth={backboneOn ? 4 : 2} fill="none" className={backboneOn ? 'net-flow' : undefined} />
      <path d={pBackup} stroke={backboneOn ? MEDIA : DIM} strokeWidth={1.5} strokeDasharray="5 5" fill="none" opacity={backboneOn ? 0.8 : 0.5} />
      <path d={pFRA_B} stroke={backboneOn || failover ? MEDIA : DIM} strokeWidth={backboneOn || failover ? 3 : 2} fill="none" className={backboneOn || failover ? 'net-flow' : undefined} />
      {/* failover route */}
      <path d={pA_DXB2} stroke={failover ? MEDIA : DIM} strokeWidth={failover ? 3 : 1.5} strokeDasharray={failover ? undefined : '4 5'} fill="none" className={failover ? 'net-flow' : undefined} opacity={failover ? 1 : 0.5} />
      <path d={pDXB2_FRA} stroke={failover ? MEDIA : DIM} strokeWidth={failover ? 3 : 1.5} strokeDasharray={failover ? undefined : '4 5'} fill="none" className={failover ? 'net-flow' : undefined} opacity={failover ? 1 : 0.5} />

      <g key={step}>
        {controlOn && (
          <>
            <Packet path={pA_AP} dur={1.4} color={CONTROL} />
            <Packet path={pAP_A} dur={1.4} color={CONTROL} delay={0.7} />
          </>
        )}
        {firstHopOn && <Packet path={pA_DXB1} dur={1} color={MEDIA} />}
        {backboneOn && (
          <>
            <Packet path={pDXB1_FRA} dur={1.2} color={MEDIA} />
            <Packet path={pDXB1_FRA} dur={1.2} color={MEDIA} delay={0.6} />
            <Packet path={pFRA_B} dur={0.6} color={MEDIA} />
          </>
        )}
        {failover && (
          <>
            <Packet path={pA_DXB2} dur={1.1} color={MEDIA} />
            <Packet path={pDXB2_FRA} dur={1.3} color={MEDIA} delay={0.4} />
            <Packet path={pFRA_B} dur={0.6} color={MEDIA} />
          </>
        )}
      </g>

      <Box x={150} y={60} label="Access point" sub="picks your server" active={controlOn} />
      <Box x={190} y={200} label="DXB server 1" sub={failover ? 'stopped responding' : 'nearest'} active={firstHopOn || backboneOn} failed={failover} />
      <Box x={190} y={300} label="DXB server 2" sub="standby" active={failover} />
      <Box x={390} y={200} label="FRA server" sub="near the listener" active={backboneOn || failover} />
      <Person x={46} y={200} letter="A" label="Caller" active />
      <Person x={500} y={200} letter="B" label="Listener" active={step >= 2} />

      {failover && (
        <motion.g initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <rect x="300" y="300" width="200" height="34" rx="17" fill="#111C2B" />
          <text x="400" y="322" textAnchor="middle" fontSize="12" fontWeight={600} fill="#FFFFFF">
            Back in the room, target &lt;3 s
          </text>
        </motion.g>
      )}
    </svg>
  );
}

function StepText({ index, onActive, active }: { index: number; onActive: (i: number) => void; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);
  const s = steps[index]!;
  return (
    <div ref={ref} className="journey-step" data-active={active}>
      <span className="journey-num">{index + 1}</span>
      <h3>{s.title}</h3>
      <p>{s.body}</p>
    </div>
  );
}

/** Scroll-driven walk through one call: text on the left, a sticky diagram that follows along. */
export function CallJourney() {
  const [active, setActive] = useState(0);
  return (
    <div className="journey">
      <div className="journey-visual">
        <div className="journey-frame">
          <Diagram step={active} />
          <div className="journey-dots" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} data-active={i === active} />
            ))}
          </div>
        </div>
      </div>
      <div className="journey-steps">
        {steps.map((_, i) => (
          <StepText key={i} index={i} onActive={setActive} active={i === active} />
        ))}
      </div>
    </div>
  );
}
