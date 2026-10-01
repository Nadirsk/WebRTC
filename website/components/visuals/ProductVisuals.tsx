'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Waveform } from './Waveform';

/** Cycles an index every `ms`, unless the user prefers reduced motion. */
function useTicker(count: number, ms: number) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms, reduce]);
  return i;
}

/* ---------------------------------------------------------------- voice */

const callers = [
  { initials: 'ZA', name: 'Zara', tint: '#E3E9F8' },
  { initials: 'HM', name: 'Hamza', tint: '#FBEBDD' },
];

export function VoiceVisual() {
  const speaker = useTicker(2, 1900);
  const reduce = useReducedMotion();
  return (
    <div className="pv pv-voice">
      <div className="pv-call">
        {callers.map((c, i) => (
          <div className="pv-caller" key={c.name}>
            <div className="avatar-wrap large">
              {speaker === i && !reduce && (
                <>
                  <motion.span className="ring" initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 1.4, repeat: Infinity }} />
                  <motion.span className="ring" initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.7 }} />
                </>
              )}
              <div className="avatar" style={{ background: c.tint }} data-speaking={speaker === i}>
                {c.initials}
              </div>
            </div>
            <strong>{c.name}</strong>
            <span className="small muted">{speaker === i ? 'Speaking' : 'Listening'}</span>
          </div>
        ))}
        <div className="pv-link" aria-hidden="true">
          <motion.span
            className="pv-packet"
            animate={reduce ? undefined : { left: speaker === 0 ? ['0%', '100%'] : ['100%', '0%'] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      </div>
      <Waveform activity={1} height={56} bars={64} />
      <div className="pv-tags">
        <span>Opus 48 kHz</span>
        <span>Error correction</span>
        <span>Silence suppression</span>
        <span className="pv-timer">04:12</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- video */

const tiles = [
  { name: 'Dr. Farah', a: '#C9D6F2', b: '#E8EEFB' },
  { name: 'Usman', a: '#F4D5BB', b: '#FBEFE4' },
  { name: 'Mariam', a: '#C8E6D4', b: '#EAF6EF' },
  { name: 'Ali', a: '#DCCDEB', b: '#F3EDF8' },
];

export function VideoVisual() {
  const active = useTicker(4, 1600);
  const camOff = useTicker(3, 3200);
  return (
    <div className="pv pv-video">
      {tiles.map((t, i) => {
        const off = i === 3 && camOff === 1;
        return (
          <motion.div
            key={t.name}
            className="pv-tile"
            data-active={active === i}
            style={{ background: off ? '#1B2533' : `linear-gradient(160deg, ${t.a}, ${t.b})` }}
            layout
          >
            <AnimatePresence mode="wait" initial={false}>
              {off ? (
                <motion.div key="off" className="pv-tile-off" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="avatar" style={{ background: '#2B3A4C', color: '#E3E9EF' }}>AL</div>
                  <span>Camera off</span>
                </motion.div>
              ) : (
                <motion.div key="on" className="pv-person" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden="true">
                  <span className="head" />
                  <span className="body" />
                </motion.div>
              )}
            </AnimatePresence>
            <span className="pv-name">{t.name}</span>
            {active === i && <span className="pv-mic" aria-hidden="true" />}
          </motion.div>
        );
      })}
      <div className="pv-hd">HD 720p</div>
    </div>
  );
}

/* ---------------------------------------------------------------- live */

const hosts = ['NK', 'RS', 'TA'];

export function LiveVisual() {
  const reduce = useReducedMotion();
  const [audience, setAudience] = useState(42);
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const grow = setInterval(() => setAudience((n) => (n >= 96 ? 42 : n + 3)), 450);
    const invite = setInterval(() => setInvited((v) => !v), 3500);
    return () => {
      clearInterval(grow);
      clearInterval(invite);
    };
  }, [reduce]);

  return (
    <div className="pv pv-live">
      <div className="pv-stage">
        <span className="pv-stage-label">On stage</span>
        <div className="pv-stage-row">
          {hosts.map((h, i) => (
            <div className="avatar-wrap" key={h}>
              {i === 0 && !reduce && (
                <motion.span className="ring" initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 1.3, repeat: Infinity }} />
              )}
              <div className="avatar" data-speaking={i === 0}>
                {h}
              </div>
            </div>
          ))}
          <AnimatePresence>
            {invited && (
              <motion.div
                key="guest"
                className="avatar guest"
                initial={{ opacity: 0, y: 110, scale: 0.4 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 110, scale: 0.4 }}
                transition={{ type: 'spring', stiffness: 160, damping: 18 }}
              >
                You
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="pv-audience">
        <div className="pv-dots" aria-hidden="true">
          {Array.from({ length: 96 }, (_, i) => (
            <motion.span key={i} animate={{ opacity: i < audience ? 1 : 0.15, scale: i < audience ? 1 : 0.6 }} transition={{ duration: 0.3 }} />
          ))}
        </div>
        <div className="pv-audience-meta">
          <strong className="tabular">{(audience * 37).toLocaleString('en-US')}</strong>
          <span className="small muted">listening</span>
        </div>
      </div>
      <AnimatePresence>
        {invited && (
          <motion.div className="pv-toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            You were invited on stage
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- recording */

const BARS = 48;
const shape = Array.from({ length: BARS }, (_, i) => 0.25 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.4)) * 0.75);

export function RecordingVisual() {
  const reduce = useReducedMotion();
  const [progress, setProgress] = useState(reduce ? BARS : 0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setProgress((p) => (p >= BARS + 10 ? 0 : p + 1)), 110);
    return () => clearInterval(t);
  }, [reduce]);

  const done = progress >= BARS;
  const seconds = Math.min(progress, BARS) * 5;
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="pv pv-rec">
      <div className="pv-rec-head">
        <span className={`rec-dot ${done ? 'stopped' : ''}`} aria-hidden="true" />
        <strong>{done ? 'Recording saved' : 'Recording'}</strong>
        <span className="pv-timer tabular">{time}</span>
      </div>
      <div className="pv-track" aria-hidden="true">
        {shape.map((h, i) => (
          <span key={i} style={{ height: `${h * 100}%`, opacity: i < progress ? 1 : 0.18 }} />
        ))}
        {!done && <span className="pv-playhead" style={{ left: `${(Math.min(progress, BARS) / BARS) * 100}%` }} />}
      </div>
      <div className="pv-rec-rows">
        <div>
          <span className="small muted">Room</span>
          <span>consult-2291</span>
        </div>
        <div>
          <span className="small muted">Storage</span>
          <span>clinic-recordings</span>
        </div>
      </div>
      <AnimatePresence>
        {done && (
          <motion.div className="pv-toast webhook" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <code>recording.ready</code> sent to your server
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const productVisuals: Record<string, () => React.JSX.Element> = {
  'voice-calling': VoiceVisual,
  'video-calling': VideoVisual,
  'live-streaming': LiveVisual,
  'cloud-recording': RecordingVisual,
};
