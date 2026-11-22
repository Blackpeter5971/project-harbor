import { ACTION_COST } from '@/lib/game/energy-costs';
import { useState } from 'react';
import { Check, FileText, Globe, Handshake, Shield, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { executiveOrders, federalAction, federalFunds, federalMeasure, federalOfficials, federalState, isFederal } from '@/lib/game/federal';
import { chamber, type Result } from '@/lib/game/support';
import { revenueBase } from '@/lib/game/budget';
import { usd } from '@/lib/game/campaign';

export function FederalPanel({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const [role, setRole] = useState(federalOfficials[0]?.role ?? '');
  if (!isFederal(career)) return null;
  const s = federalState(career), president = career.office?.id === 'president', senate = career.office?.id === 'senate', out = career.actions < ACTION_COST;
  const houseSeats = chamber(career, 'house'), senateSeats = chamber(career, 'senate');
  return <>
    <h3 className="section-label mt-3">Congress & federal government</h3>
    <div className="mini-stats"><span>House <b>{houseSeats.allies}/435 coalition · 218 needed</b></span><span>Senate <b>{senateSeats.allies}/100 coalition · 51 needed</b></span><span>Available allocation <b>{usd(federalFunds(career))}</b></span><span>Committed <b>{usd(s.spent)}</b></span><span>Bipartisan support <b>+{s.coalition}</b></span></div>
    <Button variant="gameOutline" className="w-full mt-2" disabled={out || s.coalition >= 24} onClick={() => onResult(federalAction(career, 'deal'))}><Handshake /> Negotiate bipartisan deal · 15% energy</Button>
    {!president && <Button variant="gameOutline" className="w-full mt-2" disabled={out} onClick={() => onResult(federalMeasure(career, 'budget'))}><FileText /> Negotiate federal budget · 15% energy</Button>}
    {career.office?.id === 'house' && <><p className="mini-note">District funding: {usd(Math.round(revenueBase(career) * 0.02))} proposed public cost. Construction benefits workers, while business voters oppose the expense. Both chambers and the President must approve.</p><Button variant="gameOutline" className="w-full" disabled={out} onClick={() => onResult(federalMeasure(career, 'district'))}><FileText /> Seek district funding · 15% energy</Button></>}
    {president && <><Button variant="gameOutline" className="w-full mt-2" disabled={out} onClick={() => onResult(federalMeasure(career, 'bill'))}><FileText /> Review congressional bill · 15% energy</Button><h3 className="section-label mt-3">Executive directives · legal authority</h3><div className="row-list">{executiveOrders.map(o => <div className="game-row static" key={o.id}><div><b>{o.title}</b><p>{o.authority}</p><p>{usd(Math.round(revenueBase(career) * o.fraction))} proposed cost · {o.id === 'newtax' || o.id === 'unfunded' ? 'Requires an act of Congress.' : 'Successful implementation improves approval; failure costs public trust.'}</p><Button variant="gameOutline" size="sm" disabled={out || s.orders.some(x => x.id === o.id)} onClick={() => onResult(federalAction(career, 'order', o.id))}><Shield /> {s.orders.some(x => x.id === o.id) ? 'In effect' : o.id === 'newtax' || o.id === 'unfunded' ? 'Check legal authority' : 'Issue directive · 15% energy'}</Button></div></div>)}</div><h3 className="section-label mt-3">Foreign affairs</h3><p className="mini-note">Diplomatic standing {s.diplomacy}% · nonbinding coordination only; treaties and new funding remain subject to Congress.</p><Button variant="gameOutline" className="w-full" disabled={out} onClick={() => onResult(federalAction(career, 'diplomacy'))}><Globe /> Meet foreign leaders · 15% energy</Button></>}
    {(president || senate) && <>
      <h3 className="section-label mt-3">{president ? 'Presidential nominations' : 'Senate confirmations'}</h3>
      <label className="field"><span className="field-label">Office & nominee</span><select className="game-input" value={role} onChange={e => setRole(e.target.value)}>{federalOfficials.map(o => <option key={o.role} value={o.role}>{o.role} · {o.name}</option>)}</select></label>
      <p className="mini-note">Appointment cost: {usd(Math.round(revenueBase(career) * 0.01))} only after confirmation. Experienced officials strengthen administration; business voters criticize public expense.</p>
      <Button variant="gameOutline" className="w-full" disabled={out || s.nominations.some(n => n.role === role && n.status !== 'rejected')} onClick={() => onResult(federalAction(career, 'nominate', role))}><UserPlus /> {president ? 'Nominate official' : 'Open presidential nomination'} · 15% energy</Button>
      <div className="row-list mt-2">{s.nominations.map(n => <div className="game-row static" key={n.id}><div><b>{n.role} · {n.name}</b><p>{n.status} · competence {n.competence}%</p>{n.support && <p>{n.support.votes}/100 Senate votes · 51 required</p>}{n.status === 'nominated' && <div className="detail-actions"><Button variant="gameOutline" size="sm" disabled={out} onClick={() => onResult(federalAction(career, 'confirm', n.id))}><Check /> {president ? 'Seek Senate confirmation' : 'Call confirmation vote'}</Button>{senate && <Button variant="gameOutline" size="sm" disabled={out} onClick={() => onResult(federalAction(career, 'block', n.id))}><X /> Block nomination</Button>}</div>}</div></div>)}</div>
    </>}
  </>;
}