import { ACTION_COST } from '@/lib/game/energy-costs';
import { useState } from 'react';
import { Gavel, ShieldAlert, Banknote, Mail, Scale, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { CRIMES, CIVIL_COUNSEL, ARGUMENTS, crimeIdList, crimeOf, crimeRisk, expectedPayout, crimeLock, custodyName, type Counsel, type Argument, type CrimeRequest } from '@/lib/game/crime';
import { criminalRecord } from '@/lib/game/criminal-record';
import { pardonEligibility, type PardonRequest } from '@/lib/game/pardons';
import { prisonCorrespondents } from '@/lib/game/prison-activities';
import { monthLabel } from '@/lib/game/gameplay';
import street from '@/assets/street-night.jpg';
import booking from '@/assets/police-booking.jpg';
import prison from '@/assets/prison-cell.jpg';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
type Props = { career: Career; onRequest: (r: CrimeRequest) => void };

export function ArrestIntake({ career, onRequest }: Props) {
  const [counsel, setCounsel] = useState<Counsel>('public');
  const [argument, setArgument] = useState<Argument>('ties');
  const a = career.crime?.arrest;
  if (!a || a.stage !== 'intake') return null;
  return <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="intake-title">
    <figure className="corruption-hero"><img src={booking} alt="Police booking desk" width={1280} height={640} /></figure>
    <div className="modal-head"><h2 id="intake-title">Arrest · legal intake</h2></div>
    <p><b>{a.charge}</b> · prosecution evidence {a.evidence}%</p>
    <p className="mini-note">Personal funds {usd(career.money)} · arraignment today</p>
    <label className="bank-field">Legal counsel<select aria-label="Legal counsel" value={counsel} onChange={e => setCounsel(e.target.value as Counsel)}>{(Object.keys(CIVIL_COUNSEL) as Counsel[]).map(id => <option key={id} value={id} disabled={career.money < CIVIL_COUNSEL[id].cost}>{CIVIL_COUNSEL[id].name} · {usd(CIVIL_COUNSEL[id].cost)}</option>)}</select></label>
    <label className="bank-field">Defense argument<select aria-label="Defense argument" value={argument} onChange={e => setArgument(e.target.value as Argument)}>{(Object.keys(ARGUMENTS) as Argument[]).map(id => <option key={id} value={id}>{ARGUMENTS[id].name}</option>)}</select></label>
    <p className="mini-note">{ARGUMENTS[argument].note}</p>
    <Button variant="game" className="w-full" disabled={career.money < CIVIL_COUNSEL[counsel].cost} onClick={() => onRequest({ type: 'arraign', counsel, argument, revision: crimeOf(career).revision })}><Gavel /> Attend arraignment</Button>
  </section></div>;
}

export function CustodyPanel({ career, onRequest }: Props) {
  const k = crimeOf(career), a = k.arrest;
  if (!a || a.stage !== 'arraigned' || !a.custody) return null;
  return <section aria-label={a.custody === 'remand' ? 'Prison dashboard' : 'Civilian custody'}>
    {a.custody !== 'bail' && <figure className="cb-hero"><img src={a.custody === 'remand' ? prison : booking} alt={a.custody === 'remand' ? 'Prison cell awaiting trial' : 'Police detention desk'} width={1280} height={640} /><figcaption><b>{custodyName[a.custody]}</b></figcaption></figure>}
    <h2 className="step-title">{custodyName[a.custody]}</h2><p>{a.charge}</p>
    <div className="mini-stats"><span>Trial date<b>{monthLabel(a.trialDate)}</b></span><span>Flight risk<b>{a.flightRisk}%</b></span><span>Defense<b>{a.defense}%</b></span><span>Bail<b>{a.bailPosted ? `${usd(a.bail)} posted` : 'Not posted'}</b></span></div>
    <p className="mini-note">{a.custody === 'bail' ? 'Released at home pending trial.' : a.custody === 'remand' ? 'Held without bail. No conviction has been entered.' : 'Detained pending trial. Counsel and existing-circle letters are available.'}</p>
    <Button variant="gameOutline" className="mt-3" disabled={a.counsel === 'none' || a.preparedTurn === career.date || career.actions < ACTION_COST} onClick={() => onRequest({ type: 'prepare', revision: k.revision })}><Scale /> Prepare defense · 15% energy</Button>
    {a.custody === 'police' && <><h3 className="section-label mt-3">Letters</h3><div className="row-list">{prisonCorrespondents(career).map(p => <Button variant="gameChoice" key={p.id} disabled={a.contactTurn === career.date || career.actions < ACTION_COST} onClick={() => onRequest({ type: 'contact', personId: p.id, revision: k.revision })}><Mail /> {p.name}</Button>)}</div></>}
  </section>;
}

export function CriminalRecords({ career, onPardon }: { career: Career; onPardon: (r: PardonRequest) => void }) {
  const records = criminalRecord(career), k = crimeOf(career);
  return <section aria-label="Criminal record"><h3 className="section-label mt-4"><FileCheck className="inline size-4" /> Criminal record & clemency</h3>
    {!records.length && <p className="mini-note">No convictions recorded.</p>}
    {records.map(r => { const e = pardonEligibility(career, r.id); return <article className="bank-record" key={r.id}><b>{r.charge} · {r.severity}</b><p className="mini-note">{monthLabel(r.date)} · {r.outcome} · {r.pardoned ? 'Pardoned · history retained' : 'Unpardoned conviction'}</p>{!r.pardoned && <><Button variant="gameOutline" size="sm" disabled={!e.eligible} onClick={() => onPardon({ target: r.id, revision: k.revision })}><FileCheck /> Petition {e.authority} · {Math.round(e.chance * 100)}% · 15% energy</Button>{e.reason && <p className="mini-note">{e.reason}</p>}</>}</article>; })}
  </section>;
}

export function StreetPanel({ career, onRequest }: Props) {
  const [amount, setAmount] = useState('1000'), [confirm, setConfirm] = useState<typeof crimeIdList[number] | null>(null);
  const k = crimeOf(career);
  return <section aria-label="Illicit opportunities"><figure className="cb-hero"><img src={street} alt="City street at night" width={1280} height={640} /><figcaption><b>Illicit opportunities</b></figcaption></figure>
    <div className="mini-stats"><span>Street cash<b>{usd(k.stash)}</b></span><span>Street reputation<b>{k.streetRep}/100</b></span><span>Police heat<b>{k.heat}/100</b></span></div>
    <div className="row-list mt-3">{crimeIdList.map(id => { const d = CRIMES[id], lock = crimeLock(career, id, k.revision); return <article key={id} className="game-row static"><div className="w-full"><b>{d.name}</b><p>{d.blurb}</p><div className="mini-stats"><span>Expected payout<b>{usd(expectedPayout(career, id))}</b></span><span>Detection / arrest risk<b>{crimeRisk(career, id)}%</b></span></div><p className="mini-note">{d.severity} · {d.jurisdiction} jurisdiction · +{d.rep} street reputation</p><Button variant="gameOutline" size="sm" disabled={!!lock} onClick={() => setConfirm(id)}><ShieldAlert /> Attempt {d.name} · 15% energy</Button>{lock && <p className="mini-note">{lock}</p>}</div></article>; })}</div>
    <label className="bank-field">Spend street cash<input aria-label="Street cash amount" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} /></label><Button variant="gameOutline" disabled={k.stash <= 0 || !!k.arrest} onClick={() => onRequest({ type: 'spend', amount: Number(amount), revision: k.revision })}><Banknote /> Transfer to personal cash</Button>
    <p className="mini-note">{usd(k.spent)} of $5,000 quarterly cap spent. Conspicuous spending raises police heat.</p>
    {k.cases.length > 0 && <details className="biz-ledger"><summary>Resolved civilian cases</summary>{k.cases.map(c => <p className="mini-note" key={c.id}>{c.charge} · {c.custody} · {c.result}</p>)}</details>}
    {confirm && <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="crime-confirm"><h2 id="crime-confirm">Attempt {CRIMES[confirm].name}?</h2><p>{crimeRisk(career, confirm)}% arrest risk. Expected street cash {usd(expectedPayout(career, confirm))}. A conviction can cost your job and political clearance.</p><div className="modal-actions"><Button variant="game" onClick={() => { onRequest({ type: 'commit', id: confirm, revision: k.revision }); setConfirm(null); }}><ShieldAlert /> Confirm attempt</Button><Button variant="gameOutline" onClick={() => setConfirm(null)}>Cancel</Button></div></section></div>}
  </section>;
}