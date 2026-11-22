import { useMemo, useState } from 'react';
import type { Career } from '@/lib/game/career';
import { CHAMBER_NAMES, PARTY_COLOR, type ChamberId, type LegislatureParty, type Seating } from '@/lib/game/legislature-schema';

/** Party order left → right across the hemicycle. */
const ORDER: LegislatureParty[] = ['Democrat', 'Independent', 'Republican'];

/** Hemicycle seat positions: rows of concentric arcs, seats per row proportional to arc length, then filled by angle. */
export function hemicycle(seats: number) {
  const rows = Math.max(2, Math.min(12, Math.round(Math.sqrt(seats / 3))));
  const inner = 0.38, radii = Array.from({ length: rows }, (_, i) => inner + (1 - inner) * (i / (rows - 1)));
  const total = radii.reduce((t, r) => t + r, 0);
  const counts = radii.map(r => Math.floor((seats * r) / total));
  for (let i = rows - 1, left = seats - counts.reduce((t, n) => t + n, 0); left > 0; i = (i - 1 + rows) % rows, left--) counts[i]! += 1;
  const pts: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, i) => { const n = counts[i]!; for (let k = 0; k < n; k++) { const a = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * k) / (n - 1); pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), a }); } });
  pts.sort((p, q) => q.a - p.a || p.x - q.x);
  const dot = Math.min(0.06, ((1 - inner) / rows) * 0.42);
  return { pts, dot };
}

function Hemicycle({ seating }: { seating: Seating }) {
  const { pts, dot } = useMemo(() => hemicycle(seating.seats), [seating.seats]);
  const parties = ORDER.flatMap(p => Array.from({ length: seating.composition[p] }, () => p));
  return <svg viewBox="-1.08 -1.08 2.16 1.16" className="chamber-svg" role="img" aria-label={`${CHAMBER_NAMES[seating.chamber]} seating: ${ORDER.map(p => `${seating.composition[p]} ${p}`).join(', ')}`}>
    {pts.map((p, i) => <circle key={i} cx={p.x} cy={-p.y} r={dot} className={`seat ${PARTY_COLOR[parties[i] ?? 'Independent']}`} />)}
    <line x1="0" y1="-1.06" x2="0" y2="-0.3" className="majority-line" />
    <text x="0" y="-0.08" textAnchor="middle" className="chamber-total">{seating.seats}</text>
  </svg>;
}

export function ChamberChart({ career }: { career: Career }) {
  const L = career.legislature;
  const [view, setView] = useState<ChamberId | null>(null);
  if (!L || !L.seating.length) return null;
  const s = L.seating.find(x => x.chamber === view) ?? L.seating[0]!;
  const gov = s.composition[s.governing], opp = s.seats - gov, needed = Math.max(0, s.majorityThreshold - gov);
  return <section className="game-card p-4 chamber-chart" aria-label="Chamber seating chart">
    <div className="panel-row"><h3 className="section-label">Chamber seating</h3>
      {L.seating.length > 1 && <div className="chamber-toggle" role="tablist">{L.seating.map(x => <button key={x.chamber} role="tab" aria-selected={x.chamber === s.chamber} onClick={() => setView(x.chamber)}>{CHAMBER_NAMES[x.chamber].replace('U.S. ', '')} · {x.seats}</button>)}</div>}
    </div>
    <Hemicycle seating={s} />
    <div className="chamber-legend">{ORDER.map(p => <span key={p}><i className={`seat-key ${PARTY_COLOR[p]}`} />{p} <b>{s.composition[p]}</b></span>)}</div>
    <div className="mini-stats mt-2">
      <span>Governing ({s.governing}) <b>{gov}</b></span>
      <span>Opposition <b>{opp}</b></span>
      <span>Majority <b>{s.majorityThreshold}</b></span>
      <span>{needed ? 'Seats needed' : 'Margin'} <b>{needed || gov - s.majorityThreshold + 1}</b></span>
    </div>
  </section>;
}
