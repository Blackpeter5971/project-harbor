import { useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { warMap, type MapSession } from '@/lib/game/civil-war/war-map';

const LABEL = { union: 'Union', border: 'Border', confederate: 'Confederate', territory: 'Territory' } as const;
const LEAN = { union: 'leaning Union', contested: 'contested', confederate: 'leaning South' } as const;
const T = 28, G = 3;

export function WarMapSheet({ session }: { session: MapSession }) {
  const m = warMap(session);
  const [sel, setSel] = useState<string | null>(null);
  const picked = m.states.find(s => s.id === sel);
  return <Sheet><SheetTrigger asChild><Button variant="gameOutline" size="sm"><MapIcon /> War Map</Button></SheetTrigger>
    <SheetContent side="bottom" className="ledger-1860 max-h-[85vh] overflow-y-auto">
      <SheetHeader><SheetTitle className="ledger-title">The Divided States</SheetTitle></SheetHeader>
      <svg className="war-map" viewBox={`0 0 ${12 * (T + G)} ${6 * (T + G)}`} role="img" aria-label="Map of state allegiances">
        {m.states.map(s => <g key={s.id} className={`wm-state is-${s.allegiance}${s.lean ? ` lean-${s.lean}` : ''}${sel === s.id ? ' is-selected' : ''}`} onClick={() => setSel(s.id)} role="button" tabIndex={0} aria-label={`${s.name}: ${LABEL[s.allegiance]}`} onKeyDown={e => e.key === 'Enter' && setSel(s.id)}>
          <rect x={s.col * (T + G)} y={s.row * (T + G)} width={T} height={T} rx={4} />
          <text x={s.col * (T + G) + T / 2} y={s.row * (T + G) + T / 2 + 3.5} textAnchor="middle">{s.id}</text>
        </g>)}
      </svg>
      <p className="ledger-sub mt-2">{picked ? `${picked.name} — ${LABEL[picked.allegiance]}${picked.lean ? ` (${LEAN[picked.lean]})` : ''}` : 'Tap a state for details.'}</p>
      <div className="wm-legend">{(Object.keys(LABEL) as (keyof typeof LABEL)[]).map(k => <span key={k} className={`wm-key is-${k}`}><i />{LABEL[k]} · {m.counts[k]}</span>)}</div>
      <p className="mini-note mt-2">Border states are {LEAN[m.lean]}. Raise Border State Loyalty to hold them.</p>
    </SheetContent></Sheet>;
}
