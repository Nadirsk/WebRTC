'use client';

import { useEffect, useRef } from 'react';

type Node = { x: number; y: number; vx: number; vy: number; r: number };
type Packet = { a: number; b: number; t: number; speed: number };

const LINK = 150;

/**
 * Drifting network nodes with data packets hopping between neighbours.
 * Pauses off-screen; draws a single still frame when the user prefers reduced motion.
 */
export function HeroCanvas({ className = 'hero-canvas' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let nodes: Node[] = [];
    let packets: Packet[] = [];

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(80, Math.max(24, (w * h) / 14000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.6 + 1.1,
      }));
      packets = [];
    };

    const draw = (animateStep: boolean) => {
      ctx.clearRect(0, 0, w, h);

      if (animateStep) {
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > w) n.vx *= -1;
          if (n.y < 0 || n.y > h) n.vy *= -1;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(36, 73, 168, ${(1 - d / LINK) * 0.28})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx.fillStyle = 'rgba(36, 73, 168, 0.55)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!animateStep) return;

      if (packets.length < 16 && Math.random() < 0.12) {
        const a = Math.floor(Math.random() * nodes.length);
        const near: number[] = [];
        for (let j = 0; j < nodes.length; j++) {
          if (j !== a && Math.hypot(nodes[a]!.x - nodes[j]!.x, nodes[a]!.y - nodes[j]!.y) < LINK) near.push(j);
        }
        if (near.length) packets.push({ a, b: near[Math.floor(Math.random() * near.length)]!, t: 0, speed: 0.012 + Math.random() * 0.012 });
      }

      packets = packets.filter((p) => {
        p.t += p.speed;
        const a = nodes[p.a]!;
        const b = nodes[p.b]!;
        if (p.t >= 1 || Math.hypot(a.x - b.x, a.y - b.y) > LINK * 1.3) return false;
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 10);
        glow.addColorStop(0, 'rgba(200, 99, 15, 0.55)');
        glow.addColorStop(1, 'rgba(200, 99, 15, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#C8630F';
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
    };

    const loop = () => {
      if (visible) draw(true);
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduce) draw(false);
    else raf = requestAnimationFrame(loop);

    const onResize = () => {
      resize();
      if (reduce) draw(false);
    };
    window.addEventListener('resize', onResize);
    const observer = new IntersectionObserver(([entry]) => (visible = Boolean(entry?.isIntersecting)));
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
