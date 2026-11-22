import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { Career } from '@/lib/game/career';
import type { GovEvent } from '@/lib/game/finance-schema';
import { usd } from '@/lib/game/campaign';
import type { Result } from '@/lib/game/support';
import {
  activeEvents, canDeclareEmergency, declareEmergency, eventOutlook, eventResponses, eventsOf, KIND_LABEL,
  respondToEvent, responsePlan, RESPONSE_LABEL, SEVERITY,
} from '@/lib/game/quarterly-events';

const signed = (n: number, money = false) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money ? usd(Math.abs(n)) : Math.abs(n)}`;
const tone = (n: number) => (n > 0 ? 'amt-in' : n < 0 ? 'amt-out' : '');

export function SeverityBadge({ e }: { e: Pick<GovEvent, 'severity' | 'kind'> }) {
  return <span className={`sev-badge ${e.kind === 'positive' ? 'sev-positive' : `sev-${e.severity}`}`}>{SEVERITY[e.severity].label}</span>;
}

export function EventsTab({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const active = activeEvents(career);
  const [open, setOpen] = useState<string | null>(null);
  const target = active.find(e => e.id === open) ?? null;
  return <div aria-label="Events">
    <div className="panel-row"><small className="mini-note">{active.length ? `${active.length} active event${active.length === 1 ? '' : 's'}` : 'No active events this quarter.'}</small><HistorySheet career={career} /></div>
    <div className="grid gap-2 mt-2">{active.map(e => <EventCard key={e.id} career={career} e={e} onRespond={() => setOpen(e.id)} onEmergency={() => onResult(declareEmergency(career, e.id))} />)}</div>
    {target && <ResponseDialog career={career} e={target} onClose={() => setOpen(null)} onResult={r => { onResult(r); if (r.ok) setOpen(null); }} />}
  </div>;
}

function EventCard({ career, e, onRespond, onEmergency }: { career: Career; e: GovEvent; onRespond: () => void; onEmergency: () => void }) {
  const o = eventOutlook(career, e), positive = e.kind === 'positive';
  return <article className={`event-card ${positive ? 'is-positive' : 'is-crisis'}`} aria-label={e.name}>
    <div className="panel-row"><b>{e.name}</b><SeverityBadge e={e} /></div>
    <div className="event-tags mini-note"><span>{KIND_LABEL[e.kind]}</span><span>· {e.remaining} qtr{e.remaining === 1 ? '' : 's'} left</span>{e.emergency && <span className="amt-out">· State of Emergency</span>}{e.response && <span>· {RESPONSE_LABEL[e.response] ?? e.response}</span>}</div>
    <p className="mini-note">{e.detail}</p>
    <div className="mini-stats">
      {positive ? <><span>Treasury gain <b className="amt-in">{signed(e.treasury, true)}</b></span><span>Mood lift <b className="amt-in">{signed(e.pressure)}</b></span><span>Approval <b className={tone(e.approval)}>{signed(e.approval)}</b></span></>
        : <><span>Mood/qtr <b className={tone(o.mood)}>{signed(o.mood)}</b></span><span>Treasury/qtr <b className={tone(o.treasury)}>{o.treasury ? signed(o.treasury, true) : '—'}</b></span><span>Approval/qtr <b className={tone(o.approval)}>{o.approval ? signed(o.approval) : '—'}</b></span></>}
    </div>
    {!positive && e.severity === 'low' && !e.response && <small className="mini-note">Departments can absorb this without intervention.</small>}
    {!positive && <div className="flex gap-2">
      {!e.response && e.severity !== 'low' && <Button size="sm" variant="game" className="flex-1" onClick={onRespond}>Choose response</Button>}
      {canDeclareEmergency(career, e) && <Button size="sm" variant="gameOutline" className="flex-1" onClick={onEmergency} title="Response costs −30%, one quarter shorter; business −4, employment −2">Declare State of Emergency</Button>}
    </div>}
  </article>;
}

function ResponseDialog({ career, e, onClose, onResult }: { career: Career; e: GovEvent; onClose: () => void; onResult: (r: Result) => void }) {
  const options = eventResponses(career, e.id);
  const [pick, setPick] = useState<string | null>(null);
  const chosen = options.find(o => o.id === pick);
  const plan = chosen ? responsePlan(e, chosen.id) : null;
  return <Dialog open onOpenChange={v => !v && onClose()}>
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{e.name}</DialogTitle><DialogDescription>{SEVERITY[e.severity].label} · {KIND_LABEL[e.kind]}{e.emergency ? ' · emergency pricing (−30%)' : ''}</DialogDescription></DialogHeader>
      <div className="grid gap-2" role="radiogroup" aria-label="Response options">
        {options.map(o => <Button key={o.id} role="radio" aria-checked={pick === o.id} variant={pick === o.id ? 'game' : 'gameOutline'} className="h-auto flex-col items-start py-2 text-left whitespace-normal" disabled={o.disabled} onClick={() => setPick(o.id)}>
          <span>{o.label}</span><small>{o.cost ? usd(o.cost) : 'No cost'} · {o.actions ? `${o.actions} action` : 'no action'}</small><small className="opacity-80">{o.disabled ? o.unavailable : o.hint}</small>
        </Button>)}
      </div>
      {chosen && plan && <div className="mini-stats mt-2" aria-label="Expected impact">
        <span>Cost <b className={chosen.cost ? 'amt-out' : ''}>{chosen.cost ? `−${usd(chosen.cost)}` : '—'}</b></span>
        <span>Actions <b>{chosen.actions}</b></span>
        <span>Approval <b className={tone(plan.appr)}>{signed(plan.appr)}</b></span>
        <span>Mood/qtr <b className={tone(plan.pressure)}>{signed(plan.pressure)}</b></span>
        <span>Duration <b>{plan.remaining} qtr{plan.remaining === 1 ? '' : 's'}</b></span>
      </div>}
      <Button variant="game" className="w-full mt-2" disabled={!chosen || chosen.disabled} onClick={() => chosen && onResult(respondToEvent(career, e.id, chosen.id))}>Confirm response</Button>
    </DialogContent>
  </Dialog>;
}

function HistorySheet({ career }: { career: Career }) {
  const past = eventsOf(career).filter(e => e.status !== 'active');
  return <Sheet><SheetTrigger asChild><Button size="sm" variant="gameOutline">Event history</Button></SheetTrigger>
    <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
      <SheetHeader><SheetTitle>Event history</SheetTitle></SheetHeader>
      {past.length ? <div className="grid gap-2 mt-2">{past.map(e => <article key={e.id} className={`event-card ${e.kind === 'positive' ? 'is-positive' : 'is-crisis'}`} aria-label={`${e.name} history`}>
        <div className="panel-row"><b>{e.name}</b><SeverityBadge e={e} /></div>
        <small className="mini-note">{quarterOf(e.date)} · {e.response ? RESPONSE_LABEL[e.response] ?? e.response : e.kind === 'positive' ? 'Windfall' : 'No response'}</small>
        <div className="mini-stats"><span>Treasury <b className={tone(e.treasury)}>{signed(e.treasury, true)}</b></span><span>Happiness <b className={tone(e.happiness)}>{signed(e.happiness)}</b></span><span>Approval <b className={tone(e.approval)}>{signed(e.approval)}</b></span></div>
        <b className={e.outcome.startsWith('Mismanaged') ? 'amt-out' : 'amt-in'}>{e.outcome}</b>
      </article>)}</div> : <p className="mini-note mt-2">No events have concluded yet.</p>}
    </SheetContent></Sheet>;
}

export const quarterOf = (date: string) => { const [y, m] = date.split('-').map(Number); return `Q${Math.floor(((m ?? 1) - 1) / 3) + 1} ${y}`; };
