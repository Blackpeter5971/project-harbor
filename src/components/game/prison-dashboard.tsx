import { HeartPulse, Zap, Shield, Briefcase, Users, Landmark, LockKeyhole, Skull, RotateCcw, UserRound, Dumbbell, BookOpen, Scale, Mail } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { payCourtDebt } from '@/lib/game/legal';
import type { Career } from '@/lib/game/career';
import { prisonOf, remainingTurns, heirOf } from '@/lib/game/prison';
import { monthLabel } from '@/lib/game/gameplay';
import type { Result } from '@/lib/game/gameplay';
import { prisonActivities, doPrisonActivity, prisonActionLock, appealEligibility, prisonCorrespondents, sendPrisonLetter, prisonManager, prisonBusinessFunding } from '@/lib/game/prison-activities';
import { businessOperations, trustedManagers, type Business } from '@/lib/game/business';
import { CriminalRecords } from './civilian-justice';
import type { PardonRequest } from '@/lib/game/pardons';
import prisonImg from '@/assets/prison-cell.jpg';
import { professionalExecutives } from '@/lib/game/business-workforce';

const kindIcon = { business: Briefcase, family: Users, politics: Landmark, prison: LockKeyhole } as const;
const kindName = { business: 'Business', family: 'Family', politics: 'Politics', prison: 'Prison' } as const;

function Meter({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Zap }) {
  return <div className="prison-meter"><div className="panel-row"><span className="stat-label"><Icon /> {label}</span><b>{Math.round(value)}</b></div><div className="term-track" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><div className="term-fill" style={{ width: `${Math.round(value)}%` }} /></div></div>;
}

const activityIcons = { exercise: Dumbbell, study: BookOpen, respect: Users, appeal: Scale };
function OutsideBusiness({ career, business, onResult }: { career: Career; business: Business; onResult: (r: Result) => void }) {
  const [amount, setAmount] = useState('1000');
  const p = prisonOf(career);
  if (!p) return null;
  const f = businessOperations(career, business), managers = trustedManagers(career), n = Number(amount);
  return <article className="game-row static prison-business"><div className="w-full"><b>{business.name}</b><p>{f.manager ? `Managed by ${f.manager.name}` : 'No active manager'}{f.manager ? ` · GM quality ${f.manager.quality}/100` : ''} · {Math.round(f.efficiency * 100)}% efficiency</p><div className="mini-stats"><span>Business cash <b>${Math.round(business.account).toLocaleString('en-US')}</b></span><span>Last revenue <b>${business.lastRevenue.toLocaleString('en-US')}</b></span><span>Next profit / loss <b>${f.profit.toLocaleString('en-US')}</b></span></div>{<label className="biz-amount">Assign manager <select aria-label={`Prison manager for ${business.name}`} value={business.managerId ?? ''} disabled={!!prisonActionLock(career, `manager:${business.id}`, p.actionRevision)} onChange={e => { if (e.target.value) onResult(prisonManager(career, business.id, e.target.value, p.actionRevision)); }}><option value="">No manager</option>{managers.map(m => <option key={m.id} value={m.id}>{m.name} · quality {m.quality}</option>)}{professionalExecutives.map(m => <option key={m.id} value={m.id} disabled={business.account < m.recruitmentCost}>{m.name} · quality {m.quality} · ${m.recruitmentCost} setup</option>)}</select></label>}<label className="biz-amount">Personal funding <input aria-label={`Prison funding for ${business.name}`} type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} /></label><Button variant="gameOutline" size="sm" disabled={!Number.isFinite(n) || n <= 0 || career.money < n || !!prisonActionLock(career, `funding:${business.id}`, p.actionRevision)} onClick={() => onResult(prisonBusinessFunding(career, business.id, n, p.actionRevision))}><Briefcase /> Transfer funds · 15% energy</Button><details className="biz-ledger"><summary>Business report</summary>{business.ledger.slice(0, 8).map((e, i) => <p key={i} className="mini-note">{e.label} · ${e.amount.toLocaleString('en-US')}</p>)}</details></div></article>;
}

export function PrisonDashboard({ career, onResult, onPardon }: { career: Career; onResult: (r: Result) => void; onPardon?: (r: PardonRequest) => void }) {
  const p = prisonOf(career);
  if (!p) return null;
  const left = remainingTurns(p);
  const sentence = p.death ? 'Death sentence' : p.life ? 'Life imprisonment' : `${p.quarters} quarters (${(p.quarters / 4).toFixed(1)} years)`;
  const remaining = p.death ? `Appeals until ${monthLabel(p.executionDate)}` : p.life ? 'No release date' : `${left} turn${left === 1 ? '' : 's'} left`;
  return <section className="prison-dashboard" aria-label="Prison dashboard">
    <figure className="cb-hero"><img src={prisonImg} alt="Moonlight through the bars of a prison cell" width={1280} height={640} /><figcaption><span className="eyebrow">{p.death ? 'Death row' : 'State penitentiary'} · since {monthLabel(p.since)}</span><b>{remaining}</b></figcaption></figure>
    <div className="game-card p-4">
      <span className="eyebrow">Convicted · {p.tier}</span>
      <h2 className="step-title">{p.crime || 'Corruption charges'}</h2>
      <div className="mini-stats"><span>Sentence <b>{sentence}</b></span><span>Served <b>{p.served} turn{p.served === 1 ? '' : 's'}</b></span><span>Remaining <b>{p.life || p.death ? '—' : left}</b></span><span>Release <b>{p.life || p.death ? 'Never' : monthLabel(p.release)}</b></span></div>
      {!p.life && !p.death && p.quarters > 0 && <div className="term-track mt-2" aria-label={`Sentence progress ${Math.round(p.served / p.quarters * 100)}%`}><div className="term-fill" style={{ width: `${Math.round(p.served / p.quarters * 100)}%` }} /></div>}
    </div>
    <div className="prison-meters game-card p-4 mt-3">
      <Meter label="Health" value={career.health} icon={HeartPulse} />
      <Meter label="Energy" value={Math.min(100, career.actions)} icon={Zap} />
      <Meter label="Prison reputation" value={p.prisonRep} icon={Shield} />
    </div>
    {p.succession && <p className="mini-note mt-2">{p.succession}</p>}
    <div className="panel-row mt-4"><h3 className="section-label">Prison activities</h3><span className="actions-chip" aria-label={`${career.actions} % energy left`}><Zap />{career.actions}%</span></div>
    <p className="mini-note">Legal knowledge {p.legalKnowledge}/100</p>
    {career.legal && career.legal.owed > 0 && <div className="trial-box"><p className="mini-note text-destructive">Unpaid court debt: ${Math.round(career.legal.owed).toLocaleString('en-US')}. Paid automatically from your cash each quarter.</p><Button variant="game" size="sm" disabled={career.money <= 0} onClick={() => onResult(payCourtDebt(career))}>Pay court debt now</Button></div>}
    <div className="row-list">{prisonActivities.map(a => { const Icon = activityIcons[a.id]; const appeal = a.id === 'appeal' ? appealEligibility(career) : null; const lock = prisonActionLock(career, a.id, p.actionRevision); return <Button key={a.id} variant="gameChoice" className="game-row h-auto whitespace-normal" disabled={!!lock || !!appeal && !appeal.eligible} onClick={e => { if (e.detail > 1) return; onResult(doPrisonActivity(career, a.id, p.actionRevision)); }}><Icon className="size-4 shrink-0" /><div><b>{a.name}</b><p>{appeal ? appeal.eligible ? `${Math.round(appeal.chance * 100)}% chance of sentence reduction` : appeal.reason : a.detail}</p>{lock === 'Already completed this quarter.' && <p>Completed this quarter</p>}</div><span className="row-cost">1 action</span></Button>; })}</div>
    <h3 className="section-label mt-4">Visits & letters</h3>
    <div className="row-list">{prisonCorrespondents(career).map(person => <Button key={person.id} variant="gameChoice" className="game-row h-auto whitespace-normal" disabled={!!prisonActionLock(career, 'outside-contact', p.actionRevision)} onClick={() => onResult(sendPrisonLetter(career, person.id, p.actionRevision))}><Mail className="size-4 shrink-0" /><div><b>{person.name}</b><p>{person.role}</p></div><span className="row-cost">1 action</span></Button>)}</div>
    {prisonCorrespondents(career).length === 0 && <p className="mini-note">No family or allies are available for correspondence.</p>}
    <h3 className="section-label mt-4">Outside businesses</h3>
    <p className="mini-note">Personal cash ${Math.round(career.money).toLocaleString('en-US')}</p>
    {career.businesses.length ? <div className="row-list">{career.businesses.map(b => <OutsideBusiness key={b.id} career={career} business={b} onResult={onResult} />)}</div> : <p className="mini-note">No owned businesses.</p>}
    <h3 className="section-label mt-3">News from outside</h3>
    <div className="row-list">{p.updates.map((u, i) => { const Icon = kindIcon[u.kind]; return <div key={i} className="game-row static"><Icon className="size-4 shrink-0 text-primary" /><div><b>{kindName[u.kind]}</b><p>{u.text}</p></div><span className="row-cost">{monthLabel(u.date)}</span></div>; })}</div>
    <p className="mini-note mt-3"><LockKeyhole className="inline size-3" /> Civilian duties remain suspended during custody.</p>
    {onPardon && <CriminalRecords career={career} onPardon={onPardon} />}
  </section>;
}

export function CareerOver({ career, onHeir, onNew }: { career: Career; onHeir: () => void; onNew: () => void }) {
  const heir = heirOf(career);
  return <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="over-title">
    <div className="panel-emblem mx-auto"><Skull /></div>
    <div className="modal-head"><h2 id="over-title">Career over</h2></div>
    <p>{career.character.name}'s story ended in {monthLabel(career.legal?.executed || career.date)}. The sentence was carried out after the final appeal failed.</p>
    {heir ? <p className="mini-note">{heir.name} (age {heir.age}) can carry the family name forward, inheriting half of your remaining personal cash and a stained reputation.</p> : <p className="mini-note">No child is left to carry the family name.</p>}
    <div className="modal-actions">{heir && <Button variant="game" onClick={onHeir}><UserRound /> Continue as {heir.name}</Button>}<Button variant="gameOutline" onClick={onNew}><RotateCcw /> New career</Button></div>
  </section></div>;
}
