import { FamilyPlanning } from './dynasty-panels';
import { FamilyDashboard } from './family-dashboard';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/support';
import { turnLabel } from '@/lib/game/gameplay';
import {
  archetypeById, PROPOSAL_AFFINITY, HAPPY_FAMILY_AFFINITY, FAMILY_STRESS_RELIEF, beginDating, datingAvailability, familyStressRelief, holdWedding, interactWithContact,
  interactionAvailability, interactionCatalog, interactionLabel, proposalAvailability, proposeMarriage, socialOf, weddingPackages, weddingReputation,
  type SocialContact,
} from '@/lib/game/relationships';
import { SOCIAL_EVENTS, attendSocialEvent, eventAvailability, pendingEventOf, pendingIntroductions, respondToIntroduction } from '@/lib/game/social-events';
import { MIXER_ASSET, relationshipTier, socialView, standingImpact } from '@/lib/game/social';
import { contactPortrait, datingPortrait } from './dating-portraits';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
type Act = ((r: Result) => void) | undefined;

function Affinity({ value, label }: { value: number; label: string }) {
  return <div className="social-affinity">
    <div className="health-head"><span className="eyebrow">Affinity</span><b>{value}%</b></div>
    <div className="health-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><span style={{ width: `${value}%` }} /></div>
  </div>;
}

/** Coffee, dinner/date and gift buttons. Blocked reasons are grouped so the note stays short on phones. */
function Interactions({ career, person, romantic, act }: { career: Career; person: SocialContact; romantic: boolean; act: Act }) {
  const rows = interactionCatalog.map(i => ({ i, label: interactionLabel(i, romantic), short: romantic ? i.romanticShort : i.short, a: interactionAvailability(career, person.id, i.id) }));
  const groups = new Map<string, string[]>();
  for (const r of rows) if (!r.a.ok) groups.set(r.a.reason, [...(groups.get(r.a.reason) ?? []), r.short]);
  const note = groups.size === 1 && [...groups.values()][0]!.length === rows.length ? [...groups.keys()][0] : [...groups].map(([reason, names]) => `${names.join(' & ')}: ${reason}`).join(' ');
  return <>
    <div className="contact-actions">
      {rows.map(r => <Button key={r.i.id} size="sm" variant={r.a.ok ? 'gameOutline' : 'gameQuiet'} aria-label={`${r.label} · ${usd(r.i.cost)}`} disabled={!r.a.ok || !act} onClick={() => act?.(interactWithContact(career, person.id, r.i.id))}>
        <span>{r.short}</span><small>{usd(r.i.cost)}</small>
      </Button>)}
    </div>
    {note && <p className="shortfall mt-1">{note}</p>}
  </>;
}

function ContactCard({ c, career, act }: { c: SocialContact; career: Career; act: Act }) {
  const tier = relationshipTier(c);
  const dating = datingAvailability(career, c.id);
  const showDating = dating.eligible && (dating.ok || (c.archetypeId === 'romantic' && dating.reason !== 'You are already in a relationship.'));
  return <article className="contact-card" aria-label={c.name}>
    <img src={contactPortrait(c)} alt={c.name} loading="lazy" width={736} height={912} />
    <div className="contact-body">
      <h4>{c.name}</h4>
      <small>{c.role}</small>
      <div className="life-badges"><span className={tier === 'Acquaintance' ? 'life-badge quality' : 'life-badge owned'} data-testid="contact-tier">{tier}</span></div>
      <Affinity value={c.affinity} label={`${c.name} affinity`} />
      <p className="contact-standing">{standingImpact(c)}</p>
      <Interactions career={career} person={c} romantic={c.archetypeId === 'romantic'} act={act} />
      {showDating && <>
        <Button size="sm" variant={dating.ok ? 'game' : 'gameOutline'} className="w-full mt-2" disabled={!dating.ok || !act} onClick={() => act?.(beginDating(career, c.id))}>Begin Dating</Button>
        {!dating.ok && <p className="mini-note mt-1">{dating.reason}</p>}
      </>}
    </div>
  </article>;
}

function Requirement({ met, children }: { met: boolean; children: string }) {
  return <li className={met ? 'social-req met' : 'social-req'}>{met ? <Check aria-hidden /> : <X aria-hidden />}<span>{children}</span><span className="sr-only">{met ? ' (met)' : ' (not yet)'}</span></li>;
}

/** Partner actions and the next romance milestone: proposal while dating, wedding budget while engaged. */
function PartnerMilestones({ career, act }: { career: Career; act: Act }) {
  const s = socialOf(career);
  const p = s.partner!;
  if (s.maritalStatus === 'dating') {
    const check = proposalAvailability(career);
    return <div className="social-milestone">
      <h4>Next step: engagement</h4>
      <ul className="social-reqs">
        <Requirement met={check.affinity}>{`${PROPOSAL_AFFINITY}% affinity with ${p.name}`}</Requirement>
        <Requirement met={check.housing}>Stable housing, no rent owed</Requirement>
        <Requirement met={check.time}>Dating for at least one turn</Requirement>
      </ul>
      <Button variant={check.ok ? 'game' : 'gameOutline'} className="w-full mt-2" disabled={!check.ok || !act} onClick={() => act?.(proposeMarriage(career))}>Propose Marriage</Button>
    </div>;
  }
  if (s.maritalStatus === 'engaged') return <div className="social-milestone">
    <h4>Plan the wedding</h4>
    <p className="mini-note">Paid once from personal cash. A bigger celebration lifts your reputation a little more.</p>
    <div className="wedding-options">
      {weddingPackages.map(w => {
        const ok = career.money >= w.budget;
        return <div key={w.id} className="wedding-option">
          <div><b>{w.name}</b><small>+{weddingReputation(w.budget)} reputation</small></div>
          <Button size="sm" variant={ok ? 'game' : 'gameOutline'} disabled={!ok || !act} aria-label={`${w.name} · ${usd(w.budget)}`} onClick={() => act?.(holdWedding(career, w.budget))}>{ok ? usd(w.budget) : `Requires ${usd(w.budget)}`}</Button>
        </div>;
      })}
    </div>
  </div>;
  const relief = familyStressRelief(s);
  return <div className="social-milestone">
    <h4>Married{p.weddingDate ? ` since ${turnLabel(p.weddingDate)}` : ''}</h4>
    <p className="mini-note" data-testid="family-relief">{relief ? `A happy home eases ${FAMILY_STRESS_RELIEF} stress each turn.` : `Spend time together: above ${HAPPY_FAMILY_AFFINITY}% affinity, home life eases stress each turn.`}</p>
  </div>;
}

/** Party & Social Events plus pending post-turn introductions the player can accept or decline. */
function SocialEvents({ career, act }: { career: Career; act: Act }) {
  const intros = pendingIntroductions(career);
  const planned = pendingEventOf(career);
  return <section aria-label="Party & Social Events" className="mt-3">
    <h3 className="section-label">Party & Social Events</h3>
    {intros.map(({ person, venue }) => <div key={person.id} className="dependent-row" aria-label={`Introduction: ${person.name}`}>
      <img src={datingPortrait(person.id) ?? archetypeById(person.archetypeId)?.portrait} alt={person.name} loading="lazy" width={736} height={912} />
      <div><b>{person.name}, {person.age}</b><small>{person.role} · {person.personality} · met at {venue}</small><small>{person.bio}</small></div>
      <span className="flex gap-1">
        <Button size="sm" variant="game" disabled={!act} onClick={() => act?.(respondToIntroduction(career, person.id, true))}>Stay in touch</Button>
        <Button size="sm" variant="outline" disabled={!act} onClick={() => act?.(respondToIntroduction(career, person.id, false))}>Decline</Button>
      </span>
    </div>)}
    <p className="mini-note">{planned ? `You're attending ${planned.venue} this turn.` : 'Each event needs 15% energy. Anyone you meet is introduced after the turn.'}</p>
    <div className="grid grid-cols-2 gap-2 mt-2">
      {SOCIAL_EVENTS.map(e => { const a = eventAvailability(career, e); return <Button key={e.id} variant="outline" className="h-auto flex-col items-start py-2 whitespace-normal text-left" disabled={!a.ok || !act} onClick={() => act?.(attendSocialEvent(career, e.id))}>
        <span>{e.name} · {usd(e.cost)}</span>{!a.ok && <small className="mini-note">{a.reason}</small>}
      </Button>; })}
    </div>
  </section>;
}

/** Circle & Family dashboard: dates, gifts and romance paid from personal cash only. */
export function SocialPanel({ career, onResult }: { career: Career; onResult?: Act }) {
  const v = socialView(career);
  const [tab, setTab] = useState<'circle' | 'family'>('circle');
  const list = tab === 'circle' ? v.circle : v.family;
  const tabs = <div className="garage-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'circle'} onClick={() => setTab('circle')}>Personal Circle</button>
      <button type="button" role="tab" aria-selected={tab === 'family'} onClick={() => setTab('family')}>Family</button>
    </div>;
  const contacts = list.length
      ? <div className="contact-grid">{list.map(c => <ContactCard key={c.id} c={c} career={career} act={onResult} />)}</div>
      : <p className="mini-note mt-2">{tab === 'circle' ? 'No friends or contacts yet.' : 'No family contacts on file.'}</p>;
  return <>
    {tabs}
    {tab === 'family' ? <>
    {v.partner
      ? <>
          <section className="social-hero" aria-label="Family & partner">
            <img className="social-hero-portrait" src={contactPortrait(v.partner)} alt={v.partner.name} width={736} height={912} />
            <div className="social-hero-body">
              <span className="eyebrow">Your partner</span>
              <h3>{v.partner.name}</h3>
              <div className="life-badges"><span className="life-badge owned" data-testid="marital-status">{v.label}</span><span className="life-badge quality">Partner</span></div>
              <Affinity value={v.partner.affinity} label="Partner affinity" />
              {v.maritalStatus === 'married' && <div className="social-allowance"><span>Shared household</span><b data-testid="family-allowance">{usd(v.familyAllowance)}/quarter</b></div>}
            </div>
          </section>
          <section className="social-partner-panel" aria-label="Time together">
            <Interactions career={career} person={v.partner} romantic act={onResult} />
            <PartnerMilestones career={career} act={onResult} />
          </section>
        </>
      : <p className="mini-note mt-2">{v.label}</p>}
    <section aria-label="Dependents" className="mt-3">
      <h3 className="section-label">Dependents</h3>
      {v.dependents.length
        ? <div className="dependent-list">{v.dependents.map(d => <div key={d.id} className="dependent-row" aria-label={d.name}>
            <img src={d.portrait} alt={d.name} loading="lazy" width={736} height={912} />
            <div><b>{d.name}</b><small>Age {d.age}</small></div>
            <span>{usd(d.quarterly)}<small>per quarter</small></span>
          </div>)}
          <div className="social-allowance"><span>Schooling & support</span><b data-testid="dependents-total">{usd(v.dependentsTotal)}/quarter</b></div>
        </div>
        : <p className="mini-note">No children or dependents yet.</p>}
    </section>
    <FamilyDashboard career={career} onResult={onResult} />
    <FamilyPlanning career={career} onResult={onResult} />
    <h3 className="section-label mt-3">Relatives</h3>
    {contacts}
    </> : <>
    <section className="life-hero" aria-label="Family & partner">
      <img className="life-hero-img social-mixer" src={MIXER_ASSET} alt="An evening reception" width={1024} height={768} />
      <div className="life-hero-body">
        <span className="eyebrow">Relationship status</span>
        <div className="life-badges"><span className="life-badge" data-testid={tab === 'circle' ? 'marital-status' : undefined}>{v.label}</span></div>
        <p className="mini-note mt-2">{v.partner ? 'Time with your partner and family is under the Family tab.' : v.maritalStatus === 'divorced' ? 'A fresh chapter. Your circle can introduce you to someone new.' : 'Fundraisers, galas and community nights are where people meet.'}</p>
      </div>
    </section>
    <SocialEvents career={career} act={onResult} />
    {contacts}
    </>}

    <div className="life-cash"><span>Personal cash</span><b data-testid="social-cash">{usd(career.money)}</b></div>
    <p className="mini-note mt-2">{career.actions}% energy left this turn. Coffee and dinners use 15% energy; gifts use none. You can see each person once per turn. Paid from personal cash only, separate from political allies.</p>
  </>;
}
