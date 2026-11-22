import { ACTION_COST } from '@/lib/game/energy-costs';
import { useState, type ReactNode } from 'react';
import { Check, Handshake, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { billAction } from '@/lib/game/legislation';
import { policyNames, tenureKey, type Policy, type Result } from '@/lib/game/support';
import { cityState, cityFunds, cityCost, mayorAction, officials } from '@/lib/game/city';
import { usd } from '@/lib/game/campaign';
import { monthLabel } from '@/lib/game/gameplay';
import { StatePanel } from './state-panel';
import { stateLegislativeAction } from '@/lib/game/state-government';
import { FederalPanel } from './federal-panel';
import { isFederal } from '@/lib/game/federal';
import { PublicProjectPanel } from './public-project-panel';
import { CrisisPanel } from './crisis-panel';
import { BillsToPresident, LegislativeDocketPanel } from './legislative-docket-panel';
import { resolveLegislativeDocket, type LegislativeRequest } from '@/lib/game/legislative-docket';

/** Collapsible drawer for executives; plain passthrough otherwise. Executives govern only via the docket, so legislative/department parts render nothing for them. */
export function GovDrawer({ on, title, children }: { on: boolean; title: string; children: ReactNode }) {
  return on ? <details className="gov-drawer"><summary>{title}</summary><div className="gov-drawer-body">{children}</div></details> : <>{children}</>;
}

export function GoverningPanel({ career, onResult, part, onLegislativeRequest }: { career: Career; onResult: (r: Result) => void; part?: 'crisis' | 'legislative' | 'departments' | 'records' | 'archive'; onLegislativeRequest?: (r: LegislativeRequest) => boolean }) {
  const show = (p: NonNullable<typeof part>) => !part || part === p;
  const [policy, setPolicy] = useState<Policy>('services');
  const [archive, setArchive] = useState(false);
  const office = career.office;
  if (!office) return null;
  const out = career.actions < ACTION_COST;
  const city = cityState(career), may = office.id === 'mayor';
  const executive = ['mayor', 'governor', 'president'].includes(office.id);
  const legislator = ['council', 'stateLeg', 'house', 'senate'].includes(office.id);
  const bills = career.bills.filter(b => b.tenure === tenureKey(career) && (archive || !['passed', 'rejected'].includes(b.stage)));
  const selector = <label className="field mt-2"><span className="field-label">Policy agenda</span><select className="game-input" value={policy} onChange={e => setPolicy(e.target.value as Policy)}>{Object.entries(policyNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
  return <>
    {show('crisis') && <div id="government-attention"><CrisisPanel career={career} onResult={onResult} /></div>}
    {show('legislative') && <>
      {/* Legislators run the quarterly docket (floor roll calls, committee, whip); presidents follow Congress here and decide passed bills in the Executive Docket. */}
      {legislator && <LegislativeDocketPanel career={career} onRequest={onLegislativeRequest ?? (r => { const res = resolveLegislativeDocket(career, r); onResult(res); return res.ok; })} />}
      {office.id === 'president' && <BillsToPresident career={career} />}
    </>}
    {part === 'archive' && legislator && <BillsToPresident career={career} />}
    {show('departments') && !executive && <><StatePanel career={career} onResult={onResult} />
    <FederalPanel career={career} onResult={onResult} />
    <PublicProjectPanel career={career} onResult={onResult} />
    {may && <>
      <h3 className="section-label mt-3">City leadership</h3>
      <div className="mini-stats"><span>Priority <b>{policyNames[city.priority]}</b></span><span>Available public allocation <b>{usd(cityFunds(career))}</b></span><span>Committed this year <b>{usd(city.spent)}</b></span></div>
      {selector}<div className="detail-actions"><Button variant="gameOutline" disabled={out || policy === city.priority} onClick={() => onResult(mayorAction(career, 'priority', policy))}><Check /> Set priority</Button><Button variant="gameOutline" disabled={out} onClick={() => onResult(mayorAction(career, 'negotiate'))}><Handshake /> Negotiate council</Button></div>
      <h3 className="section-label mt-3">Appointments · council confirmation</h3>
      <div className="row-list">{officials.map(o => { const held = city.officials.some(a => a.role === o.role); return <div className="game-row static" key={o.role}><div><b>{o.role}</b><p>{o.name} · competence {o.competence}%</p><p>{usd(cityCost(career, 'appointment'))} public cost · stronger delivery; administration draws criticism.</p><Button variant="gameOutline" size="sm" disabled={out || held || cityFunds(career) < cityCost(career, 'appointment')} onClick={() => onResult(mayorAction(career, 'appoint', o.role))}>{held ? 'Confirmed' : 'Appoint · 15% energy'}</Button></div></div>; })}</div>
      <h3 className="section-label mt-3">Local projects</h3><p className="mini-note">Neighborhood renewal · {usd(cityCost(career, 'project'))} public cost. Completion improves resident approval; the cost angers business voters.</p>
      <Button variant="gameOutline" className="w-full" disabled={out || city.projects.some(p => p.status === 'active') || cityFunds(career) < cityCost(career, 'project')} onClick={() => onResult(mayorAction(career, 'project'))}><Play /> Launch project · 15% energy</Button>
      {city.projects.map(p => <div className="game-row static mt-2" key={p.id}><div><b>{p.title}</b><p>{p.status} · {p.progress}% · {usd(p.cost)} funded</p><div className="term-track" role="progressbar" aria-label={p.title} aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}><div className="term-fill" style={{ width: `${p.progress}%` }} /></div></div></div>)}
      <h3 className="section-label mt-3">Emergency response</h3>
      {city.emergency && !city.emergency.resolved ? <div className="game-row static"><div><b>{city.emergency.title}</b><p>{usd(city.emergency.cost)} response · delay costs 2 approval each turn; successful response restores 3.</p><Button variant="game" size="sm" disabled={out || city.emergency.cost > cityFunds(career)} onClick={() => onResult(mayorAction(career, 'emergency'))}>Fund response · 15% energy</Button></div></div> : <p className="mini-note">{city.emergency?.resolved ? `${city.emergency.title}: response completed.` : 'No active city emergency.'}</p>}
    </>}</>}
    {(legislator ? part === 'archive' : show('legislative')) && !executive && career.bills.some(b => b.tenure === tenureKey(career)) && <><div className="panel-row mt-3"><h3 className="section-label">Earlier bills & ordinances</h3><label className="mini-note"><input type="checkbox" checked={archive} onChange={e => setArchive(e.target.checked)} /> Include resolved</label></div>
    {!bills.length && <p className="mini-note">No pending measures in this office.</p>}
    <div className="row-list">{bills.map(b => <div className="game-row static" key={b.id}><div className="w-full"><b>{b.title}</b><p>{b.stage} · {monthLabel(b.date)} · {usd(b.cost)} public cost</p>
      {b.support && <><p>{b.support.outcome} · {b.support.votes}/{b.support.seats} votes · {b.support.needed} needed</p>{b.support.reasons.map(r => <p className="mini-note" key={r}>{r}</p>)}</>}
      {isFederal(career) && <p className="mini-note">House: {b.chamberVotes.some(v => v.chamber === 'house') ? 'approved' : 'pending'} · Senate: {b.chamberVotes.some(v => v.chamber === 'senate') ? 'approved' : 'pending'}. Both chambers must pass identical text before signing.</p>}
      <div className="group-actions">
        {office.id === 'stateLeg' && b.stage === 'under consideration' && <Button variant="gameOutline" size="sm" disabled={out || b.boost >= 24} onClick={() => onResult(stateLegislativeAction(career, 'committee', b.id))}>Committee hearing</Button>}
        {b.stage === 'proposed' && <Button variant="gameOutline" size="sm" disabled={out} onClick={() => onResult(billAction(career, b.id, 'consider'))}>Open consideration</Button>}
        {(b.stage === 'under consideration' || isFederal(career) && b.stage === 'awaiting approval' && b.chamberVotes.length < 2) && <>{(['negotiate', 'amend', 'compromise', 'vote'] as const).filter(a => b.stage === 'under consideration' || a === 'vote').map(a => <Button key={a} variant={a === 'vote' ? 'game' : 'gameOutline'} size="sm" disabled={out || a === 'negotiate' && b.boost >= 24} onClick={() => onResult(billAction(career, b.id, a))}>{a === 'vote' ? isFederal(career) ? `Call ${b.chamberVotes.some(v => v.chamber === (office.id === 'senate' ? 'senate' : 'house')) ? office.id === 'senate' ? 'House' : 'Senate' : office.id === 'senate' ? 'Senate' : 'House'} vote` : 'Call vote' : a === 'negotiate' ? 'Negotiate' : a === 'amend' ? 'Amend' : 'Compromise'}</Button>)}</>}
        {b.stage === 'awaiting approval' && (!isFederal(career) || b.chamberVotes.length === 2) && <><Button variant="game" size="sm" disabled={out} onClick={() => onResult(billAction(career, b.id, 'approve'))}><Check /> {legislator ? 'Seek executive approval' : ['governor', 'president'].includes(office.id) ? 'Sign bill' : 'Approve'}</Button><Button variant="gameOutline" size="sm" disabled={out} onClick={() => onResult(billAction(career, b.id, 'veto'))}><X /> {legislator ? 'Withdraw' : 'Veto'}</Button></>}
      </div><details className="mini-note mt-2"><summary>Measure history · {b.history.length}</summary>{b.history.map((h, i) => <p key={i}>{monthLabel(h.date)} · {h.text}</p>)}</details>
    </div></div>)}</div></>}
    {show('records') && <>{!!career.governmentDecisions.length && <><h3 className="section-label mt-3">Support & opposition record</h3><div className="row-list">{career.governmentDecisions.slice(0, 6).map((d, i) => <div className="game-row static" key={i}><div><b>{d.title} · {d.support.outcome}</b><p>{monthLabel(d.date)} · {d.support.votes}/{d.support.seats} support</p><details className="mini-note"><summary>Support factors</summary>{d.support.reasons.map(r => <p key={r}>{r}</p>)}</details></div></div>)}</div></>}
    {!!career.scandals.length && <><h3 className="section-label mt-3">Oversight & evidence record</h3><div className="row-list">{career.scandals.slice(-6).reverse().map(s => <div className="game-row static" key={s.id}><div><b>{s.subject} · {s.status}</b><p>{s.allegation}</p><p>{s.finding ?? 'Allegation only — no finding of misconduct.'}</p></div></div>)}</div></>}
    {!!career.eventHistory.length && <details className="mini-note mt-3"><summary>Event response history</summary>{career.eventHistory.slice(-8).reverse().map((e, i) => <p key={i}>{monthLabel(e.date)} · {e.consequences}</p>)}</details>}</>}
  </>;
}