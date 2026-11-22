import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { usd } from '@/lib/game/campaign';
import { freshEvents, KIND_LABEL, eventOutlook } from '@/lib/game/quarterly-events';
import { SeverityBadge } from './events-panel';

/** Highlights crises and windfalls triggered by the quarter just settled. */
export function TurnEventHighlights({ career, onOpen }: { career: Career; onOpen: () => void }) {
  const fresh = freshEvents(career);
  if (!fresh.length) return null;
  return <section className="grid gap-2 mb-2" aria-label="New events this quarter">
    {fresh.map(e => { const positive = e.kind === 'positive', o = eventOutlook(career, e); return <article key={e.id} className={`event-card ${positive ? 'is-positive' : 'is-crisis'}`}>
      <div className="panel-row"><b>{positive ? '🎉' : '⚠️'} {e.name}</b><SeverityBadge e={e} /></div>
      <small className="mini-note">{KIND_LABEL[e.kind]} · {e.remaining} qtr{e.remaining === 1 ? '' : 's'}</small>
      <small className="mini-note">{positive ? <>Treasury <b className="amt-in">+{usd(e.treasury)}</b> · Approval <b className="amt-in">+{e.approval}</b> · Mood <b className="amt-in">+{e.pressure}</b></>
        : o.needsResponse ? <>If ignored: <b className="amt-out">−{usd(-o.treasury)}</b>/qtr · approval <b className="amt-out">{o.approval}</b> · mood <b className="amt-out">{o.mood}</b></> : <>Mood <b className="amt-out">{o.mood}</b>/qtr · departments can absorb it</>}</small>
    </article>; })}
    <Button size="sm" variant="gameOutline" onClick={onOpen}>Open Events tab</Button>
  </section>;
}
