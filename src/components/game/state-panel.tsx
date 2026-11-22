import { ACTION_COST } from '@/lib/game/energy-costs';
import { useState } from 'react';
import { Check, FileText, Handshake, Play, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { policyNames, type Policy, type Result } from '@/lib/game/support';
import { governorAction, isStateOffice, stateCost, stateFunds, stateGovernment, stateLegislativeAction, stateMeasure, stateOfficials } from '@/lib/game/state-government';
import { usd } from '@/lib/game/campaign';

export function StatePanel({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const [policy, setPolicy] = useState<Policy>('services');
  if (!isStateOffice(career)) return null;
  const s = stateGovernment(career), governor = career.office?.id === 'governor', out = career.actions < ACTION_COST;
  const funds = stateFunds(career);
  return <>
    <h3 className="section-label mt-3">{governor ? 'Statewide leadership' : 'State legislative work'}</h3>
    <div className="mini-stats"><span>Priority <b>{policyNames[s.priority]}</b></span><span>Coalition boost <b>+{s.coalition}</b></span><span>Available public allocation <b>{usd(funds)}</b></span><span>Committed this year <b>{usd(s.spent)}</b></span></div>
    <Button variant="gameOutline" className="w-full mt-2" disabled={out || s.coalition >= 24} onClick={() => onResult(stateLegislativeAction(career, 'coalition'))}><Handshake /> {governor ? 'Negotiate legislature' : 'Form coalition'} · 15% energy</Button>
    {!governor && <Button variant="gameOutline" className="w-full mt-2" disabled={out || career.bills.some(b => b.kind === 'budget' && b.tenure === s.tenure && !['passed', 'rejected'].includes(b.stage))} onClick={() => onResult(stateMeasure(career, 'budget'))}><FileText /> Review state budget · 15% energy</Button>}
    {governor && <>
      <label className="field mt-2"><span className="field-label">State policy agenda</span><select className="game-input" value={policy} onChange={e => setPolicy(e.target.value as Policy)}>{Object.entries(policyNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <div className="detail-actions"><Button variant="gameOutline" disabled={out || policy === s.priority} onClick={() => onResult(governorAction(career, 'priority', policy))}><Check /> Set state priority</Button><Button variant="gameOutline" disabled={out || funds < stateCost(career, 'bill') || career.bills.some(b => b.kind === 'bill' && b.tenure === s.tenure && !['passed', 'rejected'].includes(b.stage))} onClick={() => onResult(stateMeasure(career, 'bill', policy))}><FileText /> Review legislature bill</Button></div>
      <p className="mini-note">Legislature bill: {usd(stateCost(career, 'bill'))} public cost. Chamber consideration and a majority vote precede signing or veto; services benefit residents while costs draw business opposition.</p>
      <h3 className="section-label mt-3">Appointments · legislative confirmation</h3>
      <div className="row-list">{stateOfficials.map(o => { const held = s.officials.some(x => x.role === o.role); return <div className="game-row static" key={o.role}><div><b>{o.role}</b><p>{o.name} · competence {o.competence}%</p><p>{usd(stateCost(career, 'appointment'))} public cost · faster agency delivery; business voters oppose the expense.</p><Button variant="gameOutline" size="sm" disabled={out || held || funds < stateCost(career, 'appointment')} onClick={() => onResult(governorAction(career, 'appoint', o.role))}>{held ? 'Confirmed' : 'Appoint · 15% energy'}</Button></div></div>; })}</div>
      <h3 className="section-label mt-3">State agencies</h3>
      <p className="mini-note">{usd(stateCost(career, 'agency'))} funds a priority program. Completion raises service and employment indicators; public costs alienate business voters.</p>
      <Button variant="gameOutline" className="w-full" disabled={out || funds < stateCost(career, 'agency') || s.agencies.some(a => a.status === 'active')} onClick={() => onResult(governorAction(career, 'agency'))}><Play /> Launch agency program · 15% energy</Button>
    </>}
    {s.agencies.map(a => <div className="game-row static mt-2" key={a.id}><div><b>{a.title}</b><p>{a.status} · {a.progress}% · {usd(a.cost)} funded</p><div className="term-track" role="progressbar" aria-label={a.title} aria-valuenow={a.progress} aria-valuemin={0} aria-valuemax={100}><div className="term-fill" style={{ width: `${a.progress}%` }} /></div></div></div>)}
    <h3 className="section-label mt-3">State disasters</h3>
    {s.disaster && !s.disaster.resolved ? <div className="game-row static"><div><b>{s.disaster.title}</b><p>{usd(s.disaster.cost)} response · delay costs 2 approval per turn and 5 service/employment points; funding restores 3 approval.</p>{governor ? <Button variant="game" size="sm" disabled={out || funds < s.disaster.cost} onClick={() => onResult(governorAction(career, 'disaster'))}><Shield /> Fund disaster response · 15% energy</Button> : <p>The governor must authorize disaster response.</p>}</div></div> : <p className="mini-note">{s.disaster?.resolved ? `${s.disaster.title}: response funded.` : 'No active state disaster.'}</p>}
  </>;
}