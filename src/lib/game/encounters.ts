import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { GameEvent, Result } from './gameplay';
import type { EncounterScene } from './encounter-schema';
import { rand, takePoll, groupRel } from './campaign';
import { socialOf, clampAffinity } from './relationships';
import { familyImage, FAMILY_IMAGE_GROUPS, FAMILY_IMAGE_BOOST, STRAIN_SUPPORT_PENALTY } from './family';
import { supportGroupsOf, shiftLoyalty } from './support-groups';
import { darkMoneyOffer, acceptDarkMoney, declineDarkMoney } from './corruption';
import { registerScandal } from './scandals';
import { mayorAction, cityState, officials, cityCost, cityFunds } from './city';
import { governorAction, stateGovernment, stateOfficials, stateCost, stateFunds } from './state-government';
import { federalAction, federalState, federalOfficials } from './federal';
import { activeOffice, tenureKey } from './support';
import { isDetained } from './prison';

const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
export const ENCOUNTER_RULES = { consolation: 500, dinner: 250, nepotismRisk: 0.35, nepotismAffinity: 12, refusalAffinity: -8, rivalMomentum: 2 } as const;
const campaignId = (c: Career) => c.campaign ? `${c.campaign.office}|${c.campaign.startDate}` : undefined;
const relativeOf = (c: Career) => socialOf(c).contacts.find(p => p.archetypeId === 'sibling') ?? socialOf(c).contacts.find(p => p.status === 'family');
const romanticOf = (c: Career) => socialOf(c).partner ?? socialOf(c).contacts.find(p => p.archetypeId === 'romantic');

function appointmentSlot(c: Career) {
  if (!activeOffice(c)) return undefined;
  if (c.office?.id === 'mayor') return officials.find(o => !cityState(c).officials.some(x => x.role === o.role));
  if (c.office?.id === 'governor') return stateOfficials.find(o => !stateGovernment(c).officials.some(x => x.role === o.role));
  if (c.office?.id === 'president') return federalOfficials.find(o => !federalState(c).nominations.some(x => x.role === o.role && x.status !== 'rejected'));
  return undefined;
}
const choice = (id: string, label: string, hint: string, disabled = false) => ({ id, label, hint, disabled });

/** One immutable narrative snapshot per quarter; all random checks are seeded. */
export function buildEncounter(c: Career, archetype: EncounterScene['archetype'], contextId?: string): GameEvent | null {
  if (c.mode !== 'sandbox' || isDetained(c)) return null;
  const base = { id: `encounter|${c.date}|${archetype}`, parties: [c.character.name], tenure: c.office ? tenureKey(c) : undefined };
  const scene = (s: Omit<EncounterScene, 'archetype' | 'opening'>, opening: string): EncounterScene => ({ ...s, archetype, opening });
  if (archetype === 'nepotism') {
    const p = relativeOf(c), slot = appointmentSlot(c);
    if (!p || !slot) return null;
    const cost = c.office?.id === 'mayor' ? cityCost(c, 'appointment') : c.office?.id === 'governor' ? stateCost(c, 'appointment') : 0;
    const funds = c.office?.id === 'mayor' ? cityFunds(c) : c.office?.id === 'governor' ? stateFunds(c) : Infinity;
    return { ...base, title: 'Blood before duty', parties: [...base.parties, p.name], cost,
      text: `“You can put my name forward as ${slot.role}. After everything this family did for you, why should a stranger get the chance?” ${p.name} slides a résumé across the kitchen table. The role is real. So is the conflict of interest.`,
      scene: scene({ backdrop: 'home', setting: 'Home kitchen · after dark', speaker: p.name, role: p.role, personId: p.id, portrait: p.portrait, contextId: slot.role, reaction: 'alert' }, 'Family is not supposed to feel like another negotiation.'),
      choices: [choice('appoint', c.office?.id === 'president' ? 'Nominate your relative' : 'Put your relative forward', `1 action · ${cost ? `${usd(cost)} public cost if approved · ` : 'Senate confirmation required · '}family affinity +12 · reputation −2 · 35% scandal risk; approval not guaranteed`, c.actions < ACTION_COST || cost > funds), choice('console', 'Offer private consolation', `${usd(ENCOUNTER_RULES.consolation)} personal cash · family affinity +6 · no public favor`, c.money < ENCOUNTER_RULES.consolation), choice('refuse', 'Draw a firm ethical line', 'Family affinity −8 · reputation +1 · no public spending')] };
  }
  if (archetype === 'corruption') {
    if (c.character.party === 'Independent') return null;
    const offer = darkMoneyOffer(c);
    if (!offer && c.position === 'none' && !c.office) return null;
    return { ...base, title: 'The price of loyalty', parties: [...base.parties, 'County party whip'], cost: offer?.amount,
      text: offer ? `“${usd(offer.amount)}. No donor names, no questions. Keep our allies happy and we keep you competitive.” The party whip closes the lounge door. The shell PAC money would be spendable campaign cash—but the missing disclosures leave an audit trail.` : '“Promise your next committee vote to our donors, and leadership will remember who helped.” The whip calls it unity. You call it a vote traded before the public ever gets a hearing.',
      scene: scene({ backdrop: 'backroom', setting: 'Private lounge · a closed-door meeting', speaker: 'County party whip', role: `${c.character.party} leadership`, portrait: 'figure:ashford', campaignId: campaignId(c), reaction: 'alert' }, 'Loyalty has a price. Tonight, someone expects you to pay it.'),
      choices: [choice('dirty', offer ? 'Take the undisclosed money' : 'Agree to the vote trade', `${offer ? `${usd(offer.amount)} campaign cash · audit exposure +${offer.evidence}` : 'Party standing +5 · documented ethics allegation'} · reputation −3`), choice('expose', 'Refuse and report the approach', 'Reputation +2 · party standing −6 · no money or votes traded'), choice('lawful', 'Broker a lawful compromise', 'Party standing +1 · reputation +0.5 · no instant funds or promised votes')] };
  }
  if (archetype === 'romance') {
    const p = romanticOf(c); if (!p || !c.life) return null;
    const neglected = (p.neglect ?? 0) >= 2 || p.affinity < 45;
    return { ...base, title: neglected ? 'When the lights go out' : 'An evening without speeches', parties: [...base.parties, p.name],
      text: neglected ? `“I see you on every screen, but I never see you here.” ${p.name} has left dinner untouched. “Do I still fit into the life you are building?”` : socialOf(c).partner ? `“Tonight, can we just be us?” ${p.name} puts your phone face down between the candles. There are no cameras, no donors, and no applause to hide behind.` : `“I stayed after the fundraiser because I wanted to see you, not the candidate.” ${p.name} smiles nervously. “Would you like to have dinner—just the two of us?”`,
      scene: scene({ backdrop: neglected ? 'home' : 'gala', setting: neglected ? 'Home · an untouched dinner' : 'A quiet table · away from the cameras', speaker: p.name, role: socialOf(c).partner ? 'Your partner' : p.role, personId: p.id, portrait: p.portrait, reaction: 'heart' }, neglected ? 'The hardest questions do not come from the press.' : 'For once, there is nothing here to win.'),
      choices: [choice('dinner', 'Make tonight about them', `${usd(ENCOUNTER_RULES.dinner)} personal cash · affinity +12 · stress −15`, c.money < ENCOUNTER_RULES.dinner), choice('talk', 'Be honest about the pressure', 'Affinity +5 · stress −5 · no cost'), choice('neglect', 'Put political work first', 'Affinity −10 · stress +5 · may strain family image')] };
  }
  if (archetype === 'rival') {
    const rival = c.campaign?.opponents.find(p => !p.out); if (!rival || !c.campaign) return null;
    return { ...base, title: 'Behind the applause', parties: [...base.parties, rival.name],
      text: `“Drop your attacks, or I make your record the story.” ${rival.name} intercepts you behind the stage. An aide is watching. Retreat, escalation, or a public challenge—any answer will follow you into the campaign.`,
      scene: scene({ backdrop: 'townhall', setting: 'Backstage · minutes before the cameras', speaker: rival.name, role: `${rival.party} rival`, portrait: `player:${rival.portrait ?? 1}`, campaignId: campaignId(c), personId: rival.name, reaction: 'stress' }, 'The microphones are off. The campaign is not.'),
      choices: [choice('challenge', 'Challenge them on the record', 'Momentum +2 · communication +0.5 · rival momentum +1'), choice('truce', 'Offer a mutual clean-campaign truce', 'Stress −5 · reputation +1 · rival momentum −1'), choice('retreat', 'Back down from the confrontation', 'Momentum −1 · stress −3 · rival momentum +1')] };
  }
  if (archetype === 'crisis') {
    const crisis = c.crises.find(x => x.id === contextId); if (!crisis || !activeOffice(c)) return null;
    return { ...base, id: `${base.id}|${crisis.id}|${crisis.status}`, title: `An urgent call: ${crisis.title}`, parties: [...base.parties, 'Emergency coordinator'],
      text: `“People need to know you understand what is happening.” Your coordinator brings the latest on ${crisis.title}: ${crisis.description} This conversation sets your public tone; the funded response still has to go through your government desk.`,
      scene: scene({ backdrop: 'warroom', setting: 'Emergency briefing room', speaker: 'Emergency coordinator', role: 'Public response team', portrait: 'figure:kim', contextId: crisis.id, reaction: 'alert' }, 'An ordinary evening becomes a test of leadership.'),
      choices: [choice('listen', 'Hear the affected residents first', 'Stress +3 · reputation +1 · crisis still needs a funded response'), choice('brief', 'Deliver a measured public briefing', 'Communication +0.5 · stress +1 · no public money spent'), choice('dismiss', 'Leave the explanation to staff', 'Reputation −1 · stress −2 · crisis remains unresolved')] };
  }
  const election = c.elections.find(e => `${e.office}|${e.date}|${e.stage}` === contextId);
  if (!election) return null;
  return { ...base, id: `${base.id}|${contextId}`, title: election.won ? 'After the victory' : 'After the count', parties: [...base.parties, 'Campaign confidant'],
    text: election.won ? '“You won. Now the promises have to mean something.” Your confidant waits in the emptied ballroom. Do you thank the people who carried you here, or turn immediately toward the next battle?' : '“The result is final. What you do with it is not.” Your confidant pulls up a chair beside the abandoned campaign signs. A loss can become a lesson—or a grievance.',
    scene: scene({ backdrop: 'ballroom', setting: 'Election ballroom · after the crowd leaves', speaker: 'Campaign confidant', role: 'A trusted campaign aide', portrait: 'figure:morgan', contextId, reaction: 'handshake' }, 'The crowd has gone. The next chapter is yours.'),
    choices: [choice('reflect', 'Thank the team and take stock', 'Reputation +1 · stress −5'), choice('learn', 'Ask for an honest debrief', 'Knowledge +0.5 · stress −2'), choice('push', 'Turn straight to the next fight', 'Stress +5 · leadership +0.5')] };
}

/** Crisis transitions outrank fresh general results; quiet turns retain the legacy event roll. */
export function rollEncounter(c: Career, before: Career, roll = rand(`${c.character.name}|${c.date}|encounter-chance`)): GameEvent | null {
  if (c.mode !== 'sandbox' || isDetained(c)) return null;
  const fresh = c.crises.filter(x => x.status !== 'resolved' && !before.crises.some(p => p.id === x.id && p.status === x.status)).sort((a, b) => b.severity - a.severity)[0];
  if (fresh) { const event = buildEncounter(c, 'crisis', fresh.id); if (event) return event; }
  const election = c.elections.find(e => e.stage === 'general' && !before.elections.some(p => p.office === e.office && p.date === e.date && p.stage === e.stage));
  if (election) return buildEncounter(c, 'milestone', `${election.office}|${election.date}|${election.stage}`);
  if (roll >= 0.55) return null;
  const pool = (['nepotism', 'corruption', 'romance', 'rival'] as const).map(k => buildEncounter(c, k)).filter((e): e is GameEvent => !!e);
  // Avoid the same archetype in consecutive quarters when there is another eligible scene.
  const previous = c.eventHistory.at(-1)?.scene?.archetype;
  const varied = pool.filter(e => e.scene?.archetype !== previous);
  const eligible = varied.length ? varied : pool;
  return eligible[Math.floor(rand(`${c.character.name}|${c.date}|encounter-kind`) * eligible.length)] ?? null;
}

function affinityShift(c: Career, id: string, delta: number, seen = false): Career {
  if (!c.life) return c;
  const s = socialOf(c), update = <T extends { id: string; affinity: number }>(p: T): T => p.id === id ? { ...p, affinity: clampAffinity(p.affinity + delta), ...(seen ? { lastInteraction: c.date, neglect: 0 } : {}) } : p;
  return { ...c, life: { ...c.life, social: { ...s, contacts: s.contacts.map(update), partner: s.partner ? update(s.partner) : null } } };
}

/** Uses the existing voted/allocated appointment path; only substitutes the nominee's identity. */
function nominateRelative(c: Career, e: GameEvent): Result {
  const s = e.scene, slot = appointmentSlot(c);
  if (!s || !slot || slot.role !== s.contextId) return { ok: false, message: 'This appointment is no longer available.' };
  const result = c.office?.id === 'mayor' ? mayorAction(c, 'appoint', slot.role) : c.office?.id === 'governor' ? governorAction(c, 'appoint', slot.role) : federalAction(c, 'nominate', slot.role);
  if (!result.ok) return result;
  let n = result.career;
  const name = s.speaker;
  if (n.city) n = { ...n, city: { ...n.city, officials: n.city.officials.map(o => o.role === slot.role && o.name === slot.name ? { ...o, name } : o) } };
  if (n.stateGovernment) n = { ...n, stateGovernment: { ...n.stateGovernment, officials: n.stateGovernment.officials.map(o => o.role === slot.role && o.name === slot.name ? { ...o, name } : o) } };
  if (n.federalGovernment) n = { ...n, federalGovernment: { ...n.federalGovernment, nominations: n.federalGovernment.nominations.map(o => o.role === slot.role && o.name === slot.name && o.status === 'nominated' ? { ...o, name } : o) } };
  const replace = (t: string) => t.replaceAll(slot.name, name);
  return { ...result, message: replace(result.message), career: { ...n, log: n.log.map(replace), governmentDecisions: n.governmentDecisions.map(d => d.date === c.date ? { ...d, title: replace(d.title) } : d), newsQueue: n.newsQueue.map(st => ({ ...st, h: replace(st.h), sub: replace(st.sub), body: replace(st.body) })) } };
}

/** Caller supplies the current saved event; identity and history guard every effect across reloads. */
export function resolveEncounterChoice(c: Career, e: GameEvent, id: string): Result {
  const s = e.scene, option = e.choices.find(x => x.id === id);
  if (!s || !option || option.disabled || c.eventHistory.some(x => x.id === e.id)) return { ok: false, message: 'This response is unavailable or already resolved.' };
  if (c.report || c.newspaperPending || c.eventEncounter?.id !== e.id || c.pendingEvent !== e.id || isDetained(c)) return { ok: false, message: 'Continue to your saved encounter first.' };
  if (e.tenure && e.tenure !== tenureKey(c)) return { ok: false, message: 'This encounter belongs to a previous office.' };
  if (s.campaignId && s.campaignId !== campaignId(c)) return { ok: false, message: 'This campaign has changed.' };
  if (s.personId && ['nepotism', 'romance'].includes(s.archetype) && ![...socialOf(c).contacts, ...(socialOf(c).partner ? [socialOf(c).partner] : [])].some(p => p?.id === s.personId)) return { ok: false, message: 'This person is no longer in your circle.' };
  let n = c, rep = 0, stress = 0, skill: 'communication' | 'knowledge' | 'leadership' | undefined, momentum = 0, party = 0, note = option.label;
  const charge = (amount: number): boolean => {
    if (n.money < amount) return false;
    n = { ...n, money: n.money - amount, ledger: [{ month: c.date, label: `Encounter · ${e.title}`, amount: -amount }, ...n.ledger] }; return true;
  };
  if (s.archetype === 'nepotism' && s.personId) {
    if (id === 'appoint') {
      const appointment = nominateRelative(n, e); if (!appointment.ok) return appointment;
      n = appointment.career; note = appointment.message; rep = -2;
      n = affinityShift(n, s.personId, ENCOUNTER_RULES.nepotismAffinity);
      if (rand(`${e.id}|nepotism-risk`) < ENCOUNTER_RULES.nepotismRisk) n = registerScandal(n, { id: `${e.id}|nepotism`, title: 'Family favoritism allegation', summary: `${c.character.name} put ${s.speaker}, a relative, forward as ${s.contextId}. Critics question the selection process; kinship is documented, misconduct is not yet proven.`, source: 'Investigative Reporter', severity: 'Moderate', evidence: 45, trigger: 'office' });
    } else if (id === 'console') { if (!charge(ENCOUNTER_RULES.consolation)) return { ok: false, message: 'You need $500 in personal cash.' }; n = affinityShift(n, s.personId, 6); }
    else { n = affinityShift(n, s.personId, ENCOUNTER_RULES.refusalAffinity); rep = 1; }
  } else if (s.archetype === 'corruption') {
    if (id === 'dirty') {
      if (s.campaignId) { const offer = darkMoneyOffer(n); if (!offer || offer.amount !== e.cost) return { ok: false, message: 'The undisclosed offer is no longer available.' }; const r = acceptDarkMoney(n); if (!r.ok) return r; n = r.career; note = r.message; }
      else { party = 5; n = registerScandal(n, { id: `${e.id}|vote-trade`, title: 'Committee vote-trading allegation', summary: 'A closed-door promise to trade a future vote for donor influence was recorded. No bill was enacted or public funds transferred by the promise.', source: 'Whistleblower', severity: 'Moderate', evidence: 55, trigger: 'office' }); }
      rep = -3;
    } else {
      if (s.campaignId) { const r = declineDarkMoney(n); if (!r.ok) return r; n = r.career; }
      rep = id === 'expose' ? 2 : 0.5; party = id === 'expose' ? -6 : 1;
    }
  } else if (s.archetype === 'romance' && s.personId) {
    if (id === 'dinner' && !charge(ENCOUNTER_RULES.dinner)) return { ok: false, message: 'You need $250 in personal cash.' };
    n = affinityShift(n, s.personId, id === 'dinner' ? 12 : id === 'talk' ? 5 : -10, id !== 'neglect');
    stress = id === 'dinner' ? -15 : id === 'talk' ? -5 : 5;
    // Existing image transitions only; never clear unpaid-support strain or double-award stable image.
    if (n.life) {
      const social = socialOf(n), prior = social.familyImage ?? 'neutral';
      const unpaid = c.log.some(t => t.startsWith('Family Strain:')) && prior === 'strained';
      const image = familyImage(social, unpaid);
      if (image === 'stable' && prior !== 'stable') n = { ...n, groups: { ...n.groups, ...Object.fromEntries(FAMILY_IMAGE_GROUPS.map(g => [g, clamp(groupRel(n, g) + FAMILY_IMAGE_BOOST)])) }, approval: n.approval ? { ...n.approval, groups: { ...n.approval.groups, ...Object.fromEntries(FAMILY_IMAGE_GROUPS.map(g => [g, clamp((n.approval?.groups[g] ?? n.approval?.overall ?? 0) + FAMILY_IMAGE_BOOST)])) } } : n.approval };
      if (image === 'strained' && prior !== 'strained' && n.campaign) n = { ...n, campaign: { ...n.campaign, support: Math.max(0, n.campaign.support - STRAIN_SUPPORT_PENALTY) } };
      if (n.life) n = { ...n, life: { ...n.life, social: { ...social, familyImage: image } } };
    }
  } else if (s.archetype === 'rival') {
    if (!n.campaign || !n.campaign.opponents.some(p => p.name === s.personId && !p.out)) return { ok: false, message: 'This rival is no longer in the race.' };
    momentum = id === 'challenge' ? ENCOUNTER_RULES.rivalMomentum : id === 'retreat' ? -1 : 0;
    skill = id === 'challenge' ? 'communication' : undefined; rep = id === 'truce' ? 1 : 0; stress = id === 'truce' ? -5 : id === 'retreat' ? -3 : 0;
    n = { ...n, campaign: { ...n.campaign, opponents: n.campaign.opponents.map(p => p.name === s.personId ? { ...p, momentum: clamp(p.momentum + (id === 'truce' ? -1 : 1)) } : p) } };
  } else if (s.archetype === 'crisis') { rep = id === 'listen' ? 1 : id === 'dismiss' ? -1 : 0; stress = id === 'listen' ? 3 : id === 'brief' ? 1 : -2; skill = id === 'brief' ? 'communication' : undefined; }
  else if (s.archetype === 'milestone') { rep = id === 'reflect' ? 1 : 0; stress = id === 'reflect' ? -5 : id === 'learn' ? -2 : 5; skill = id === 'learn' ? 'knowledge' : id === 'push' ? 'leadership' : undefined; }
  n = { ...n, reputation: clamp(n.reputation + rep), skills: skill ? { ...n.skills, [skill]: clamp(n.skills[skill] + 0.5) } : n.skills, life: n.life ? { ...n.life, stress: clamp(n.life.stress + stress) } : n.life };
  if (party) n = shiftLoyalty(n, {}, e.title, party);
  if (n.campaign) {
    const campaign = { ...n.campaign, momentum: clamp(n.campaign.momentum + momentum) };
    n = { ...n, campaign }; n = { ...n, campaign: { ...campaign, polls: [...campaign.polls.filter(p => p.date !== n.date), takePoll(n, campaign, n.date)].slice(-6) } };
  }
  const actual: string[] = [];
  if (n.money !== c.money) actual.push(`${usd(n.money - c.money)} personal cash`);
  if (n.reputation !== c.reputation) actual.push(`${n.reputation - c.reputation > 0 ? '+' : ''}${Math.round((n.reputation - c.reputation) * 10) / 10} reputation`);
  if (n.life && c.life && n.life.stress !== c.life.stress) actual.push(`${n.life.stress - c.life.stress > 0 ? '+' : ''}${n.life.stress - c.life.stress} stress`);
  if (party) actual.push(`${supportGroupsOf(n).partyStanding - supportGroupsOf(c).partyStanding > 0 ? '+' : ''}${supportGroupsOf(n).partyStanding - supportGroupsOf(c).partyStanding} party standing`);
  const message = `${e.title}: ${note}.${actual.length ? ` ${actual.join(' · ')}.` : ''}`;
  return { ok: true, message, career: { ...n, pendingEvent: null, pendingEncounter: null, eventEncounter: null, eventHistory: [...n.eventHistory, { ...e, date: c.date, choice: id, consequences: message }], log: [message, ...n.log].slice(0, 12) } };
}