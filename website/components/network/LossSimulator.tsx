'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';

const FRAMES = 64;
const TICK_MS = 110;

const envelope = (t: number) => 0.28 + 0.72 * Math.abs(Math.sin(t * 0.33) * Math.sin(t * 0.11 + 1.2));

type Frame = { t: number; lost: boolean };

/**
 * Simplified model of Opus in-band error correction: each packet also carries a rough copy of the
 * previous one, so a single lost packet is rebuilt from the next. Two or more lost in a row still
 * leave a gap. Real calls add retransmission and a jitter buffer on top of this.
 */
export function LossSimulator() {
  const id = useId();
  const reduce = useReducedMotion();
  const [loss, setLoss] = useState(15);
  const lossRef = useRef(loss);
  lossRef.current = loss;
  const [frames, setFrames] = useState<Frame[]>(() =>
    Array.from({ length: FRAMES }, (_, i) => ({ t: i, lost: false })),
  );
  const totals = useRef({ lost: 0, gaps: 0, count: 0 });

  useEffect(() => {
    totals.current = { lost: 0, gaps: 0, count: 0 };
    if (reduce) {
      // A deterministic still frame at the chosen loss level.
      setFrames(Array.from({ length: FRAMES }, (_, i) => ({ t: i, lost: ((i * 37) % 100) < loss })));
      return;
    }
  }, [loss, reduce]);

  const framesRef = useRef(frames);
  framesRef.current = frames;

  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => {
      const prev = framesRef.current;
      const last = prev[prev.length - 1]!;
      const decided = prev[prev.length - 2];
      // `decided` now has a known successor (`last`): it is a gap only if both were lost.
      if (decided) {
        totals.current.count++;
        if (decided.lost) totals.current.lost++;
        if (decided.lost && last.lost) totals.current.gaps++;
      }
      setFrames([...prev.slice(1), { t: last.t + 1, lost: Math.random() * 100 < lossRef.current }]);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [reduce]);

  const { lost, gaps, count } = totals.current;
  const pct = (n: number) => (count > 0 ? Math.round((n / count) * 1000) / 10 : 0);

  return (
    <div className="losssim">
      <div className="losssim-control">
        <label htmlFor={`${id}-loss`}>
          Packet loss on the network <strong className="tabular">{loss}%</strong>
        </label>
        <input
          id={`${id}-loss`}
          type="range"
          min={0}
          max={40}
          step={1}
          value={loss}
          onChange={(e) => setLoss(Number(e.target.value))}
        />
        <div className="losssim-scale small muted" aria-hidden="true">
          <span>0%</span>
          <span>Busy Wi-Fi</span>
          <span>Weak 4G</span>
          <span>40%</span>
        </div>
      </div>

      <div className="losssim-row">
        <span className="losssim-label">Without error correction</span>
        <div className="losssim-bars" aria-hidden="true">
          {frames.map((f) => (
            <i key={f.t} className={f.lost ? 'gap' : ''} style={{ height: `${envelope(f.t) * 100}%` }} />
          ))}
        </div>
      </div>
      <div className="losssim-row">
        <span className="losssim-label">With our audio (Opus error correction)</span>
        <div className="losssim-bars" aria-hidden="true">
          {frames.map((f, i) => {
            const next = frames[i + 1];
            const state = !f.lost ? '' : next === undefined ? 'pending' : next.lost ? 'gap' : 'fixed';
            return <i key={f.t} className={state} style={{ height: `${envelope(f.t) * 100}%` }} />;
          })}
        </div>
      </div>

      <dl className="losssim-stats">
        <div>
          <dt>Packets lost</dt>
          <dd className="tabular">{reduce ? `${loss}%` : `${pct(lost)}%`}</dd>
        </div>
        <div>
          <dt>Rebuilt from the next packet</dt>
          <dd className="tabular">{reduce ? '–' : `${pct(Math.max(0, lost - gaps))}%`}</dd>
        </div>
        <div>
          <dt>Still heard as a gap</dt>
          <dd className="tabular">{reduce ? '–' : `${pct(gaps)}%`}</dd>
        </div>
      </dl>
      <p className="small muted">
        Simplified model: single losses are rebuilt, back-to-back losses are not. Real calls also resend lost packets and
        smooth playback with a jitter buffer.
      </p>
    </div>
  );
}
