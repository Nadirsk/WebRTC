'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { FloatChip } from '../motion/FloatChip';
import { Waveform } from './Waveform';

const people = [
  { initials: 'AK', name: 'Ayesha', role: 'Host', tint: '#E3E9F8' },
  { initials: 'BR', name: 'Bilal', role: 'Speaker', tint: '#FBEBDD' },
  { initials: 'SM', name: 'Sana', role: 'Speaker', tint: '#E2F1E8' },
  { initials: 'OF', name: 'Omar', role: 'Speaker', tint: '#EFE6F6' },
];

function SpeakingRings() {
  return (
    <>
      {[0, 0.6].map((delay) => (
        <motion.span
          key={delay}
          className="ring"
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: 1.55, opacity: 0 }}
          transition={{ duration: 1.3, repeat: Infinity, ease: 'easeOut', delay }}
        />
      ))}
    </>
  );
}

/** The hero's centrepiece: an example voice room that behaves like a live one. */
export function LiveRoomHero({ codeHtml }: { codeHtml: string }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number[]>([0]);
  const [listeners, setListeners] = useState(1284);
  const [rtt, setRtt] = useState(38);
  const [loss, setLoss] = useState(0.2);

  useEffect(() => {
    if (reduce) return;
    const talk = setInterval(() => {
      const a = Math.floor(Math.random() * people.length);
      const both = Math.random() < 0.25;
      setActive(both ? [a, (a + 1 + Math.floor(Math.random() * 3)) % people.length] : [a]);
    }, 1800);
    const crowd = setInterval(() => setListeners((n) => n + Math.floor(Math.random() * 4)), 1100);
    const net = setInterval(() => {
      setRtt(32 + Math.round(Math.random() * 16));
      setLoss(Math.round(Math.random() * 4) / 10);
    }, 2200);
    return () => {
      clearInterval(talk);
      clearInterval(crowd);
      clearInterval(net);
    };
  }, [reduce]);

  return (
    <div className="hero-visual">
      <motion.figure
        className="room room-live"
        style={{ margin: 0 }}
        initial={reduce ? false : { opacity: 0, y: 40, rotateX: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
        transition={{ duration: 1, ease: [0.2, 0.7, 0.2, 1], delay: 0.35 }}
        aria-label="Example voice room built with the SDK"
      >
        <div className="room-head">
          <span className="live-dot pulse" aria-hidden="true" />
          <span className="room-title">Evening cricket talk</span>
          <span className="room-count">
            4 on stage, <span className="tabular">{listeners.toLocaleString('en-US')}</span> listening
          </span>
        </div>
        <div className="room-stage">
          {people.map((p, i) => {
            const speaking = active.includes(i);
            return (
              <div className="speaker" key={p.name}>
                <div className="avatar-wrap">
                  {speaking && !reduce && <SpeakingRings />}
                  <motion.div
                    className="avatar"
                    style={{ background: p.tint }}
                    data-speaking={speaking}
                    animate={{ scale: speaking ? 1.06 : 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  >
                    {p.initials}
                  </motion.div>
                </div>
                <div className="speaker-name">{p.name}</div>
                <div className="speaker-role">{p.role}</div>
                <div className="levels" data-active={speaking} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            );
          })}
        </div>
        <div className="room-wave">
          <Waveform activity={active.length} height={40} />
        </div>
        <div className="room-code code-typing" dangerouslySetInnerHTML={{ __html: codeHtml }} />
      </motion.figure>

      <FloatChip className="chip-a" delay={1.2} period={5.5}>
        <span className="chip-label">Round trip</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.strong key={rtt} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }}>
            {rtt} ms
          </motion.strong>
        </AnimatePresence>
      </FloatChip>
      <FloatChip className="chip-b" delay={1.5} period={6.2}>
        <span className="chip-dot good" aria-hidden="true" />
        <span className="chip-label">Packet loss</span>
        <strong className="tabular">{loss.toFixed(1)}%</strong>
      </FloatChip>
      <FloatChip className="chip-c" delay={1.8} period={4.8}>
        <span className="chip-dot" aria-hidden="true" />
        <span className="chip-label">Opus error correction on</span>
      </FloatChip>
    </div>
  );
}
