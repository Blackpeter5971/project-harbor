import { ACTION_COST, ENERGY_TIER, turnEnergyFor } from './energy-costs';
import { tubeTurn } from './tube';
import { podcastTurn } from './podcasts';
import { mailTurn, magazineTurn } from './dispatch';
import { eventsTurn } from './quarterly-events';
import { networkTurn } from './network';
import { appointmentTurn } from './appointments';
import { financeTurn } from './government-finance';
import { expireInvitations } from './media-hub';
import { applySpeechLoyalty, supportGroupsTurn } from './support-groups';
import { wardrobeReputationBonus } from './vehicles';
import { ACTIONS_PER_MONTH, type Career, type Party, type Position } from './career';
import { campaignTurn, publishEdition, groups, groupRel, takePoll, rand as campaignRandom } from './campaign';
import { officeSalary, payOfficeMonth } from './office-pay';
import { treasuryTurn } from './budget';
import { projectReportLines, publicProjectsTurn } from './public-projects';
import { crisesTurn, crisisLifecycleTurn } from './crises';
import { crisisReportLines } from './crisis-news';
import { approvalDrift, ensureApproval } from './approval';
import { impeachmentTurn } from './impeachment';
import { cityTurn } from './city';
import { stateTurn } from './state-government';
import { closeTenure, congressSession, presidentialReview } from './legislation';
import { getOfficeEvent, prepareOfficeEvent, resolveOfficeEvent, rollOfficeEvent } from './office-events';
import { archiveTerm, incumbentElection, monthsRemaining, nearTermEnd, termKey } from './terms';
import { collectRent } from './housing';
import { collectLiving } from './life';
import { collectTaxes } from './taxes';
import { collectFamily } from './family';
import { socialEventsTurn } from './social-events';
import { collectBusinesses } from './business';
import { socialTurn } from './social-media';
import { mediaTurn } from './media';
import { scandalsTurn } from './scandals';
import { scandalFalloutTurn } from './scandal-responses';
import { corruptionTurn } from './corruption';
import { legalTurn } from './legal';
import { isExecuted, isIncarcerated, isDetained, PRISON_LOCK } from './prison';
import { crimeTurn } from './crime';
import { pendingDebate, prepareDebate } from './debates';
import { bankingTurn } from './banking';
import { employmentPay, ensureEmploymentPay, reviewPromotion } from './employment';
import { jobs, missingJobRequirements, jobPerformanceMet, type Job } from './job-market';
import { docketBlocker, ensureExecutiveDocket } from './executive-docket';
import { dynastyTurn, managerMultiplier } from './dynasty';
import { captureLegacy, legacyOf } from './legacy';
import { mortalityTurn } from './mortality';
import { rollEncounter, resolveEncounterChoice } from './encounters';
import type { EncounterScene } from './encounter-schema';
export { jobs, type Job } from './job-market';

export type Result = { ok: true; career: Career; message: string } | { ok: false; message: string };
type Skill = keyof Career['skills'];
export const MONTHS_PER_TURN = 3;

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmt = (n: number) => r1(n).toLocaleString('en-US');
export function monthLabel(date: string) {
  const [y = 2026, m = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
const shortMonth = (date: string) => { const [y = 2026, m = 1] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }); };
export function nextMonth(date: string) {
  const [y = 2026, m = 1] = date.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
/** The three-month turn starting at `date`, e.g. "Jan – Mar 2026". */
export function turnLabel(date: string) {
  let end = date; for (let i = 1; i < MONTHS_PER_TURN; i++) end = nextMonth(end);
  return `${shortMonth(date)} – ${shortMonth(end)} ${end.slice(0, 4)}`;
}
const clamp = (n: number) => r1(Math.max(0, Math.min(100, n)));
function withLog(c: Career, msg: string): Career { return { ...c, log: [msg, ...c.log].slice(0, 12) }; }
function addEntry(c: Career, label: string, amount: number, month = c.date): Career {
  return { ...c, money: c.money + amount, ledger: [{ month, label, amount }, ...c.ledger] };
}
type Gains = Partial<Record<Skill | 'experience' | 'reputation' | 'relationships' | 'contacts', number>>;
function applyGains(c: Career, g: Gains): Career {
  const n: Career = { ...c, skills: { ...c.skills } };
  for (const [k, v = 0] of Object.entries(g)) {
    if (k in n.skills) n.skills[k as Skill] = clamp(n.skills[k as Skill] + v);
    else if (k === 'reputation') n.reputation = clamp(n.reputation + v);
    else if (k === 'experience') n.experience = r1(n.experience + v);
    else if (k === 'contacts') n.contacts = r1(Math.max(0, n.contacts + v));
    else if (k === 'relationships') n.relationships = r1(Math.max(0, n.relationships + v));
  }
  return n;
}
const gainNames: Record<string, string> = { experience: 'Experience', reputation: 'Reputation', relationships: 'Relationships', contacts: 'Contacts', communication: 'Communication', leadership: 'Leadership', knowledge: 'Knowledge' };
const describe = (g: Gains) => Object.entries(g).map(([k, v = 0]) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))} ${gainNames[k]}`).join(', ');

// ---------- Politics ----------
type Req = { label: string; check: (c: Career) => boolean };
const member = (c: Career) => c.character.party !== 'Independent';
export const rank: Record<Position, number> = { none: 0, captain: 1, committee: 2 };
export const positionNames: Record<Position, string> = { none: 'Member', captain: 'Precinct captain', committee: 'County committee member' };
export type Activity = { id: string; name: string; cost: number; summary: string; partyOnly?: boolean; reqs?: Req[]; gains: Gains };
const ACTIVITY_TIER: Record<string, keyof typeof ENERGY_TIER> = { initiative: 'small', study: 'small', meeting: 'small', volunteer: 'medium', campaign: 'medium', community: 'medium', network: 'medium', organize: 'big', speech: 'big', drive: 'big' };
/** Political activities cost 10/15/20% energy by size. */
export const activityEnergy = (id: string) => ENERGY_TIER[ACTIVITY_TIER[id] ?? 'medium'];
export const activities: Activity[] = [
  { id: 'volunteer', name: 'Volunteer for the party', cost: 500, summary: 'Knock doors and staff phone banks.', partyOnly: true, gains: { experience: 0.6, reputation: 0.2, communication: 0.3 } },
  { id: 'campaign', name: 'Volunteer for a local campaign', cost: 500, summary: 'Help an independent local candidate.', gains: { experience: 0.6, reputation: 0.2, communication: 0.3 } },
  { id: 'meeting', name: 'Attend a political meeting', cost: 1000, summary: 'Learn how decisions get made.', gains: { experience: 0.3, knowledge: 0.5, relationships: 0.2 } },
  { id: 'initiative', name: 'Support a community initiative', cost: 0, summary: 'Back a local cause with your time.', gains: { reputation: 0.2, experience: 0.3, leadership: 0.2 } },
  { id: 'community', name: 'Join a community event', cost: 1500, summary: 'Meet voters at a town fair.', gains: { reputation: 0.4, communication: 0.3, relationships: 0.3 } },
  { id: 'study', name: 'Study politics & leadership', cost: 500, summary: 'Attend training and practise speaking.', gains: { knowledge: 0.6, leadership: 0.4 } },
  { id: 'network', name: 'Meet political figures', cost: 5000, summary: 'Dinner with local officials.', reqs: [{ label: '10 experience', check: c => c.experience >= 10 }, { label: '5 reputation', check: c => c.reputation + wardrobeReputationBonus(c) >= 5 }], gains: { contacts: 0.4, relationships: 0.4, experience: 0.3 } },
  { id: 'organize', name: 'Organise precinct volunteers', cost: 2500, summary: 'Run your own volunteer team.', reqs: [{ label: 'Precinct captain', check: c => rank[c.position] >= 1 }], gains: { experience: 1, leadership: 0.6, reputation: 0.3, contacts: 0.3 } },
  { id: 'speech', name: 'Speak at a party forum', cost: 7500, summary: 'Address local members on the issues.', reqs: [{ label: 'Party member', check: member }, { label: 'Communication 10+', check: c => c.skills.communication >= 10 }, { label: '10 relationships', check: c => c.relationships >= 10 }], gains: { reputation: 0.8, communication: 0.6, experience: 0.6 } },
  { id: 'drive', name: 'Lead a county voter drive', cost: 10000, summary: 'Direct registration across the county.', reqs: [{ label: 'County committee seat', check: c => rank[c.position] >= 2 }, { label: 'Leadership 15+', check: c => c.skills.leadership >= 15 }], gains: { reputation: 1.2, leadership: 0.8, experience: 1.2, contacts: 0.6 } },
];
export const activityLocks = (c: Career, a: Activity) => (a.reqs ?? []).filter(r => !r.check(c)).map(r => r.label);

// Party and independent volunteering share a bucket so affiliation changes cannot reset repetition.
const activityBucket = (id: string) => id === 'campaign' ? 'volunteer' : id;
export function activityGains(c: Career, a: Activity): Gains {
  const uses = c.politicalActivityUses[activityBucket(a.id)] ?? 0;
  const gains: Gains = {};
  for (const [key, value = 0] of Object.entries(a.gains)) {
    // Whole tenths round down so small repeated gains cannot round back up to their baseline.
    gains[key as keyof Gains] = Math.floor((value * (value > 0 ? managerMultiplier(c) : 1) / (1 + uses)) * 10 + 1e-9) / 10;
  }
  return gains;
}

// ---------- Activity outcomes ----------
export type ActivityOutcomeTier = 'success' | 'mediocre' | 'setback';
/** Costly, high-profile efforts carry real risk; cheap grassroots ones never backfire. Skill, relationships and contacts raise the odds of success. */
export function activityOdds(c: Career, a: Activity): Record<ActivityOutcomeTier, number> {
  const aptitude = Math.min(0.25, (c.skills.communication + c.skills.leadership + c.skills.knowledge + c.relationships / 2 + c.contacts) / 250);
  const setback = a.cost >= 2500 ? Math.max(0.03, 0.1 - aptitude / 2) : 0;
  const success = Math.min(0.9, 0.65 + aptitude);
  return { success, mediocre: 1 - success - setback, setback };
}
/** Deterministic per attempt: the saved revision seeds the roll, so a reload or retried request cannot reroll an outcome. */
export const activityRoll = (c: Career, id: string) => campaignRandom(`${c.character.name}|${c.date}|rev${c.politicalActivityRevision}|activity:${id}`);
export function activityOutcome(c: Career, a: Activity, roll: number): { tier: ActivityOutcomeTier; gains: Gains } {
  const odds = activityOdds(c, a);
  if (roll < odds.setback) return { tier: 'setback', gains: { reputation: a.cost >= 7500 ? -1 : -0.5 } };
  if (roll < odds.setback + odds.success) return { tier: 'success', gains: activityGains(c, a) };
  const gains: Gains = {};
  for (const [k, v = 0] of Object.entries(activityGains(c, a))) gains[k as keyof Gains] = Math.floor(v * 0.25 * 10 + 1e-9) / 10;
  return { tier: 'mediocre', gains };
}

/** A rendered request carries the revision it saw; retries against newer state are no-ops. */
export function doActivity(c: Career, id: string, expectedRevision = c.politicalActivityRevision, roll?: number): Result {
  if (c.debate) return { ok: false, message: 'Finish your debate first.' };
  if (expectedRevision !== c.politicalActivityRevision) return { ok: false, message: 'This activity request was already processed or is out of date.' };
  if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter) return { ok: false, message: 'Finish your turn report and any pending event first.' };
  if (isDetained(c) || c.crime?.arrest?.stage === 'intake') return { ok: false, message: PRISON_LOCK };
  const a = activities.find(x => x.id === id);
  if (!a) return { ok: false, message: 'Unknown activity.' };
  const cost = activityEnergy(a.id);
  if (c.actions < cost) return { ok: false, message: `Not enough energy (${cost}% needed). Advance time or recharge in Life.` };
  if (a.partyOnly && !member(c)) return { ok: false, message: 'Join a party to volunteer for it.' };
  const locks = activityLocks(c, a);
  if (locks.length) return { ok: false, message: `Locked: needs ${locks.join(', ')}.` };
  if (a.cost === 0 && c.freePoliticalActivityUsed) return { ok: false, message: 'Your free community initiative has already been used this turn. Advance three months to use it again.' };
  if (!Number.isFinite(c.money) || c.money < a.cost) return { ok: false, message: `You need $${a.cost.toLocaleString('en-US')} in personal funds for this activity. Campaign funds cannot cover it.` };
  const outcome = activityOutcome(c, a, roll ?? activityRoll(c, id));
  const g = outcome.gains;
  const bucket = activityBucket(id);
  let n: Career = applyGains({ ...c, actions: c.actions - cost, freePoliticalActivityUsed: c.freePoliticalActivityUsed || a.cost === 0, politicalActivityRevision: c.politicalActivityRevision + 1, politicalActivityUses: { ...c.politicalActivityUses, [bucket]: (c.politicalActivityUses[bucket] ?? 0) + 1 } }, g);
  const gained = Object.fromEntries(Object.entries(g).filter(([, v]) => v));
  let msg = Object.keys(gained).length ? describe(gained) : 'no measurable gain';
  if (a.cost) { n = addEntry(n, a.name, -a.cost); msg += `, −$${a.cost}`; }
  if (id === 'speech' && outcome.tier !== 'setback') n = applySpeechLoyalty(n, managerMultiplier(c));
  const note = outcome.tier === 'setback' ? 'It backfired into a minor controversy. ' : outcome.tier === 'mediocre' ? 'The effort fell flat — little came of it. ' : '';
  const message = `${a.name}: ${note}${msg}.`;
  return { ok: true, career: withLog(n, message), message };
}

/** Consequences of changing affiliation scale with the player's party responsibilities. */
export function partySwitchConsequences(c: Career, to: Party) {
  const from = c.character.party;
  if (from === to) return null;
  if (from === 'Independent') return { rep: 0, contacts: 0, rel: 0, losePosition: false, lines: ['Membership is free. No penalties.'] };
  const toRival = to !== 'Independent';
  const r = rank[c.position];
  const rep = [2, 4, 8][r]! + (toRival ? 2 : 0);
  const contacts = Math.ceil(c.contacts * ([0.2, 0.5, 0.6][r]! + (toRival ? 0.2 : 0)));
  const rel = Math.min(c.relationships, [1, 2, 4][r]! + (toRival ? 1 : 0));
  const lines = [`−${rep} reputation`, `−${contacts} political contacts`, `−${fmt(rel)} relationships`];
  if (r) lines.push(`You lose your ${positionNames[c.position].toLowerCase()} position.`);
  if (r === 2) lines.push('Senior colleagues may see this as betrayal.');
  return { rep, contacts, rel, losePosition: r > 0, lines };
}
export function changeParty(c: Career, party: Party): Result {
  const from = c.character.party;
  const k = partySwitchConsequences(c, party);
  if (!k) return { ok: false, message: `You are already ${party === 'Independent' ? 'an Independent' : `a ${party}`}.` };
  const n: Career = { ...c, character: { ...c.character, party }, reputation: clamp(c.reputation - k.rep), contacts: r1(c.contacts - k.contacts), relationships: r1(c.relationships - k.rel), position: k.losePosition ? 'none' : c.position };
  const message = from === 'Independent' ? `You joined the ${party} Party.` : party === 'Independent' ? `You left the ${from} Party: ${k.lines.slice(0, 3).join(', ')}.` : `You switched to the ${party} Party: ${k.lines.slice(0, 3).join(', ')}.`;
  return { ok: true, career: withLog(n, message), message };
}

export type Opportunity = { id: Position | 'council'; name: string; detail: string; reqs: { label: string; met: boolean }[]; held: boolean; future?: boolean };
export function opportunities(c: Career): Opportunity[] {
  const m = member(c);
  return [
    { id: 'captain', name: 'Precinct captain', detail: 'Organise volunteers in your neighbourhood. Unlocks volunteer organising; +standing each turn.', held: rank[c.position] >= 1, reqs: [{ label: 'Party member', met: m }, { label: '20 experience', met: c.experience >= 20 }, { label: '3 contacts', met: c.contacts >= 3 }] },
    { id: 'committee', name: 'Local party committee', detail: 'A seat on the county committee. Unlocks county voter drives; more standing each turn.', held: rank[c.position] >= 2, reqs: [{ label: 'Precinct captain', met: rank[c.position] >= 1 }, { label: '40 experience', met: c.experience >= 40 }, { label: '15 reputation', met: c.reputation + wardrobeReputationBonus(c) >= 15 }] },
    { id: 'council', name: 'City council candidacy', detail: 'Your first run for public office.', held: false, future: true, reqs: [{ label: '60 experience', met: c.experience >= 60 }, { label: '25 reputation', met: c.reputation >= 25 }, { label: '20 leadership', met: c.skills.leadership >= 20 }, { label: '$1,000 savings', met: c.money >= 1000 }] },
  ];
}
export function takePosition(c: Career, id: 'captain' | 'committee'): Result {
  const o = opportunities(c).find(x => x.id === id)!;
  if (o.held) return { ok: false, message: 'You already hold this position.' };
  if (!o.reqs.every(r => r.met)) return { ok: false, message: 'You do not meet the requirements yet.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const n = applyGains({ ...c, actions: c.actions - ACTION_COST, position: id }, { reputation: id === 'captain' ? 1 : 2, relationships: 1 });
  const message = `You are now ${id === 'captain' ? 'a precinct captain' : 'on the county party committee'}.`;
  return { ok: true, career: withLog(n, message), message };
}

// ---------- Jobs ----------
export const qualifies = (c: Career, j: Job) => j.requirements.every(r => r.check(c));
export function jobStatus(c: Career, id: string): 'employed' | 'pending' | 'offered' | 'rejected' | 'declined' | 'open' {
  if (c.job?.id === id) return 'employed';
  return c.applications.find(a => a.jobId === id)?.status ?? 'open';
}
export function applyForJob(c: Career, id: string): Result {
  if (isDetained(c) || c.crime?.arrest?.stage === 'intake') return { ok: false, message: 'Outside employment is suspended during detention.' };
  const j = jobs.find(x => x.id === id);
  if (!j) return { ok: false, message: 'Unknown job.' };
  if (c.job?.id === id) return { ok: false, message: 'You already work here.' };
  const s = jobStatus(c, id);
  if (s === 'pending' || s === 'offered') return { ok: false, message: 'You already have an active application.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const apps = c.applications.filter(a => a.jobId !== id);
  const n: Career = { ...c, actions: c.actions - ACTION_COST, applications: [...apps, { jobId: id, month: c.date, status: 'pending' }] };
  const missing = missingJobRequirements(c, j);
  const decision = missing.length ? 'rejected' as const : 'offered' as const;
  n.applications = [...apps, { jobId: id, month: c.date, status: decision, ...(missing.length ? { reason: `Needs ${missing.join(', ')}` } : {}) }];
  const message = missing.length ? `${j.title}: application declined. Needs ${missing.join(', ')}.` : `${j.title}: credentials verified — job offer received. Acceptance required.`;
  return { ok: true, career: withLog(n, message), message };
}
export function acceptOffer(c: Career, id: string): Result {
  if (isDetained(c) || c.crime?.arrest?.stage === 'intake') return { ok: false, message: 'Outside employment is suspended during detention.' };
  const j = jobs.find(x => x.id === id);
  if (!j || jobStatus(c, id) !== 'offered') return { ok: false, message: 'No offer to accept.' };
  const missing = missingJobRequirements(c, j);
  if (missing.length) return { ok: false, message: `Needs ${missing.join(', ')}.` };
  const prev = jobs.find(x => x.id === c.job?.id)?.title;
  const n = ensureEmploymentPay({ ...c, job: { id, since: c.date }, applications: c.applications.filter(a => a.jobId !== id) });
  const pay = employmentPay(n);
  const oldPay = employmentPay(c).salary;
  const lateral = prev && pay.salary === oldPay ? ' Lateral role change: the new role has the same salary scale, so pay is unchanged.' : '';
  const message = `You started as ${pay.title}${prev ? `, leaving ${prev}` : ''}. Salary: $${pay.salary.toLocaleString('en-US')}/month; $${pay.quarterly.toLocaleString('en-US')}/quarter.${lateral}`;
  return { ok: true, career: withLog(n, message), message };
}
export function declineOffer(c: Career, id: string): Result {
  const j = jobs.find(x => x.id === id);
  if (!j || jobStatus(c, id) !== 'offered') return { ok: false, message: 'No offer to decline.' };
  const n: Career = { ...c, applications: c.applications.map(a => a.jobId === id ? { ...a, status: 'declined' as const, reason: 'You declined the offer' } : a) };
  const message = `You declined the ${j.title} offer.`;
  return { ok: true, career: withLog(n, message), message };
}
export const pendingOffer = (c: Career) => { const a = c.applications.find(x => x.status === 'offered'); return a ? jobs.find(j => j.id === a.jobId) : undefined; };
export function leaveJob(c: Career): Result {
  if (!c.job) return { ok: false, message: 'You are not employed.' };
  const t = jobs.find(x => x.id === c.job!.id)?.title ?? 'your job';
  const message = `You left ${t}. Salary payments have stopped.`;
  return { ok: true, career: withLog({ ...c, job: null }, message), message };
}

// ---------- Random events ----------
export type GameEvent = { id: string; title: string; text: string; parties: string[]; tenure?: string | undefined; cost?: number | undefined; scene?: EncounterScene | undefined; choices: { id: string; label: string; hint: string; disabled?: boolean | undefined }[] };
function rand(seed: string) { let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; }
export function getEvent(c: Career): GameEvent | null {
  if (c.eventEncounter) return c.eventEncounter;
  if (c.pendingEncounter && c.pendingEvent === c.pendingEncounter.id) return c.pendingEncounter;
  if (c.pendingEvent?.startsWith('office:')) return getOfficeEvent(c, c.pendingEvent);
  const [kind, arg] = (c.pendingEvent ?? '').split(':');
  const j = jobs.find(x => x.id === arg);
  const involved = [c.character.name, `${c.character.state} residents`];
  switch (kind) {
    case 'meeting': return { id: kind, parties: [c.character.name, `${c.character.party} county organizers`], title: 'Party organizer invitation', text: `Your ${c.character.party} county organizers invite you to discuss the local platform. They want your view, not a promise of a party position.`, choices: [{ id: 'go', label: 'Attend and speak', hint: c.skills.communication >= 8 ? '+1 experience, +1 relationships, +0.5 reputation' : '+1 experience, −0.5 reputation' }, { id: 'skip', label: 'Decline the invitation', hint: '−0.5 relationships' }] };
    case 'issue': return { id: kind, parties: involved, title: 'A community issue', text: 'Residents are angry about a closing bus route and a town hall is planned.', choices: [{ id: 'speak', label: 'Speak up publicly', hint: c.skills.knowledge >= 8 ? '+2 reputation, +0.5 communication' : '−1 reputation: facts may be wrong' }, { id: 'quiet', label: 'Stay out of it', hint: 'No change' }] };
    case 'job': return j ? { id: kind, parties: [c.character.name, `${j.title} hiring team`], title: 'An unexpected job lead', text: `A friend says ${j.title} is hiring ($${j.salary.toLocaleString('en-US')}/month) and can put in a word.`, choices: [{ id: 'interview', label: 'Ask for an interview', hint: 'Receive an offer; acceptance still required' }, { id: 'pass', label: 'Not now', hint: 'No change' }] } : null;
    case 'contact': return { id: kind, parties: [c.character.name, 'Local political organizer'], title: 'An influential contact', text: 'A well-known local organiser invites you to dinner. You would pay.', choices: [{ id: 'dine', label: 'Go to dinner · $200', hint: '+1 contact, +1 relationships' }, { id: 'decline', label: 'Politely decline', hint: 'No change' }] };
    case 'dispute': return { id: kind, parties: [...involved, `${c.character.party} leaders`], title: 'A political disagreement', text: 'Party leaders back a policy your neighbours oppose. Where do you stand?', choices: [{ id: 'loyal', label: 'Back the leadership', hint: '+1 relationships, −1 reputation' }, { id: 'dissent', label: 'Side with neighbours', hint: `+1 reputation, −${c.position === 'none' ? 1 : 2} relationships` }] };
    case 'invite': return { id: kind, parties: involved, title: 'An invitation', text: 'You are asked to help run a charity fundraiser. It will take real effort.', choices: [{ id: 'help', label: 'Help organise · 15% energy', hint: 'Uses next turn\'s action' }, { id: 'no', label: 'Decline', hint: 'No change' }] };
    case 'funds': return { id: kind, parties: [c.character.name, 'Household budget'], title: 'Personal savings running low', text: `You have $${c.money.toLocaleString('en-US')} in personal savings and no regular salary. Your campaign funds, if any, cannot cover personal costs.`, choices: [{ id: 'plan', label: 'Review work and spending options', hint: '+0.5 knowledge; no money created' }, { id: 'network', label: 'Ask your network for advice', hint: '+0.5 relationships; no guaranteed job' }] };
    case 'campaignFunds': return c.campaign ? { id: kind, parties: [c.character.name, `${c.campaign.title} campaign team`], title: 'Campaign cash warning', text: `Your ${c.campaign.title} campaign has $${c.campaign.funds.toLocaleString('en-US')} available. The team asks whether to lean on volunteers or prepare a donor outreach plan.`, choices: [{ id: 'volunteers', label: 'Rally existing volunteers', hint: '+3 volunteers, +0.5 momentum' }, { id: 'plan', label: 'Prepare donor outreach', hint: '+0.5 knowledge, +0.5 momentum; no instant donations' }] } : null;
    case 'group': {
      const group = groups.find(g => g.id === arg);
      if (!group) return null;
      return { id: `group:${group.id}`, parties: [c.character.name, group.name], title: group.id === 'labor' ? 'Union meeting invitation' : `${group.name} request a meeting`, text: `${group.name} want to hear your position on ${group.issues.join(' and ')}. A meeting is not an endorsement, and their support remains conditional.`, choices: [{ id: 'listen', label: 'Listen and discuss concerns', hint: '+2 group relationship, +0.5 communication' }, { id: 'decline', label: 'Decline this meeting', hint: '−1 group relationship' }] };
    }
    default: return null;
  }
}
function rollEvent(c: Career): string | null {
  if (c.office) return rollOfficeEvent(c);
  const r = campaignRandom(`${c.character.name}|${c.date}|context-event`);
  if (r > 0.4) return null; // most turns are quiet
  const pool = ['issue'];
  if (c.money >= 200 && c.experience >= 5) pool.push('contact');
  if (!c.job && !officeSalary(c) && c.money < 500) pool.push('funds');
  if (c.campaign && c.campaign.funds < 1000) pool.push('campaignFunds');
  if (member(c)) pool.push('meeting', 'dispute');
  for (const g of groups) if (groupRel(c, g.id) >= 25 && (c.campaign || c.experience >= 5)) pool.push(`group:${g.id}`);
  const open = jobs.filter(j => !c.job && !c.campaign && !c.publicOffice && qualifies(c, j) && jobStatus(c, j.id) === 'open');
  const lead = open[Math.floor(rand(c.date + 'j') * open.length)];
  if (lead) pool.push(`job:${lead.id}`);
  return pool[Math.floor(campaignRandom(c.character.name + c.date + 'event-kind') * pool.length)] ?? null;
}
/** Saved candidates are exposed only after the newspaper; continuation never rolls or processes time. */
export function continueAfterNewspaper(c: Career): Career {
  if (c.report) return c;
  if (pendingDebate(c)) return { ...c, newspaperPending: false };
  const event = getEvent(c);
  return { ...c, newspaperPending: false, pendingEvent: event ? c.pendingEvent : null, eventEncounter: event ? { ...event, date: c.date, presented: true } : null };
}
export function continueTurnReport(c: Career): Career {
  if (!c.report) return c;
  const next = { ...c, report: null };
  return c.newspaperPending ? next : continueAfterNewspaper({ ...next, newspaperPending: false });
}
export function resolveEvent(c: Career, choice: string): Result {
  if (pendingDebate(c)) return { ok: false, message: 'Finish your debate first.' };
  const e = getEvent(c);
  if (!e) return { ok: false, message: 'No event to respond to.' };
  if (c.report || c.newspaperPending) return { ok: false, message: 'Continue through your report and newspaper first.' };
  if (!e.choices.some(option => option.id === choice)) return { ok: false, message: 'Choose one of the available responses.' };
  if (e.scene) return resolveEncounterChoice(c, e, choice);
  if (e.id.startsWith('office:')) {
    const event = getOfficeEvent(c, e.id);
    if (!event) return { ok: false, message: 'This concern is not appropriate to your active office.' };
    return resolveOfficeEvent(c, { ...event, ...e, tenure: e.tenure ?? event.tenure, cost: e.cost ?? event.cost }, choice);
  }
  let n: Career = { ...c, pendingEvent: null, eventEncounter: null };
  let g: Gains = {};
  let note = 'Nothing changed.';
  const [, arg] = (c.pendingEvent ?? '').split(':');
  switch (`${e.id}:${choice}`) {
    case 'meeting:go': g = c.skills.communication >= 8 ? { experience: 1, relationships: 1, reputation: 0.5 } : { experience: 1, reputation: -0.5 }; note = c.skills.communication >= 8 ? 'Your remarks landed well.' : 'You stumbled over your words.'; break;
    case 'meeting:skip': g = { relationships: -0.5 }; note = 'A few members noted your absence.'; break;
    case 'issue:speak': g = c.skills.knowledge >= 8 ? { reputation: 2, communication: 0.5 } : { reputation: -1 }; note = c.skills.knowledge >= 8 ? 'Residents appreciated your informed stance.' : 'You got the facts wrong and it showed.'; break;
    case 'job:interview': if (arg) n = { ...n, applications: [...n.applications.filter(a => a.jobId !== arg), { jobId: arg, month: c.date, status: 'offered' }] }; note = 'The interview went well — you have an offer.'; break;
    case 'contact:dine': if (c.money < 200) { note = 'You could not afford it and had to cancel.'; g = { relationships: -0.5 }; } else { n = addEntry(n, 'Dinner with organiser', -200); g = { contacts: 1, relationships: 1 }; note = 'A valuable new connection.'; } break;
    case 'dispute:loyal': g = { relationships: 1, reputation: -1 }; note = 'Leaders noticed your loyalty; neighbours did too.'; break;
    case 'dispute:dissent': g = { reputation: 1, relationships: c.position === 'none' ? -1 : -2 }; note = 'Voters liked it. Party leaders did not.'; break;
    case 'invite:help': if (c.actions < ACTION_COST) { note = 'You had no time left to help.'; } else { n = { ...n, actions: c.actions - ACTION_COST }; g = { reputation: 1, leadership: 0.5, relationships: 0.5 }; note = 'The fundraiser was a success.'; } break;
    case 'funds:plan': g = { knowledge: 0.5 }; note = 'You reviewed work and spending options. No funds were added.'; break;
    case 'funds:network': g = { relationships: 0.5 }; note = 'Your network offered advice, not a job or cash.'; break;
    case 'campaignFunds:volunteers': if (n.campaign) n = { ...n, campaign: { ...n.campaign, volunteers: n.campaign.volunteers + 3, momentum: r1(n.campaign.momentum + 0.5) } }; note = 'Three volunteers joined your effort. No funds were transferred.'; break;
    case 'campaignFunds:plan': g = { knowledge: 0.5 }; if (n.campaign) n = { ...n, campaign: { ...n.campaign, momentum: r1(n.campaign.momentum + 0.5) } }; note = 'Your outreach plan improved readiness. Donations are not guaranteed.'; break;
  }
  if (e.id.startsWith('group:')) {
    const id = e.id.slice(6);
    n = { ...n, groups: { ...n.groups, [id]: clamp(groupRel(c, id) + (choice === 'listen' ? 2 : -1)) } };
    if (choice === 'listen') g = { communication: 0.5 };
    note = choice === 'listen' ? 'You heard their concerns: +2 group relationship. No endorsement was granted.' : 'They noted your absence: −1 group relationship.';
  }
  n = applyGains(n, g);
  if (n.campaign) {
    const poll = takePoll(n, n.campaign, n.date);
    const polls = n.campaign.polls.filter(p => p.date !== n.date);
    n = { ...n, campaign: { ...n.campaign, polls: [...polls, poll].slice(-6) } };
  }
  const message = `${e.title}: ${note}${Object.keys(g).length ? ` ${describe(g)}.` : ''}`;
  n.eventHistory = [...n.eventHistory, { ...e, date: c.date, choice, consequences: message }];
  return { ok: true, career: withLog(n, message), message };
}

// ---------- Calendar ----------
/** Ends the current three-month turn: pays each unpaid month once, resolves applications, may roll an event, then opens the next turn with fresh actions. */
export function advanceTurn(c: Career): { career: Career; events: string[] } {
  if (legacyOf(c).death) return { career: c, events: [] };
  if (c.debate) return { career: c, events: [] };
  if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter || isExecuted(c)) return { career: c, events: [] };
  if (c.crime?.arrest?.stage === 'intake') return { career: c, events: [] };
  if (isDetained(c)) return prisonAdvance(c);
  if (docketBlocker(c)) return { career: c, events: [docketBlocker(c) ?? 'Resolve your government docket.'] };
  const before = c;
  const period = turnLabel(c.date);
  let n: Career = ensureEmploymentPay({ ...c, skills: { ...c.skills }, pendingEvent: null, eventEncounter: null });
  const events: string[] = [];
  const job = c.job ? jobs.find(j => j.id === c.job!.id) : undefined;
  const wage = employmentPay(n);
  let month = c.date, income = 0, paid = 0, officeIncome = 0, officeMonths = 0;
  for (let i = 0; i < MONTHS_PER_TURN; i++) {
    if (job && (!n.lastPaidMonth || n.lastPaidMonth < month)) {
      n = addEntry(n, `Salary · ${wage.title}`, wage.salary, month);
      n = applyGains({ ...n, lastPaidMonth: month, workMonths: n.workMonths + 1 }, job.monthlyGains);
      income = Math.round((income + wage.salary) * 100) / 100; paid++;
    }
    const officePaid = payOfficeMonth(n, month);
    if (officePaid !== n) { officeIncome = Math.round((officeIncome + (officePaid.officePayHistory.at(-1)?.amount ?? 0)) * 100) / 100; officeMonths++; n = officePaid; }
    month = nextMonth(month);
    if (month.endsWith('-01-01')) { n.age += 1; events.push(`Happy birthday — you are now ${n.age}.`); }
  }
  if (paid === MONTHS_PER_TURN && job && job.quarterlyReputation > 0) {
    if (jobPerformanceMet(c, job)) {
      n = applyGains(n, { reputation: job.quarterlyReputation });
      events.push(`${job.title}: performance standards met; +${job.quarterlyReputation} reputation this quarter.`);
    } else events.push(`${job.title}: quarterly reputation bonus withheld until skill standards are met.`);
  }
  if (paid) events.unshift(`Income: $${income.toLocaleString('en-US')} from ${paid} month${paid > 1 ? 's' : ''} as ${wage.title}.`);
  else events.unshift(c.job ? 'Job income: none this turn.' : 'Job income: none — you are unemployed.');
  const promotion = reviewPromotion(n, month);
  n = promotion.career;
  if (promotion.notice) events.push(promotion.notice);
  if (officeMonths) events.push(`Office income: $${(Math.round(officeIncome * 100) / 100).toLocaleString('en-US')} from ${officeMonths} month${officeMonths > 1 ? 's' : ''} as ${c.office?.title}. Paid to personal savings.`);
  const bank = bankingTurn(n, c.date, month);
  n = bank.career;
  events.push(...bank.notices);
  const rent = collectRent(n, c.date);
  if (rent.notice) events.push(rent.notice);
  n = rent.career;
  const living = collectLiving(n, c.date);
  events.push(...living.notices);
  n = living.career;
  const taxes = collectTaxes(n, c.date);
  events.push(...taxes.notices);
  n = taxes.career;
  const family = collectFamily(n, c.date);
  events.push(...family.notices);
  n = family.career;
  { const soc = socialEventsTurn(n); events.push(...soc.notices); n = soc.career; }
  const mortality = mortalityTurn(n, c.date, month);
  n = mortality.career;
  events.push(...mortality.notices);
  if (legacyOf(n).death) return { career: n, events };
  n = { ...n, date: c.date };
  const biz = collectBusinesses(n, c.date);
  events.push(...biz.notices);
  n = biz.career;
  n = supportGroupsTurn(n, c.date);
  const settled = treasuryTurn(n, c.date, month);
  if (settled !== n && settled.treasury) {
    const entries = settled.treasury.transactions.slice(-2);
    events.push(`Government treasury: revenue $${(entries[0]?.amount ?? 0).toLocaleString('en-US')}; operating expenses $${Math.abs(entries[1]?.amount ?? 0).toLocaleString('en-US')}; balance $${settled.treasury.balance.toLocaleString('en-US')}.`);
    n = settled;
    const fin = financeTurn(n, c.date, month);
    events.push(...fin.notices);
    n = fin.career;
    const ev = eventsTurn(n, c.date, month);
    events.push(...ev.notices);
    n = ev.career;
  }
  { const net = networkTurn(n, month); events.push(...net.notices); n = net.career; }
  { const apt = appointmentTurn(n, month); events.push(...apt.notices); n = apt.career; }
  n = crisisLifecycleTurn(n, c.date, month);
  n = publicProjectsTurn(n, c.date, month);
  events.push(...projectReportLines(n, c.date, month));
  if (n.office?.termEnd && n.office.termEnd <= month) {
    events.push(`Your term as ${n.office.title} ended in ${monthLabel(n.office.termEnd)}. Office salary has stopped.`);
    const o = n.office;
    n = archiveTerm(n, o.termEnd, 'term ended');
    n.newsQueue = [...n.newsQueue, { h: `${n.character.name}'s term as ${o.title} ends · ${monthLabel(o.termEnd)}`, sub: o.jurisdiction, body: `The elected term ended. Office salary stopped and personal savings of $${n.money.toLocaleString('en-US')} remain intact. No term was renewed automatically.`, tag: 'government', subject: n.character.name }];
    n = { ...closeTenure(n), office: null, publicOffice: false };
  }
  if (rank[n.position] > 0) { n = applyGains(n, n.position === 'captain' ? { reputation: 0.5, contacts: 0.5 } : { reputation: 1, contacts: 1, relationships: 0.5 }); events.push(`Your ${positionNames[n.position].toLowerCase()} role added standing.`); }
  n.applications = c.applications.map(a => {
    if (a.status !== 'pending') return a;
    const j = jobs.find(x => x.id === a.jobId);
    if (!j) return a;
    const missing = j.requirements.filter(r => !r.check(c)).map(r => r.label);
    if (missing.length) { events.push(`${j.title}: application declined (needs ${missing.join(', ')}).`); return { ...a, status: 'rejected' as const, reason: `Needs ${missing.join(', ')}` }; }
    events.push(`${j.title}: you received a job offer!`);
    return { ...a, status: 'offered' as const };
  });
  const spent = n.ledger.filter(e => e.amount < 0 && e.month >= c.date && e.month < month).reduce((s, e) => s - e.amount, 0);
  const campaignPeriod = campaignTurn(n, c.date, month);
  const governed = stateTurn(cityTurn(campaignPeriod.career, month), month);
  n = crisesTurn(governed, c.date, month);
  events.push(...crisisReportLines(n, before));
  if (governed.city || governed.stateGovernment) events.push(...governed.log.filter(line => !campaignPeriod.career.log.includes(line)));
  // Congress acts before opinion settles: the President's desk fills (president) or the President acts on passed bills (legislators).
  const session = congressSession(n, c.date);
  const review = presidentialReview(session.career);
  n = review.career;
  events.push(...session.notices, ...review.notices);
  if (n.office) {
    n = approvalDrift(ensureApproval(n), c.date);
    if (n.approval && before.approval && n.approval.overall !== before.approval.overall) {
      const d = n.approval.overall - before.approval.overall;
      events.push(`Approval ${d > 0 ? 'rose' : 'fell'} to ${n.approval.overall}% (${d > 0 ? '+' : ''}${r1(d)}).`);
    }
    const impeach = impeachmentTurn(n, c.date);
    n = impeach.career;
    events.push(...impeach.notices);
  }
  const socialPeriod = socialTurn(n, c.date, month);
  events.push(...socialPeriod.notices);
  n = socialPeriod.career;
  const tubePeriod = tubeTurn(n, c.date, month);
  events.push(...tubePeriod.notices);
  n = tubePeriod.career;
  const podPeriod = podcastTurn(n, c.date);
  events.push(...podPeriod.notices);
  n = podPeriod.career;
  n = mailTurn(n, c.date);
  const kioskPeriod = magazineTurn(n);
  events.push(...kioskPeriod.notices);
  n = kioskPeriod.career;
  const corruptionPeriod = corruptionTurn(n, month);
  n = corruptionPeriod.career;
  events.push(...corruptionPeriod.notices);
  const scandalPeriod = scandalsTurn(n, c.date, month);
  n = scandalPeriod.career;
  events.push(...scandalPeriod.notices);
  const fallout = scandalFalloutTurn(n, month);
  n = fallout.career;
  events.push(...fallout.notices);
  const legalPeriod = legalTurn(n, month);
  n = legalPeriod.career;
  events.push(...legalPeriod.notices);
  const civilianPeriod = crimeTurn(n, month);
  n = civilianPeriod.career;
  events.push(...civilianPeriod.notices);
  const mediaPeriod = mediaTurn(before, n, c.date, month);
  events.push(...mediaPeriod.notices);
  n = mediaPeriod.career;
  const currentDate = { ...n, date: month };
  if (nearTermEnd(currentDate) && !n.termWarnings.includes(termKey(n))) {
    const warning = `Term reminder: ${monthsRemaining(currentDate)} months remain as ${n.office?.title}. Election: ${monthLabel(incumbentElection(n) ?? month)}. Choose re-election, confirm resignation before another office, or leave at term end.`;
    events.push(warning);
    n.termWarnings = [...n.termWarnings, termKey(n)];
  }
  const approvalChange = n.approval && before.approval ? n.approval.overall - before.approval.overall : 0;
  // Noticeable approval swings (|Δ| ≥ 2) queue an explanatory story built from the cause-tracked history.
  if (n.office && Math.abs(approvalChange) >= 2) n.newsQueue = [...n.newsQueue, { h: `${n.character.name}'s approval ${approvalChange > 0 ? 'rises' : 'falls'} to ${n.approval?.overall}% · ${monthLabel(month)}`, sub: n.office.jurisdiction, body: n.approval?.history.filter(h => h.date >= c.date).map(h => h.reason).join('. ') || 'Public opinion changed.', tag: 'government', subject: n.character.name }];
  n = prepareDebate(n, c.date, month);
  if (pendingDebate(n)) events.push('The general-election town-hall debate awaits after the report and newspaper.');
  n = publishEdition(n, before, c.date, month, campaignPeriod.stories);
  const publishedEdition = n.news[0]?.id === c.date && n.news[0]?.date === month;
  events.push(...campaignPeriod.lines);
  const dyn = dynastyTurn(n, c.date); events.push(...dyn.notices); n = dyn.career;
  const statLine = ([['reputation', 'Reputation'], ['experience', 'Experience'], ['relationships', 'Relationships'], ['contacts', 'Contacts']] as const)
    .map(([k, l]) => `${l} ${fmt(n[k])}${n[k] !== before[k] ? ` (${n[k] > before[k] ? '+' : '−'}${fmt(Math.abs(n[k] - before[k]))})` : ''}`).join(' · ');
  const skillLine = (['communication', 'leadership', 'knowledge'] as const).map(k => `${gainNames[k]} ${fmt(n.skills[k])}`).join(' · ');
  const opp = opportunities(n).filter(o => !o.held && !o.future).map(o => { const miss = o.reqs.filter(r => !r.met).map(r => r.label); return miss.length ? `${o.name}: needs ${miss.join(', ')}` : `${o.name}: available now!`; });
  n.date = month;
  n.actions = turnEnergyFor(n.life?.diet?.tierId); n.energyModel = 1;
  n.freePoliticalActivityUsed = false;
  n.politicalActivityUses = {};
  n.politicalActivityRevision = c.politicalActivityRevision + 1;
  n = ensureExecutiveDocket(n);
  // A verdict this turn may have sent the player to prison: no invitations or office events then.
  n.pendingEncounter = isIncarcerated(n) ? null : rollEncounter(n, before);
  n.pendingEvent = isIncarcerated(n) ? null : n.pendingEncounter?.id ?? rollEvent(n);
  if (!isIncarcerated(n)) n = prepareOfficeEvent(n);
  const lines = [...events, ...(spent ? [`Expenses this turn: $${spent.toLocaleString('en-US')}.`] : []), statLine, skillLine, ...opp, n.pendingEvent ? (publishedEdition ? 'An invitation or concern awaits after the newspaper.' : 'An invitation or concern awaits.') : publishedEdition ? 'The Courier published a front page on this turn.' : 'A quiet period — nothing unusual happened.', `${turnLabel(n.date)} begins: ${n.actions}% energy available.`];
  n.report = { period, lines };
  n.newspaperPending = publishedEdition;
  for (const e of [...events].reverse()) n = withLog(n, e);
  n = expireInvitations(before, n);
  return { career: captureLegacy(n), events };
}

/** A quarter behind bars: the outside world (family, businesses) keeps running, politics, jobs, social media and events do not. */
function prisonAdvance(c: Career): { career: Career; events: string[] } {
  const period = turnLabel(c.date);
  let n: Career = { ...c, pendingEvent: null, eventEncounter: null };
  const events: string[] = [];
  let month = c.date;
  for (let i = 0; i < MONTHS_PER_TURN; i++) { month = nextMonth(month); if (month.endsWith('-01-01')) { n = { ...n, age: n.age + 1 }; events.push(`You turned ${n.age} behind bars.`); } }
  const family = collectFamily(n, c.date); events.push(...family.notices); n = family.career;
  { const dyn = dynastyTurn(n, c.date); events.push(...dyn.notices); n = dyn.career; }
  const bank = bankingTurn(n, c.date, month); events.push(...bank.notices); n = bank.career;
  const biz = collectBusinesses(n, c.date); events.push(...biz.notices); n = biz.career;
  const legal = legalTurn(n, month); events.push(...legal.notices); n = legal.career;
  const civilian = crimeTurn(n, month); events.push(...civilian.notices); n = civilian.career;
  const mortality = mortalityTurn(n, c.date, month); events.push(...mortality.notices); n = mortality.career;
  if (legacyOf(n).death) return { career: n, events };
  n = publishEdition(n, c, c.date, month, []);
  const publishedEdition = n.news[0]?.id === c.date && n.news[0]?.date === month;
  n = { ...n, date: month, actions: turnEnergyFor(n.life?.diet?.tierId), energyModel: 1, freePoliticalActivityUsed: false, politicalActivityUses: {}, politicalActivityRevision: c.politicalActivityRevision + 1,
    report: { period, lines: [...events, `${turnLabel(month)} begins.`] }, newspaperPending: publishedEdition };
  for (const e of [...events].reverse()) n = withLog(n, e);
  return { career: captureLegacy(n), events };
}
/** @deprecated kept for compatibility; time now advances in three-month turns. */
export const advanceMonth = advanceTurn;
