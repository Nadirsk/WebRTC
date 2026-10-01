'use client';

import { useEffect, useRef } from 'react';
import { regions } from '@/site.config';

type Vec = [number, number, number];

const DEG = Math.PI / 180;
const toVec = (lat: number, lon: number): Vec => [
  Math.cos(lat * DEG) * Math.cos(lon * DEG),
  Math.cos(lat * DEG) * Math.sin(lon * DEG),
  Math.sin(lat * DEG),
];

/** Spherical interpolation between two unit vectors. */
function slerp(a: Vec, b: Vec, t: number): Vec {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return a;
  const s = Math.sin(omega);
  const k1 = Math.sin((1 - t) * omega) / s;
  const k2 = Math.sin(t * omega) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

const LINKS: [string, string][] = [
  ['DXB', 'FRA'],
  ['DXB', 'BOM'],
  ['BOM', 'SIN'],
  ['FRA', 'BOM'],
  ['DXB', 'KHI'],
  ['FRA', 'SIN'],
];

type Props = { className?: string; labels?: boolean };

/**
 * A dotted globe drawn on canvas with an orthographic projection. It sways around our launch
 * regions (so they stay in view), follows the pointer a little, and sends packets along great-circle
 * arcs between regions. Still frame under reduced motion; paused off-screen.
 */
export function Globe({ className = 'globe', labels = true }: Props) {
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
    let pointer = 0;
    let pointerTarget = 0;
    const start = performance.now();

    // Evenly spread points over the sphere (Fibonacci lattice).
    const N = 1800;
    const dots: Vec[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const z = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - z * z);
      const th = golden * i;
      dots.push([Math.cos(th) * r, Math.sin(th) * r, z]);
    }

    const regionVecs = Object.fromEntries(regions.map((r) => [r.code, toVec(r.lat, r.lon)]));
    const packets = LINKS.flatMap(([a, b], i) => [
      { a, b, t: (i * 0.23) % 1, speed: 0.004 + (i % 3) * 0.0012 },
      { a: b, b: a, t: (i * 0.41 + 0.5) % 1, speed: 0.0035 + (i % 2) * 0.0015 },
    ]);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      pointer += (pointerTarget - pointer) * 0.05;
      const lon0 = (62 + Math.sin(t * 0.12) * 28 + pointer * 14) * DEG;
      const lat0 = 22 * DEG;
      const R = Math.min(w, h) * 0.42;
      const cx = w / 2;
      const cy = h / 2;

      // Rotate world so (lat0, lon0) faces the viewer, then project orthographically.
      const project = (v: Vec, lift = 1) => {
        const cosL = Math.cos(-lon0);
        const sinL = Math.sin(-lon0);
        const x1 = v[0] * cosL - v[1] * sinL;
        const y1 = v[0] * sinL + v[1] * cosL;
        const z1 = v[2];
        const cosT = Math.cos(-lat0);
        const sinT = Math.sin(-lat0);
        const depth = x1 * cosT - z1 * sinT; // toward viewer
        const up = x1 * sinT + z1 * cosT;
        return { x: cx + y1 * R * lift, y: cy - up * R * lift, depth };
      };

      ctx.clearRect(0, 0, w, h);

      // atmosphere
      const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.35);
      halo.addColorStop(0, 'rgba(80, 130, 230, 0.28)');
      halo.addColorStop(1, 'rgba(80, 130, 230, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
      ctx.fill();

      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, '#1C2E4E');
      body.addColorStop(1, '#0B1422');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      for (const d of dots) {
        const p = project(d);
        if (p.depth <= 0) continue;
        ctx.fillStyle = `rgba(150, 180, 235, ${0.12 + p.depth * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.6 + p.depth * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // arcs
      for (const [a, b] of LINKS) {
        const va = regionVecs[a]!;
        const vb = regionVecs[b]!;
        const planned = a === 'DXB' && b === 'KHI';
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 48; i++) {
          const f = i / 48;
          const p = project(slerp(va, vb, f), 1 + Math.sin(Math.PI * f) * 0.16);
          if (p.depth < -0.15) {
            started = false;
            continue;
          }
          if (!started) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
          started = true;
        }
        ctx.strokeStyle = planned ? 'rgba(240, 153, 77, 0.35)' : 'rgba(240, 153, 77, 0.7)';
        ctx.lineWidth = planned ? 1 : 1.6;
        ctx.setLineDash(planned ? [4, 5] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // packets
      for (const pk of packets) {
        if (!reduce) pk.t = (pk.t + pk.speed) % 1;
        if (pk.a === 'KHI' || pk.b === 'KHI') continue;
        const p = project(slerp(regionVecs[pk.a]!, regionVecs[pk.b]!, pk.t), 1 + Math.sin(Math.PI * pk.t) * 0.16);
        if (p.depth < -0.15) continue;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
        g.addColorStop(0, 'rgba(255, 210, 168, 0.9)');
        g.addColorStop(1, 'rgba(255, 210, 168, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // regions
      for (const r of regions) {
        const p = project(regionVecs[r.code]!);
        if (p.depth <= 0) continue;
        const first = r.status === 'first';
        const pulse = reduce ? 0.5 : (t * 0.8 + r.lon / 100) % 1;
        if (r.status !== 'evaluating') {
          ctx.strokeStyle = `rgba(240, 153, 77, ${0.7 * (1 - pulse)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5 + pulse * 18, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = r.status === 'evaluating' ? '#8FA3BC' : first ? '#F0994D' : '#FFD2A8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, first ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
        if (labels) {
          ctx.font = '600 12px ui-monospace, Consolas, monospace';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
          const left = r.code === 'DXB' || r.code === 'SIN';
          ctx.textAlign = left ? 'right' : 'left';
          const dy = r.code === 'KHI' ? -12 : r.code === 'BOM' ? 16 : 4;
          ctx.fillText(r.code, p.x + (left ? -10 : 10), p.y + dy);
        }
      }
    };

    const loop = (now: number) => {
      if (visible) frame(now);
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduce) frame(start);
    else raf = requestAnimationFrame(loop);

    const onMove = (e: PointerEvent) => {
      pointerTarget = (e.clientX / window.innerWidth - 0.5) * 2;
    };
    const onResize = () => {
      resize();
      if (reduce) frame(performance.now());
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', onResize);
    const observer = new IntersectionObserver(([entry]) => (visible = Boolean(entry?.isIntersecting)));
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
    };
  }, [labels]);

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label="Globe showing our launch regions, Dubai, Mumbai, Frankfurt and Singapore, with a Karachi data centre under evaluation, and data moving between them."
    />
  );
}
