'use client';

import { useEffect, useRef } from 'react';

type Props = {
  /** 0 = silence, 1 = one person talking, 2+ = lively. */
  activity: number;
  bars?: number;
  color?: string;
  quietColor?: string;
  height?: number;
  className?: string;
};

/** Rounded level bars driven by smoothed noise, like a live audio meter. */
export function Waveform({ activity, bars = 56, color = '#C8630F', quietColor = '#D5DCE4', height = 44, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activityRef = useRef(activity);
  activityRef.current = activity;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const levels = new Array(bars).fill(0.1);
    const targets = new Array(bars).fill(0.1);
    let raf = 0;
    let visible = true;
    let frame = 0;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const w = canvas.getBoundingClientRect().width;
      const act = Math.min(1.4, activityRef.current);
      frame++;
      if (frame % 5 === 0) {
        for (let i = 0; i < bars; i++) {
          const envelope = Math.sin((i / (bars - 1)) * Math.PI) * 0.7 + 0.3;
          targets[i] = act === 0 ? 0.06 + Math.random() * 0.05 : (0.15 + Math.random() * 0.85) * envelope * Math.min(1, act);
        }
      }
      ctx.clearRect(0, 0, w, height);
      const gap = 3;
      const bw = Math.max(2, (w - gap * (bars - 1)) / bars);
      for (let i = 0; i < bars; i++) {
        levels[i] += (targets[i] - levels[i]) * 0.22;
        const bh = Math.max(3, levels[i] * height);
        ctx.fillStyle = act === 0 ? quietColor : color;
        ctx.globalAlpha = act === 0 ? 1 : 0.35 + levels[i] * 0.65;
        const x = i * (bw + gap);
        const y = (height - bh) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, bw / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      if (visible) draw();
      raf = requestAnimationFrame(loop);
    };

    size();
    if (reduce) {
      for (let i = 0; i < bars; i++) targets[i] = levels[i] = 0.2 + Math.sin(i * 0.7) * 0.15 + 0.2;
      draw();
    } else {
      raf = requestAnimationFrame(loop);
    }

    const observer = new IntersectionObserver(([entry]) => (visible = Boolean(entry?.isIntersecting)));
    observer.observe(canvas);
    window.addEventListener('resize', size);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', size);
    };
  }, [bars, color, quietColor, height]);

  return <canvas ref={ref} className={className} style={{ width: '100%', height, display: 'block' }} aria-hidden="true" />;
}
