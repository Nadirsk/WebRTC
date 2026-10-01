import { regions, regionStatusLabel } from '@/site.config';

// Equirectangular projection over the launch area (longitude -2°..114°, latitude 58°N..-4°).
const W = 900;
const H = 480;
const project = (lon: number, lat: number) => ({
  x: Math.round(((lon + 2) / 116) * W),
  y: Math.round(((58 - lat) / 62) * H),
});

const links: { from: string; to: string; planned?: boolean; dur: number }[] = [
  { from: 'DXB', to: 'FRA', dur: 3.2 },
  { from: 'DXB', to: 'BOM', dur: 2.2 },
  { from: 'BOM', to: 'SIN', dur: 2.8 },
  { from: 'FRA', to: 'BOM', dur: 3.8 },
  { from: 'DXB', to: 'KHI', planned: true, dur: 1.8 },
];

const label: Record<string, { dx: number; dy: number; anchor: 'start' | 'end' | 'middle' }> = {
  FRA: { dx: 16, dy: 6, anchor: 'start' },
  DXB: { dx: -16, dy: 6, anchor: 'end' },
  KHI: { dx: 0, dy: -42, anchor: 'middle' },
  BOM: { dx: 16, dy: 22, anchor: 'start' },
  SIN: { dx: -16, dy: 6, anchor: 'end' },
};

function arc(a: { x: number; y: number }, b: { x: number; y: number }, bow = 0.22) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  return `M${a.x},${a.y} Q${mx},${my - dist * bow} ${b.x},${b.y}`;
}

/**
 * Dark map of the launch regions. Packets travel both ways along each backbone link
 * (SVG animateMotion, so no JavaScript), and region nodes pulse. Motion stops under reduced-motion.
 */
export function NetworkShowcase() {
  const pos = Object.fromEntries(regions.map((r) => [r.code, project(r.lon, r.lat)]));

  return (
    <div className="netmap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Launch regions: Dubai first, then Mumbai, Frankfurt and Singapore, with a Karachi data centre under evaluation. Data moves between the regions over our backbone."
      >
        <defs>
          <pattern id="net-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.1" fill="rgba(160, 182, 214, 0.22)" />
          </pattern>
          <radialGradient id="net-glow">
            <stop offset="0" stopColor="rgba(240, 153, 77, 0.55)" />
            <stop offset="1" stopColor="rgba(240, 153, 77, 0)" />
          </radialGradient>
          <filter id="net-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <rect width={W} height={H} fill="url(#net-dots)" />

        {links.map((l) => {
          const d = arc(pos[l.from]!, pos[l.to]!, l.from === 'FRA' ? 0.12 : 0.22);
          return (
            <g key={`${l.from}-${l.to}`}>
              <path d={d} fill="none" stroke="rgba(240, 153, 77, 0.18)" strokeWidth={6} filter="url(#net-blur)" />
              <path
                d={d}
                fill="none"
                stroke={l.planned ? 'rgba(240, 153, 77, 0.5)' : '#F0994D'}
                strokeWidth={l.planned ? 1.5 : 2}
                strokeDasharray={l.planned ? '5 6' : undefined}
                strokeLinecap="round"
                className={l.planned ? undefined : 'net-flow'}
              />
              {!l.planned && (
                <>
                  <circle r={4} fill="#FFD2A8" className="net-packet">
                    <animateMotion dur={`${l.dur}s`} repeatCount="indefinite" path={d} />
                  </circle>
                  <circle r={3} fill="#FFFFFF" className="net-packet">
                    <animateMotion
                      dur={`${l.dur * 1.15}s`}
                      begin={`${l.dur / 2}s`}
                      repeatCount="indefinite"
                      path={d}
                      keyPoints="1;0"
                      keyTimes="0;1"
                      calcMode="linear"
                    />
                  </circle>
                </>
              )}
            </g>
          );
        })}

        {regions.map((r) => {
          const p = pos[r.code]!;
          const o = label[r.code]!;
          const first = r.status === 'first';
          return (
            <g key={r.code}>
              <circle cx={p.x} cy={p.y} r={first ? 34 : 22} fill="url(#net-glow)" />
              {r.status !== 'evaluating' && (
                <circle cx={p.x} cy={p.y} r={first ? 9 : 7} fill="none" stroke="#F0994D" strokeWidth={1.5} className="net-pulse" />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={first ? 8 : 6}
                fill={first ? '#F0994D' : '#0C1522'}
                stroke={r.status === 'evaluating' ? '#8FA3BC' : '#F0994D'}
                strokeWidth={2}
                strokeDasharray={r.status === 'evaluating' ? '3 2' : undefined}
              />
              <text x={p.x + o.dx} y={p.y + o.dy} textAnchor={o.anchor} className="net-code">
                {r.code}
              </text>
              <text x={p.x + o.dx} y={p.y + o.dy + 19} textAnchor={o.anchor} className="net-city">
                {r.city}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="net-legend">
        {regions.map((r) => (
          <li key={r.code}>
            <span className="net-legend-code">{r.code}</span>
            <span>{r.city}</span>
            <span className="net-legend-status" data-status={r.status}>
              {regionStatusLabel[r.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
