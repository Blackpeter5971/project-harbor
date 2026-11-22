import { ACTION_COST } from '@/lib/game/energy-costs';
import { useState } from 'react';
import { Briefcase, FileText, Megaphone, ShieldAlert, LogOut, Handshake, CheckCircle2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/gameplay';
import { monthLabel } from '@/lib/game/gameplay';
import { usd } from '@/lib/game/campaign';
import {
  acceptAppointment, appointmentsOf, backableCandidates, backCandidate, campaignForCandidate, dilemmaOf, DISMISS_AT, ensureAppointmentDocket, freshAppointmentNotes,
  PATHWAY_LABEL, pledgeOdds, resignAppointment, resolveAppointmentSlot, roleOf, roleViews, SLOT_LABEL, slotOptions, TIER_LABEL, whistleblow, withdrawPledge,
} from '@/lib/game/appointments';
import { profileOf } from '@/lib/game/network';
import { figurePortraitById } from './figure-portraits';
import municipalImg from '@/assets/appoint-municipal.jpg';
import stateImg from '@/assets/appoint-state.jpg';
import federalImg from '@/assets/appoint-federal.jpg';

const ART = { municipal: municipalImg, state: stateImg, federal: federalImg };
const SLOT_ICON = { advisory: FileText, administration: Briefcase, media: Megaphone };

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  const tone = value < DISMISS_AT + 10 ? 'down' : value >= 65 ? 'up' : '';
  return <div className="appoint-meter"><div className="panel-row"><small>{label}</small><b className={`docket-delta ${tone}`}>{value}</b></div><div className="meter"><span style={{ width: `${value}%` }} /></div><small className="mini-note">{hint}</small></div>;
}

/** Government section when the player holds no elected office: appointment dashboard or offers. */
export function AppointmentsView({ career, onResult, onPolitics }: { career: Career; onResult: (r: Result) => void; onPolitics: () => void }) {
  const c = ensureAppointmentDocket(career), a = c.appointments?.current;
  return a ? <AppointmentDashboard career={c} onResult={onResult} /> : <AppointmentOffers career={c} onResult={onResult} onPolitics={onPolitics} />;
}

function AppointmentOffers({ career, onResult, onPolitics }: { career: Career; onResult: (r: Result) => void; onPolitics: () => void }) {
  const views = roleViews(career), ap = appointmentsOf(career);
  const [tier, setTier] = useState<'municipal' | 'state' | 'federal'>('municipal');
  return <section className="appoint-panel" aria-label="Political appointments">
    <figure className="government-cover"><img src={ART[tier]} alt="" width={1280} height={640} /><figcaption><span className="eyebrow">Alternative path</span><h2>Political Appointments</h2></figcaption></figure>
    <p className="mini-note">Serve an elected executive instead of running yourself. Qualify through party standing, network trust, or backing their campaign. Prefer elected office? Win an election in Politics.</p>
    <Button variant="gameOutline" size="sm" className="mt-1" onClick={onPolitics}>Politics</Button>
    {ap.pledge && <p className="tag-ok mt-2">Backing {profileOf(ap.pledge.figureId).name} for {ap.pledge.race} — see Campaigns.</p>}
    <Tabs value={tier} onValueChange={v => setTier(v as typeof tier)} className="mt-2">
      <TabsList className="grid grid-cols-3 w-full">{(['municipal', 'state', 'federal'] as const).map(t => <TabsTrigger key={t} value={t}>{TIER_LABEL[t]}</TabsTrigger>)}</TabsList>
      {(['municipal', 'state', 'federal'] as const).map(t => <TabsContent key={t} value={t} className="grid gap-2">
        {views.filter(v => v.role.tier === t).map(v => <article key={v.role.id} className={`appoint-offer ${v.pathway ? 'open' : ''}`}>
          <div className="panel-row"><b>{v.role.title}</b>{v.pathway ? <span className="tag-ok">{PATHWAY_LABEL[v.pathway]}</span> : <LockKeyhole className="size-4" />}</div>
          <small className="mini-note">Serving {v.superior ? `${v.superior.name} (${v.superior.party})` : '—'} · {usd(v.role.salary)}/mo · Treasury allocation {usd(v.role.budget)}</small>
          <ul className="appoint-reqs">{v.reqs.map(r => <li key={r.label} className={r.met ? 'met' : ''}>{r.met ? '✓' : '·'} {r.label}</li>)}</ul>
          <Button variant="game" size="sm" disabled={!v.pathway || !!v.blocked || career.actions < ACTION_COST} title={v.blocked} onClick={() => onResult(acceptAppointment(career, v.role.id, ap.revision))}>{v.blocked && v.pathway ? v.blocked : 'Accept appointment · 15% energy'}</Button>
        </article>)}
      </TabsContent>)}
    </Tabs>
    {ap.history.length > 0 && <p className="mini-note mt-2">Past: {ap.history.slice(0, 3).map(h => `${h.title} (${h.reason})`).join(' · ')}</p>}
  </section>;
}

function AppointmentDashboard({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const a = career.appointments!.current!;
  const [confirm, setConfirm] = useState<'resign' | 'whistle' | null>(null);
  const months = Math.max(0, (Number(a.termEnd.slice(0, 4)) - Number(career.date.slice(0, 4))) * 12 + Number(a.termEnd.slice(5, 7)) - Number(career.date.slice(5, 7)));
  const portrait = a.superiorId !== 'potus' ? figurePortraitById(a.superiorId, profileOf(a.superiorId)?.portrait ?? 0) : null;
  return <section className="appoint-panel" aria-label="Appointment dashboard">
    <figure className="government-cover"><img src={ART[a.tier]} alt={`${a.title} office`} width={1280} height={640} /><figcaption><span className="eyebrow">{TIER_LABEL[a.tier]} appointment · {a.jurisdiction}</span><h2>{a.title}</h2></figcaption></figure>
    <div className="appoint-superior">{portrait && <img src={portrait} alt="" width={44} height={44} />}<small><b>{a.superiorName}</b> · {a.superiorParty}<br />{a.superiorOffice} · Since {monthLabel(a.since)} · {Math.floor(months / 12)}y {months % 12}m left</small></div>
    <div className="grid grid-cols-2 gap-2 mt-2">
      <Meter label="Superior's Trust" value={a.trust} hint="Loyalty, discretion, defense" />
      <Meter label="Competency" value={a.competency} hint="Advice, projects, efficiency" />
    </div>
    <p className="mini-note">Below {DISMISS_AT} on either meter means dismissal. Treasury allocation: {usd(a.budget - a.spent)} of {usd(a.budget)} left · Salary {usd(roleOf(a.roleId).salary)}/mo.</p>
    <Tabs defaultValue="advisory" className="mt-2">
      <TabsList className="grid grid-cols-3 w-full">{a.docket.map(d => { const I = SLOT_ICON[d.slot]; return <TabsTrigger key={d.slot} value={d.slot} aria-label={SLOT_LABEL[d.slot]}><I className="size-4" />{d.resolved && <CheckCircle2 className="size-3" />}</TabsTrigger>; })}</TabsList>
      {a.docket.map(d => { const dil = dilemmaOf(d.slot, d.dilemma); return <TabsContent key={d.slot} value={d.slot} className="appoint-slot">
        <span className="eyebrow">{SLOT_LABEL[d.slot]} · {a.quarter}</span><h4>{dil.title}</h4>
        {d.resolved ? <p className="docket-resolution" role="status">{d.outcome}</p>
          : <div className="grid gap-2">{slotOptions(a, d).map(o => <Button key={o.id} variant={o.id === 'neutral' || o.id === 'delegate' ? 'gameOutline' : 'game'} disabled={o.disabled || career.actions < ACTION_COST} title={o.reason} onClick={() => onResult(resolveAppointmentSlot(career, d.slot, o.id, a.revision))}><span>{o.label} · 15% energy<small className="docket-trade">{o.cost ? `${usd(o.cost)} treasury · ` : ''}{o.detail}</small></span></Button>)}</div>}
      </TabsContent>; })}
    </Tabs>
    <div className="grid grid-cols-2 gap-2 mt-3">
      <Button variant="gameOutline" onClick={() => setConfirm('resign')}><LogOut /> Resign</Button>
      <Button variant="destructive" disabled={!a.misconduct} title={a.misconduct ? '' : 'You have no evidence of misconduct'} onClick={() => setConfirm('whistle')}><ShieldAlert /> Blow whistle</Button>
    </div>
    {a.misconduct && <p className="mini-note mt-1">Evidence: {a.superiorName} {a.misconduct}.</p>}
    <Dialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
      <DialogContent><DialogHeader><DialogTitle>{confirm === 'resign' ? `Resign as ${a.title}?` : `Expose ${a.superiorName}?`}</DialogTitle>
        <DialogDescription>{confirm === 'resign' ? `You will leave office and ${a.superiorName} will think less of you.` : 'Reputation +8 and new openings, but the appointment ends, your superior becomes a bitter enemy, their party allies turn on you, and there is a risk of a costly retaliation suit.'}</DialogDescription></DialogHeader>
        <Button variant={confirm === 'whistle' ? 'destructive' : 'game'} onClick={() => { onResult(confirm === 'resign' ? resignAppointment(career) : whistleblow(career)); setConfirm(null); }}>Confirm</Button>
      </DialogContent>
    </Dialog>
  </section>;
}

/** Campaign Dashboard focus while backing another politician for an appointment pledge. */
export function PledgeCard({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const ap = appointmentsOf(career), p = ap.pledge;
  const [pick, setPick] = useState(false);
  if (!p) {
    if (career.campaign || ap.current) return null;
    const list = backableCandidates(career);
    if (!list.length) return null;
    return <div className="appoint-pledge"><div className="panel-row"><b><Handshake className="inline size-4" /> Back a candidate for an appointment</b><Button size="sm" variant="gameOutline" onClick={() => setPick(!pick)}>{pick ? 'Hide' : `${list.length} options`}</Button></div>
      {pick && <div className="grid gap-2 mt-2">{list.map(x => <div key={x.id} className="network-row"><img src={figurePortraitById(x.id, profileOf(x.id).portrait)} alt="" width={44} height={44} /><small className="flex-1"><b>{x.name}</b> · {x.party}<br />{x.office} → running for {x.race}</small><Button size="sm" variant="game" disabled={career.actions < ACTION_COST} onClick={() => onResult(backCandidate(career, x.id))}>Pledge</Button></div>)}<p className="mini-note">Pledging puts your own candidacy on hold until their election concludes.</p></div>}
    </div>;
  }
  const prof = profileOf(p.figureId);
  return <div className="appoint-pledge focus"><div className="flex gap-3 items-center"><img src={figurePortraitById(prof.id, prof.portrait)} alt="" width={56} height={56} /><div><span className="eyebrow">Campaign focus · Appointment pledge</span><h3>{prof.name} for {p.race}</h3><small className="mini-note">Election {monthLabel(p.electionDate)} · Effort {p.effort} · Win odds ~{Math.round(pledgeOdds(career) * 100)}%</small></div></div>
    <p className="mini-note mt-1">Your own run is blocked until this election concludes.</p>
    <div className="grid grid-cols-2 gap-2 mt-2"><Button variant="game" disabled={career.actions < ACTION_COST || p.lastEffort === career.date} onClick={() => onResult(campaignForCandidate(career))}>Campaign for them · 15% energy</Button><Button variant="gameOutline" onClick={() => onResult(withdrawPledge(career))}>Withdraw pledge</Button></div>
  </div>;
}

/** Animated turn-report cards for this quarter's appointment developments. */
export function AppointmentReportCards({ career }: { career: Career }) {
  const notes = freshAppointmentNotes(career);
  if (!notes.length) return null;
  const tier = career.appointments?.current?.tier ?? 'state';
  return <section className="grid gap-2 mb-2" aria-label="Appointment developments">
    {notes.slice(0, 4).map((n, i) => <div key={i} className={`network-note note-${n.tone}`} style={{ animationDelay: `${i * 140}ms` }}><img src={ART[tier]} alt="" width={48} height={48} /><small><b>Appointment</b><br />{n.text}</small></div>)}
  </section>;
}
