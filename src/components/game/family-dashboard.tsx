import { useState } from 'react';
import { Heart, CalendarDays, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/support';
import { socialOf } from '@/lib/game/relationships';
import {
  answerRequest, doFamilyAction, familyActionAvailability, familyActionCost, familyActions, familyRoster, harmonyLabel, householdOf, upcomingMilestones,
  type ChildPath, type FamilyActionId, type FamilyMember,
} from '@/lib/game/household';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
type Act = ((r: Result) => void) | undefined;
const PATHS: { id: ChildPath; label: string }[] = [{ id: 'career', label: 'Independent career' }, { id: 'business', label: 'Family business' }, { id: 'politics', label: 'Junior candidate' }];

function MemberCard({ m, career, act }: { m: FamilyMember; career: Career; act: Act }) {
  const childActs: FamilyActionId[] = m.kind === 'Child' ? (m.age >= 18 ? ['career_guidance'] : m.age >= 13 ? ['school_support', 'mentor'] : m.age >= 6 ? ['school_support'] : []) : [];
  return <article className="family-card" aria-label={`${m.kind}: ${m.name}`}>
    <img src={m.portrait} alt={m.name} loading="lazy" width={64} height={80} />
    <div className="min-w-0">
      <div className="family-card-head"><b>{m.name}</b><span className="life-badge">{m.kind}</span></div>
      <small className="family-meta">Age {m.age} · {m.personality} · {m.occupation}</small>
      <div className="family-stats"><span>❤ {m.affinity}%</span><span>Health {m.health}</span><span>Ambition {m.ambition}</span>{m.education !== undefined && <span>Edu {m.education}</span>}</div>
      {childActs.map(id => {
        const a = familyActions.find(x => x.id === id)!;
        const chk = familyActionAvailability(career, id, m.id);
        if (id === 'career_guidance') return m.path && m.path !== 'none'
          ? <p key={id} className="mini-note">Path chosen. Carries into succession.</p>
          : <div key={id} className="family-paths">{PATHS.map(p => <Button key={p.id} size="sm" variant="gameOutline" disabled={!chk.ok || !act} onClick={() => act?.(doFamilyAction(career, id, m.id, p.id))}>{p.label}</Button>)}</div>;
        return <Button key={id} size="sm" variant={chk.ok ? 'gameOutline' : 'gameQuiet'} className="mt-1 mr-1" disabled={!chk.ok || !act} title={chk.reason || a.desc} onClick={() => act?.(doFamilyAction(career, id, m.id))}>{a.name}{a.cost ? ` · ${usd(a.cost)}` : ''}</Button>;
      })}
    </div>
  </article>;
}

/** Phase 6 family dashboard: harmony, milestones, roster, quarterly actions, requests and recent events. */
export function FamilyDashboard({ career, onResult }: { career: Career; onResult?: Act }) {
  const s = socialOf(career), h = householdOf(s), roster = familyRoster(career), miles = upcomingMilestones(career);
  const [showAll, setShowAll] = useState(false);
  const general = familyActions.filter(a => !a.perChild);
  const shown = showAll ? roster : roster.slice(0, 4);
  return <section aria-label="Family dashboard" className="family-dash mt-3">
    <div className="family-harmony">
      <div className="health-head"><span className="eyebrow"><Heart className="inline size-3" /> Family Harmony</span><b data-testid="family-harmony">{h.harmony}% · {harmonyLabel(h.harmony)}</b></div>
      <div className="health-meter" role="meter" aria-label="Family harmony" aria-valuemin={0} aria-valuemax={100} aria-valuenow={h.harmony}><span style={{ width: `${h.harmony}%` }} /></div>
      {h.separatedSince && <p className="shortfall mt-1">Separated since {h.separatedSince.slice(0, 7)}. Rebuild affinity to 40% or face divorce.</p>}
      {h.supportiveSince && <p className="mini-note mt-1">Your spouse is boosting your image and campaign morale each quarter.</p>}
    </div>

    {h.request && <div className="family-request">
      <p><HandCoins className="inline size-4" /> <b>{h.request.from}</b> {h.request.kind === 'loan' ? `asks to borrow ${usd(h.request.amount)}.` : 'asks you to pull strings for a government job.'}</p>
      <div className="family-paths"><Button size="sm" variant="game" disabled={!onResult} onClick={() => onResult?.(answerRequest(career, true))}>{h.request.kind === 'loan' ? 'Lend' : 'Grant favor'}</Button><Button size="sm" variant="gameOutline" disabled={!onResult} onClick={() => onResult?.(answerRequest(career, false))}>Refuse</Button></div>
    </div>}

    <h3 className="section-label mt-3">Quarterly family time</h3>
    <div className="family-actions">
      {general.map(a => { const chk = familyActionAvailability(career, a.id); const cost = familyActionCost(career, a.id); return <Button key={a.id} size="sm" variant={chk.ok ? 'gameOutline' : 'gameQuiet'} disabled={!chk.ok || !onResult} title={chk.reason || a.desc} aria-label={`${a.name}${chk.ok ? '' : ` — ${chk.reason}`}`} onClick={() => onResult?.(doFamilyAction(career, a.id))}>
        <span>{a.name}</span><small>{cost ? usd(cost) : 'Free'}{a.actions ? ` · ${a.actions}A` : ''}</small>
      </Button>; })}
    </div>

    {miles.length > 0 && <><h3 className="section-label mt-3"><CalendarDays className="inline size-4" /> Upcoming milestones</h3>
      <ul className="family-miles">{miles.map((m, i) => <li key={i}><span>{m.date}</span>{m.text}</li>)}</ul></>}

    <h3 className="section-label mt-3">Family members</h3>
    {roster.length ? <div className="family-roster">{shown.map(m => <MemberCard key={m.id} m={m} career={career} act={onResult} />)}</div> : <p className="mini-note">No family yet.</p>}
    {roster.length > 4 && <Button size="sm" variant="gameQuiet" className="w-full mt-1" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show less' : `Show all ${roster.length}`}</Button>}

    {h.events.length > 0 && <><h3 className="section-label mt-3">Recent family events</h3>
      <ul className="family-miles">{h.events.slice(0, 5).map(e => <li key={e.id}><span>{e.date.slice(0, 7)}</span><b>{e.title}</b> — {e.text}{e.amount ? ` (${usd(e.amount)})` : ''}</li>)}</ul></>}
  </section>;
}
