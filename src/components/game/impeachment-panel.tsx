import { ACTION_COST } from '@/lib/game/energy-costs';
import { useEffect, useState } from 'react';
import { AlertTriangle, Gavel, Megaphone, Handshake, ShieldAlert, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/support';
import type { ImpeachmentVote } from '@/lib/game/impeachment-schema';
import { executiveOffice, docketQuarter } from '@/lib/game/docket-schema';
import { DEFENSE_COST, impeachmentOf, impeachmentRisk, mountDefense, procedure, respondUnrest } from '@/lib/game/impeachment';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Read-only gauge; visible when approval is under 35% or unrest/proceedings are active. */
export function ImpeachmentRiskMeter({ career }: { career: Career }) {
  if (!executiveOffice(career)) return null;
  const s = impeachmentOf(career), r = impeachmentRisk(career), a = career.approval?.overall ?? 50;
  if (a >= 35 && !s.unrest && !s.proceeding) return null;
  return <section className={`impeach-meter level-${r.level.toLowerCase()}`} aria-label={`Impeachment and unrest risk ${r.risk}%`}>
    <div className="panel-row"><b><ShieldAlert /> Impeachment & unrest risk</b><span>{r.level} · {r.risk}%</span></div>
    <div className="impeach-track"><div className="impeach-fill" style={{ width: `${r.risk}%` }} /></div>
    {r.reasons.map(t => <p className="mini-note" key={t}>{t}</p>)}
  </section>;
}

function Tally({ vote }: { vote: ImpeachmentVote }) {
  const [shown, setShown] = useState(0);
  useEffect(() => { setShown(0); const id = setInterval(() => setShown(v => { if (v >= 1) { clearInterval(id); return 1; } return Math.min(1, v + 0.05); }), 40); return () => clearInterval(id); }, [vote]);
  const yes = Math.round(vote.yes * shown), no = Math.round(vote.no * shown);
  return <div className="impeach-tally">
    <div className="panel-row"><small>{vote.label}</small><small>{vote.needed} needed</small></div>
    <div className="rc-bar"><i className="yes" style={{ width: `${yes / vote.seats * 100}%` }} /><i className="no" style={{ width: `${no / vote.seats * 100}%` }} /><span className="rc-threshold" style={{ left: `${vote.needed / vote.seats * 100}%` }} /></div>
    <div className="panel-row"><b className="amt-out">Aye {yes}</b><b className="amt-in">Nay {no}</b></div>
    {shown >= 1 && <p className={`impeach-banner ${vote.passed ? 'bad' : 'good'}`}>{vote.passed ? 'ADOPTED' : 'DEFEATED'}</p>}
  </div>;
}

export function ImpeachmentPanel({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  if (!executiveOffice(career)) return null;
  const s = impeachmentOf(career), q = docketQuarter(career.date), p = s.proceeding;
  const proc = procedure(career.office!.id);
  const stages = [{ id: 'investigation', label: 'Investigation & articles' }, { id: 'house_vote', label: proc.house.chamber + ' vote' }, ...(proc.senate ? [{ id: 'senate_trial', label: proc.senate.chamber + ' trial (2/3)' }] : [])];
  return <>
    <ImpeachmentRiskMeter career={career} />
    {s.unrest && <section className="game-card p-4 impeach-alert" aria-label="Active protests">
      <div className="panel-row"><b><AlertTriangle /> {s.unrest.title}</b><span className="tag-bad">Active · {s.unrest.quarters} qtr</span></div>
      <p className="mini-note">Protests drain the treasury and keep the press on you every quarter until approval recovers above 38% or you respond.</p>
      {s.unrest.respondedQuarter === q ? <p className="mini-note">You responded this quarter.</p> : <div className="mt-2 flex flex-col gap-2">
        <Button variant="gameOutline" disabled={career.actions < ACTION_COST} onClick={() => onResult(respondUnrest(career, 'address'))}><Megaphone /> Address the public · skill check: +6 or −3</Button>
        <Button variant="gameOutline" disabled={career.actions < ACTION_COST} onClick={() => onResult(respondUnrest(career, 'concessions'))}><Handshake /> Offer concessions · +4, party −6</Button>
        <Button variant="gameOutline" disabled={career.actions < ACTION_COST} onClick={() => onResult(respondUnrest(career, 'enforcement'))}><ShieldAlert /> Deploy law enforcement · ends protests, −3, youth & workers hit hard</Button>
      </div>}
    </section>}
    {p && <section className="game-card p-4 impeach-alert" aria-label="Impeachment proceedings">
      <div className="panel-row"><b><Gavel /> Impeachment proceedings</b><span className="tag-bad">{p.reason}</span></div>
      <ol className="impeach-stages">{stages.map((st, i) => { const idx = stages.findIndex(x => x.id === p.stage); return <li key={st.id} className={i < idx ? 'done' : i === idx ? 'now' : ''}>{st.label}</li>; })}</ol>
      <p className="mini-note">Articles: {p.articles.join(' · ')}</p>
      {p.votes.map(v => <Tally key={v.label} vote={v} />)}
      <p className="mini-note">Next vote resolves at the end of this quarter. Conviction means removal, a lifetime ban from office and prosecution; acquittal costs 15 reputation permanently.</p>
      <Button variant="gameOutline" className="mt-2" disabled={p.defenseQuarter === q || career.actions < ACTION_COST || career.money < (DEFENSE_COST[p.office] ?? 0)} onClick={() => onResult(mountDefense(career))}><Scale /> Lobby swing lawmakers · {usd(DEFENSE_COST[p.office] ?? 0)} + 1 action</Button>
    </section>}
  </>;
}
