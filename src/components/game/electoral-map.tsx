import { useEffect, useMemo, useState } from 'react';
import { geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import statesTopo from 'us-atlas/states-albers-10m.json';
import { Button } from '@/components/ui/button';

/** Real state outlines, pre-projected (Albers USA, 975×610) by us-atlas. Built once at module load. */
const topo = statesTopo as unknown as Topology<{ states: GeometryCollection<{ name: string }> }>;
const path = geoPath();
const STATE_PATHS: { name: string; d: string }[] = feature(topo, topo.objects.states).features
  .map(f => ({ name: f.properties.name, d: path(f) ?? '' }));
const BORDERS = path(mesh(topo, topo.objects.states, (a, b) => a !== b)) ?? '';

export const BATTLEGROUNDS = ['Pennsylvania', 'Georgia', 'Wisconsin', 'Michigan', 'Arizona', 'Nevada', 'North Carolina'];
const partyClass = (party?: string) => party === 'Democrat' ? 'dem' : party === 'Republican' ? 'rep' : party ? 'ind' : 'none';

export type MapState = { state: string; party?: string | undefined; ev: number; label?: string | undefined; faded?: boolean | undefined };

export function UsTileMap({ states, highlight }: { states: MapState[]; highlight?: string | null | undefined }) {
  const byName = useMemo(() => new Map(states.map(s => [s.state, s])), [states]);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const hs = hover ? byName.get(hover.name) : undefined;
  return <div className="ec-map-wrap" onMouseLeave={() => setHover(null)}>
    <svg className="ec-map" viewBox="0 0 975 610" role="img" aria-label="United States electoral map">
      {STATE_PATHS.map(({ name, d }) => {
        const s = byName.get(name);
        return <path key={name} d={d} tabIndex={0} aria-label={`${name}, ${s?.ev ?? 0} electoral votes${s?.label ? `, ${s.label}` : ''}`}
          className={`ec-state ${partyClass(s?.party)}${s?.faded ? ' faded' : ''}${highlight === name ? ' hot' : ''}`}
          onMouseMove={e => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ name, x: e.clientX - r.left, y: e.clientY - r.top }); }}
          onFocus={() => setHover({ name, x: 12, y: 12 })} onBlur={() => setHover(null)} />;
      })}
      <path className="ec-borders" d={BORDERS} />
    </svg>
    {hover && <div className="ec-tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
      <b>{hover.name}</b><span>{hs?.ev ?? 0} electoral votes</span><span>{hs?.label ?? 'Not yet called'}</span>
    </div>}
  </div>;
}

export function EvBar({ left, right, leftLabel, rightLabel, leftParty, rightParty }: { left: number; right: number; leftLabel: string; rightLabel: string; leftParty?: string | undefined; rightParty?: string | undefined }) {
  return <div className="ec-bar-wrap">
    <div className="ec-bar-labels"><span>{leftLabel} <b>{left}</b></span><span>270 to win</span><span><b>{right}</b> {rightLabel}</span></div>
    <div className="ec-bar"><i className={partyClass(leftParty)} style={{ width: `${(left / 538) * 100}%` }} /><i className={`right ${partyClass(rightParty)}`} style={{ width: `${(right / 538) * 100}%` }} /><span className="ec-270" /></div>
  </div>;
}

type Call = { state: string; name: string; party: string; ev: number; margin: number };

/** Election night: safe states called quickly (120ms), battlegrounds last with 800ms suspense pauses. */
export function ElectionNight({ calls, me }: { calls: Call[]; me: string }) {
  const order = useMemo(() => [...calls].sort((a, b) => {
    const ba = BATTLEGROUNDS.includes(a.state) ? 1 : 0, bb = BATTLEGROUNDS.includes(b.state) ? 1 : 0;
    return ba - bb || Math.abs(b.margin) - Math.abs(a.margin);
  }), [calls]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= order.length) return;
    const next = order[shown];
    const t = setTimeout(() => setShown(n => n + 1), next && BATTLEGROUNDS.includes(next.state) ? 800 : 120);
    return () => clearTimeout(t);
  }, [shown, order]);
  const called = order.slice(0, shown);
  const tally: Record<string, number> = {};
  for (const c of called) tally[c.name] = (tally[c.name] ?? 0) + c.ev;
  const names = [...new Set(calls.map(c => c.name))];
  const rival = names.filter(n => n !== me).sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))[0] ?? '';
  const last = called[called.length - 1];
  const victor = names.find(n => (tally[n] ?? 0) >= 270);
  const victorParty = calls.find(c => c.name === victor)?.party;
  const done = shown >= order.length;
  const states = useMemo(() => calls.map(c => called.includes(c) ? { state: c.state, ev: c.ev, party: c.party, label: `${c.name} +${Math.abs(c.margin)}` } : { state: c.state, ev: c.ev }), [calls, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="ec-night">
    <EvBar left={tally[me] ?? 0} right={tally[rival] ?? 0} leftLabel={me} rightLabel={rival} leftParty={calls.find(c => c.name === me)?.party} rightParty={calls.find(c => c.name === rival)?.party} />
    {victor && <div key={victor} className={`ec-victory ${partyClass(victorParty)}`} role="status">VICTORY CALL · {victor} wins the presidency with {tally[victor]} electoral votes</div>}
    <UsTileMap highlight={last?.state} states={states} />
    <p className="ec-ticker" aria-live="polite">{!last ? 'Polls are closing across the country…' : `${BATTLEGROUNDS.includes(last.state) ? 'BATTLEGROUND' : 'DECISION DESK'}: ${last.state} (${last.ev} EV) called for ${last.name}${Math.abs(last.margin) < 3 ? ' · razor-thin margin' : ''}`}</p>
    <div className="flex gap-2">{done ? <Button variant="gameOutline" size="sm" onClick={() => setShown(0)}>Replay election night</Button> : <Button variant="gameOutline" size="sm" onClick={() => setShown(order.length)}>Skip to final map</Button>}<span className="mini-note">{shown}/{order.length} states called</span></div>
  </div>;
}
