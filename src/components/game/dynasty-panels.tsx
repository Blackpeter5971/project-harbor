import { useState } from 'react';
import { Baby, BriefcaseBusiness, Crown, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/support';
import { CHILD_ATTEMPT_COST, MANAGER_PLANS, adultHeirs, childAvailability, conceptionOptions, dynastyOf, hireManager, legacyScore, passTorch, retireCareer, tryForChild, FERTILE_MIN, FERTILE_MAX, type ManagerTerm } from '@/lib/game/dynasty';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
type Act = (r: Result) => void;

/** Life → Circle & Family: try for a child with a spouse, partner or romantic interest. */
export function FamilyPlanning({ career, onResult }: { career: Career; onResult?: Act | undefined }) {
  const options = conceptionOptions(career);
  return <section aria-label="Grow your family" className="mt-3">
    <h3 className="section-label"><Baby className="inline size-4" /> Grow your family</h3>
    {options.length ? <div className="row-list">{options.map(o => { const a = childAvailability(career, o.id); return <Button key={o.id} variant="gameChoice" className="game-row h-auto whitespace-normal" disabled={!a.ok || !onResult} onClick={() => onResult?.(tryForChild(career, o.id))}>
      <div><b>Try for a child with {o.name}</b><p>{o.label} · 15% energy · {usd(CHILD_ATTEMPT_COST)}</p>{!a.ok && <p className="reqs">{a.reason}</p>}</div>
    </Button>; })}</div>
      : <p className="mini-note">Date someone or grow close to a romantic interest to start a family.</p>}
    <p className="mini-note mt-1">Mothers must be {FERTILE_MIN}–{FERTILE_MAX}. Children can carry on your political dynasty at 18.</p>
  </section>;
}

/** Politics → Political Activities: hire a manager that boosts activity rewards by 40%. */
export function ManagerCard({ career, onResult }: { career: Career; onResult: Act }) {
  const m = dynastyOf(career).manager;
  const active = m && m.remaining > 0;
  return <section aria-label="Political manager" className="mt-3">
    <h3 className="section-label"><BriefcaseBusiness className="inline size-4" /> Political manager</h3>
    {active ? <div className="game-row static"><div><b>Under contract <span className="tag-ok">+40% rewards</span></b><p>{m.remaining} of {m.quarters} quarters left · {usd(m.retainer)} retainer per quarter</p></div></div>
      : <div className="row-list">{(Object.keys(MANAGER_PLANS) as unknown as ManagerTerm[]).map(q => { const p = MANAGER_PLANS[q]; return <Button key={q} variant="gameChoice" className="game-row h-auto whitespace-normal" disabled={career.money < p.upfront} onClick={() => onResult(hireManager(career, Number(q) as ManagerTerm))}>
        <div><b>{p.label} · {q} quarters</b><p>Boosts reputation, network, influence and party loyalty gains from activities by 40%.</p></div>
        <span className="row-cost">{usd(p.upfront)} upfront<br /><small>+{usd(p.retainer)}/quarter</small></span>
      </Button>; })}</div>}
  </section>;
}

/** Politics menu → More from Politics: retire, or pass the torch to an adult child. */
export function RetireSection({ career, onResult }: { career: Career; onResult: Act }) {
  const [open, setOpen] = useState(false);
  const heirs = adultHeirs(career);
  return <section aria-label="More from Politics" className="mt-3">
    <h3 className="section-label">More from Politics</h3>
    <Button variant="gameChoice" className="politics-category" onClick={() => setOpen(true)}><span className="choice-icon"><Flag /></span><span className="politics-category-title">Retire from Politics</span></Button>
    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="retire-title" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2 id="retire-title">Retire from Politics</h2></div>
      <p>Your current legacy score is <b>{legacyScore(career)}</b>.</p>
      {heirs.length ? <div className="row-list mt-2">{heirs.map(h => <Button key={h.id} variant="game" className="w-full" onClick={() => { setOpen(false); onResult(passTorch(career, h.id)); }}><Crown /> Pass Torch to {h.name} ({h.age})</Button>)}</div>
        : <p className="mini-note">No adult child (18+) yet — you can only retire and end this career.</p>}
      <Button variant="gameOutline" className="w-full mt-2" onClick={() => { setOpen(false); onResult(retireCareer(career)); }}>Retire & End Career</Button>
      <Button variant="gameQuiet" className="w-full mt-1" onClick={() => setOpen(false)}>Cancel</Button>
    </section></div>}
  </section>;
}

/** Shown once a career has ended through retirement. */
export function LegacySummary({ career, onNew, onMenu }: { career: Career; onNew: () => void; onMenu: () => void }) {
  const r = dynastyOf(career).retired!;
  return <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="legacy-title">
    <div className="modal-head"><h2 id="legacy-title">{career.character.name} · Final legacy</h2></div>
    <p className="stat-value">{r.legacy}<span className="text-muted-foreground text-xs"> legacy score</span></p>
    <ul className="mini-note">{r.summary.map(l => <li key={l}>• {l}</li>)}</ul>
    {dynastyOf(career).ancestors.length > 0 && <p className="mini-note mt-2">Family line: {dynastyOf(career).ancestors.map(a => `${a.name} (${a.legacy})`).join(' → ')}</p>}
    <Button variant="game" className="w-full mt-3" onClick={onNew}>Start a new career</Button>
    <Button variant="gameQuiet" className="w-full mt-1" onClick={onMenu}>Main menu</Button>
  </section></div>;
}
