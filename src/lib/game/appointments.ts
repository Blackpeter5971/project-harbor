import { ACTION_COST } from './energy-costs';
import type { Career, Party } from './career';
import { rand, usd } from './campaign';
import type { Result } from './support';
import { supportGroupsView } from './support-groups';
import { ensureNetwork, networkOf, profileOf, FIGURES } from './network';
import { docketQuarter } from './docket-schema';
import { appointmentCareerSchema, type Appointment, type AppointmentCareer, type AppointmentNote, type AppointmentSlot } from './appointment-schema';

/* Phase 5 — Political appointments. Pure, browser-safe. An appointee serves an elected executive
   (a Political Network figure or the sitting President), works three quarterly dockets, and is
   paid office salary. Agency spending draws only from the appointment's Government Treasury
   allocation. A quarter watermark (lastEnd) makes turn processing apply once. */

export type Tier = Appointment['tier'];
export type Pathway = Appointment['pathway'];
export type Role = { id: string; title: string; tier: Tier; rep: number; standing: number; salary: number; budget: number };

export const ROLES: Role[] = [
  { id: 'political-adviser', title: "Mayor's Political Adviser", tier: 'municipal', rep: 15, standing: 55, salary: 4500, budget: 1_500_000 },
  { id: 'department-director', title: 'Director, Department of Public Works', tier: 'municipal', rep: 25, standing: 60, salary: 6000, budget: 4_000_000 },
  { id: 'city-administrator', title: 'City Administrator', tier: 'municipal', rep: 30, standing: 65, salary: 7000, budget: 6_000_000 },
  { id: 'governor-adviser', title: "Governor's Senior Adviser", tier: 'state', rep: 40, standing: 65, salary: 9000, budget: 10_000_000 },
  { id: 'department-executive', title: 'Executive Director, State Department of Health', tier: 'state', rep: 45, standing: 68, salary: 10000, budget: 25_000_000 },
  { id: 'state-commissioner', title: 'State Commissioner of Transportation', tier: 'state', rep: 50, standing: 70, salary: 11000, budget: 40_000_000 },
  { id: 'presidential-adviser', title: 'Senior Adviser to the President', tier: 'federal', rep: 65, standing: 75, salary: 15000, budget: 60_000_000 },
  { id: 'cabinet-secretary', title: 'Secretary of Commerce', tier: 'federal', rep: 80, standing: 82, salary: 18000, budget: 250_000_000 },
];
export const roleOf = (id: string) => ROLES.find(r => r.id === id)!;
export const TIER_LABEL: Record<Tier, string> = { municipal: 'Municipal', state: 'State', federal: 'Federal' };
export const PATHWAY_LABEL: Record<Pathway, string> = { party: 'Party standing', network: 'Network trust', campaign: 'Campaign backing' };
export const DISMISS_AT = 25;
const RACE_OF: Record<Tier, 'Mayor' | 'Governor' | 'President'> = { municipal: 'Mayor', state: 'Governor', federal: 'President' };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n))) || 0;
const seedOf = (c: Career) => `${c.character.name}|${c.character.state}|appoint`;
const addYears = (d: string, y: number) => `${Number(d.slice(0, 4)) + y}${d.slice(4)}`;

export const appointmentsOf = (c: Career): AppointmentCareer => c.appointments ?? appointmentCareerSchema.parse({});
export const currentAppointment = (c: Career) => c.appointments?.current ?? null;

/** The sitting President NPC (federal superior) unless a backed figure has won the presidency. */
export function sittingPresident(c: Career): { id: string; name: string; party: Party } {
  const won = networkOf(c).figures.find(f => f.office === 'President');
  if (won) return { id: won.id, name: profileOf(won.id).name, party: won.party };
  const party: Party = rand(`${seedOf(c)}|potus`) < 0.5 ? 'Democrat' : 'Republican';
  return { id: 'potus', name: 'President Catherine Whitmore', party };
}

export type Superior = { id: string; name: string; party: Party; office: string; score: number | null };
export function superiorFor(c: Career, tier: Tier): Superior | null {
  const figs = networkOf(c).figures;
  if (tier === 'federal') { const p = sittingPresident(c); const f = figs.find(x => x.id === p.id); return { ...p, office: 'President of the United States', score: f ? f.score : null }; }
  const offices = tier === 'municipal' ? ['Mayor', 'County Executive'] : ['Governor'];
  const pool = figs.filter(f => offices.includes(f.office)).sort((a, b) => (c.appointments?.owed === b.id ? 1000 : b.score) - (c.appointments?.owed === a.id ? 1000 : a.score));
  const f = pool[0];
  if (!f) return null;
  const local = tier === 'municipal' ? `${f.office}, ${c.character.state}` : `Governor of ${c.character.state}`;
  return { id: f.id, name: profileOf(f.id).name, party: f.party, office: local, score: f.score };
}

export type RoleView = { role: Role; superior: Superior | null; pathway: Pathway | null; reqs: { label: string; met: boolean }[]; blocked: string };
function blocker(c: Career): string {
  if (c.appointments?.current) return 'You already hold an appointment.';
  if (c.office) return 'Elected officials cannot hold an appointment at the same time.';
  if (c.campaign) return 'Finish your own campaign first.';
  if (c.appointments?.pledge) return 'Your pledged candidate’s race must conclude first.';
  return '';
}
export function roleViews(c: Career): RoleView[] {
  const standing = supportGroupsView(c).partyStanding ?? 0, me = c.character.party, owed = c.appointments?.owed ?? null;
  const block = blocker(c);
  return ROLES.map(role => {
    const superior = superiorFor(c, role.tier);
    const sameParty = !!superior && superior.party === me;
    const broker = role.tier === 'federal' && superior?.score == null ? Math.max(-100, ...networkOf(c).figures.filter(f => f.party === superior?.party && profileOf(f.id).tier === 'leadership').map(f => f.score)) : null;
    const trust = superior?.score ?? broker ?? -100;
    const trustNeed = role.tier === 'federal' && superior?.score == null ? 70 : 60;
    const party = sameParty && standing >= role.standing && c.reputation >= role.rep;
    const network = !!superior && trust >= trustNeed && c.reputation >= role.rep - 15;
    const campaign = !!superior && owed === superior.id && c.reputation >= role.rep - 25;
    const pathway: Pathway | null = campaign ? 'campaign' : network ? 'network' : party ? 'party' : null;
    const reqs = [
      { label: `Party standing ${role.standing}+ & ${role.rep} reputation (same party)`, met: party },
      { label: `${trustNeed}+ relationship with ${role.tier === 'federal' && superior?.score == null ? 'a party leader' : superior?.name ?? 'the executive'} & ${Math.max(0, role.rep - 15)} reputation`, met: network },
      { label: `Backed ${superior?.name ?? 'the executive'}'s winning campaign`, met: campaign },
    ];
    return { role, superior, pathway, reqs, blocked: block || (!superior ? `No sitting ${RACE_OF[role.tier] === 'Mayor' ? 'mayor' : 'governor'} in your network.` : '') };
  });
}

/* Docket dilemmas. Effects: comp = competency, trust = superior's trust, rep = reputation. */
type Option = { id: string; label: string; detail: string; comp: number; trust: number; rep?: number; cost?: number; risky?: boolean };
type Dilemma = { id: string; title: string; options: Option[] };
const ADVISORY: Dilemma[] = [
  { id: 'deficit', title: 'Budget shortfall: recommend cuts or new revenue?', options: [
    { id: 'phased', label: 'Phased plan', detail: 'Sound advice: competency +6, trust +2', comp: 6, trust: 2 },
    { id: 'popular', label: 'Tell them what they want', detail: 'Competency −2, trust +5', comp: -2, trust: 5 },
    { id: 'blunt', label: 'Blunt warning', detail: 'Competency +4, trust −3', comp: 4, trust: -3 } ] },
  { id: 'housing', title: 'Housing crisis: zoning reform or rent subsidies?', options: [
    { id: 'zoning', label: 'Zoning reform', detail: 'Competency +5, trust +1', comp: 5, trust: 1 },
    { id: 'subsidy', label: 'Subsidies', detail: 'Competency +1, trust +3', comp: 1, trust: 3 },
    { id: 'study', label: 'Commission a study', detail: 'Competency −1, trust +1', comp: -1, trust: 1 } ] },
  { id: 'union', title: 'Public-sector union demands a raise.', options: [
    { id: 'mediate', label: 'Mediated deal', detail: 'Competency +5, trust +2', comp: 5, trust: 2 },
    { id: 'hardline', label: 'Hold the line', detail: 'Competency +2, trust −2', comp: 2, trust: -2 },
    { id: 'cave', label: 'Concede in full', detail: 'Competency −3, trust +3', comp: -3, trust: 3 } ] },
  { id: 'energy', title: 'Energy prices spike ahead of winter.', options: [
    { id: 'relief', label: 'Targeted relief', detail: 'Competency +6, trust +1', comp: 6, trust: 1 },
    { id: 'blanket', label: 'Blanket rebate', detail: 'Competency 0, trust +4', comp: 0, trust: 4 },
    { id: 'wait', label: 'Wait and see', detail: 'Competency −3, trust −1', comp: -3, trust: -1 } ] },
];
const ADMIN: Dilemma[] = ['Bridge repair program', 'Agency modernization', 'Emergency-response upgrade', 'Small-business grants office'].map((t, i) => ({ id: `admin${i}`, title: t, options: [
  { id: 'supervise', label: 'Supervise directly', detail: 'Treasury spend; competency +7 on success', comp: 7, trust: 1, cost: 0.15, risky: true },
  { id: 'represent', label: 'Represent your superior', detail: 'Trust +5, reputation +1', comp: 1, trust: 5, rep: 1 },
  { id: 'delegate', label: 'Delegate to staff', detail: 'No spend; competency +1', comp: 1, trust: 0 } ] }));
const MEDIA: Dilemma[] = ['Legislative inquiry into agency contracts', 'Leaked memo embarrasses the office', 'Opposition attacks a stalled program', 'Press scrutiny of travel expenses'].map((t, i) => ({ id: `media${i}`, title: t, options: [
  { id: 'defend', label: 'Defend your superior', detail: 'Trust +7, reputation −2', comp: 0, trust: 7, rep: -2 },
  { id: 'compromise', label: 'Negotiate a compromise', detail: 'Competency +3, trust −1, reputation +2', comp: 3, trust: -1, rep: 2 },
  { id: 'neutral', label: 'Remain neutral', detail: 'Trust −4, reputation +1', comp: 0, trust: -4, rep: 1 } ] }));
const POOLS: Record<AppointmentSlot['slot'], Dilemma[]> = { advisory: ADVISORY, administration: ADMIN, media: MEDIA };
export const SLOT_LABEL: Record<AppointmentSlot['slot'], string> = { advisory: 'Docket 1 · Advisory', administration: 'Docket 2 · Administration & Projects', media: 'Docket 3 · Opposition & Media' };
export const dilemmaOf = (slot: AppointmentSlot['slot'], id: string) => POOLS[slot].find(d => d.id === id) ?? POOLS[slot][0]!;

function buildDocket(c: Career, a: Appointment, quarter: string): Appointment {
  const s = `${seedOf(c)}|${a.since}|${quarter}`;
  const docket = (['advisory', 'administration', 'media'] as const).map(slot => { const pool = POOLS[slot]; return { slot, dilemma: pool[Math.floor(rand(`${s}|${slot}`) * pool.length)]!.id, resolved: false, choice: null, outcome: null }; });
  return { ...a, quarter, docket, spent: quarter.endsWith('Q1') && a.quarter !== quarter ? 0 : a.spent };
}
/** View-time refresh: a docket for the current quarter (no other state changes). */
export function ensureAppointmentDocket(c: Career): Career {
  const a = c.appointments?.current; const q = docketQuarter(c.date);
  if (!a || a.quarter === q) return c;
  return { ...c, appointments: { ...c.appointments!, current: buildDocket(c, a, q) } };
}
export function optionCost(a: Appointment, o: Option) { return o.cost ? Math.round(roleOf(a.roleId).budget * o.cost) : 0; }
export function slotOptions(a: Appointment, slot: AppointmentSlot) {
  const d = dilemmaOf(slot.slot, slot.dilemma);
  return d.options.map(o => { const cost = optionCost(a, o); const left = a.budget - a.spent; return { ...o, cost, disabled: cost > left, reason: cost > left ? `Needs ${usd(cost)} of treasury allocation` : '' }; });
}

function shiftSuperior(c: Career, id: string, delta: number): Career {
  if (!delta || !FIGURES.some(f => f.id === id)) return c;
  const n = ensureNetwork(c), net = n.network!;
  return { ...n, network: { ...net, figures: net.figures.map(f => f.id === id ? { ...f, score: Math.max(-100, Math.min(100, Math.round(f.score + delta))) || 0, lastSeen: c.date } : f) } };
}
const withAp = (c: Career, ap: Partial<AppointmentCareer>): Career => ({ ...c, appointments: { ...appointmentsOf(c), ...ap } });

export function acceptAppointment(c0: Career, roleId: string, revision?: number): Result {
  const c = ensureNetwork(c0), ap = appointmentsOf(c);
  if (revision !== undefined && revision !== ap.revision) return { ok: false, message: 'That offer has changed. Review it again.' };
  const v = roleViews(c).find(r => r.role.id === roleId);
  if (!v) return { ok: false, message: 'Unknown appointment.' };
  if (v.blocked) return { ok: false, message: v.blocked };
  if (!v.pathway || !v.superior) return { ok: false, message: 'You do not meet any pathway to this appointment yet.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Accepting an appointment needs 15% energy.' };
  const s = v.superior, role = v.role;
  const jurisdiction = role.tier === 'federal' ? 'United States' : c.character.state;
  let a: Appointment = { roleId, title: role.title, tier: role.tier, jurisdiction, superiorId: s.id, superiorName: s.name, superiorParty: s.party, superiorOffice: s.office, pathway: v.pathway, since: c.date, termEnd: addYears(c.date, 4), trust: v.pathway === 'campaign' ? 75 : v.pathway === 'network' ? 65 : 58, competency: clamp(45 + c.skills.knowledge / 4 + c.skills.leadership / 4), budget: role.budget, spent: 0, quarter: '', revision: 0, docket: [], misconduct: null, lastPaidEnd: '' };
  a = buildDocket(c, a, docketQuarter(c.date));
  let n: Career = { ...c, actions: c.actions - ACTION_COST, eligibleAppointment: true, newsQueue: [...c.newsQueue, { h: `${c.character.name} named ${role.title}`, sub: `Appointed by ${s.name}`, body: `${s.name} (${s.party}) has appointed ${c.character.name} as ${role.title}.`, tag: 'government', subject: c.character.name }] };
  n = withAp(n, { current: a, owed: v.pathway === 'campaign' ? null : ap.owed, revision: ap.revision + 1 });
  n = shiftSuperior(n, s.id, 5);
  return { ok: true, career: n, message: `You are now ${role.title}, serving ${s.name}.` };
}

export function resolveAppointmentSlot(c0: Career, slotId: AppointmentSlot['slot'], choice: string, revision?: number): Result {
  const c = ensureAppointmentDocket(c0), a = c.appointments?.current;
  if (!a) return { ok: false, message: 'You hold no appointment.' };
  if (revision !== undefined && revision !== a.revision) return { ok: false, message: 'This docket has changed. Review it again.' };
  const slot = a.docket.find(d => d.slot === slotId);
  if (!slot || slot.resolved) return { ok: false, message: 'That docket item is already resolved.' };
  const opt = slotOptions(a, slot).find(o => o.id === choice);
  if (!opt) return { ok: false, message: 'Unknown choice.' };
  if (opt.disabled) return { ok: false, message: opt.reason };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Each docket decision needs 15% energy.' };
  let comp = opt.comp, trust = opt.trust, rep = opt.rep ?? 0, outcome = opt.detail;
  if (opt.risky) { const ok = rand(`${seedOf(c)}|${a.quarter}|${slotId}|run`) < 0.75; if (!ok) { comp = 1; trust = -2; outcome = `Spent ${usd(opt.cost)} of treasury allocation; the project stalled (competency +1, trust −2).`; } else outcome = `Spent ${usd(opt.cost)} of treasury allocation; delivered on time (competency +7, trust +1).`; }
  if (choice === 'defend' && a.misconduct) { rep -= 2; outcome += ' Defending known misconduct cost extra credibility.'; }
  const next: Appointment = { ...a, trust: clamp(a.trust + trust), competency: clamp(a.competency + comp), spent: a.spent + (opt.cost ?? 0), revision: a.revision + 1, docket: a.docket.map(d => d.slot === slotId ? { ...d, resolved: true, choice, outcome } : d) };
  let n: Career = { ...c, actions: c.actions - ACTION_COST, reputation: c.reputation + rep };
  n = withAp(n, { current: next });
  n = shiftSuperior(n, a.superiorId, Math.round(trust / 2));
  return { ok: true, career: n, message: `${opt.label}: ${outcome}` };
}

function endAppointment(c: Career, reason: AppointmentCareer['history'][number]['reason'], when = c.date): Career {
  const ap = appointmentsOf(c), a = ap.current;
  if (!a) return c;
  return { ...withAp(c, { current: null, history: [{ title: a.title, superior: a.superiorName, since: a.since, ended: when, reason }, ...ap.history].slice(0, 20), revision: ap.revision + 1 }), eligibleAppointment: false };
}

export function resignAppointment(c: Career): Result {
  const a = c.appointments?.current;
  if (!a) return { ok: false, message: 'You hold no appointment.' };
  const n = shiftSuperior(endAppointment(c, 'resigned'), a.superiorId, -8);
  return { ok: true, career: { ...n, newsQueue: [...n.newsQueue, { h: `${c.character.name} resigns as ${a.title}`, sub: a.superiorName, body: `${c.character.name} has stepped down.`, tag: 'government', subject: c.character.name }] }, message: `You resigned as ${a.title}.` };
}

export const RETALIATION_COST = 12_000;
export function whistleblow(c0: Career): Result {
  const c = ensureNetwork(c0), a = c.appointments?.current;
  if (!a) return { ok: false, message: 'You hold no appointment.' };
  if (!a.misconduct) return { ok: false, message: 'You have no evidence of misconduct to expose.' };
  const net = c.network!;
  let n: Career = { ...c, reputation: c.reputation + 8, network: { ...net, figures: net.figures.map(f => f.id === a.superiorId ? { ...f, score: -95, allied: false } : f.party === a.superiorParty ? { ...f, score: Math.max(-100, f.score - 10) } : f) } };
  n = endAppointment(n, 'whistleblower');
  let msg = `You exposed ${a.superiorName}: ${a.misconduct}. Reputation +8, but their allies will not forget.`;
  if (rand(`${seedOf(c)}|${a.since}|retaliate`) < 0.4) {
    const fee = Math.min(Math.max(0, n.money), RETALIATION_COST);
    n = { ...n, money: n.money - fee, ledger: [{ month: c.date, label: 'Legal defense · retaliation suit', amount: -fee }, ...n.ledger] };
    msg += ` ${a.superiorName}'s allies filed a retaliation suit; legal defense cost ${usd(fee)}.`;
  }
  n = { ...n, newsQueue: [...n.newsQueue, { h: `Whistleblower: ${c.character.name} exposes ${a.superiorName}`, sub: a.title, body: `${a.misconduct}.`, tag: 'scandal', subject: a.superiorName, priority: 2 }] };
  return { ok: true, career: n, message: msg };
}

/* Pathway C — campaign backing. */
const FEEDER: Record<'Mayor' | 'Governor' | 'President', string[]> = {
  Mayor: ['City Council Member', 'State Representative', 'County Executive'],
  Governor: ['Lieutenant Governor', 'State Attorney General', 'State Treasurer', 'State Senator', 'Mayor'],
  President: ['U.S. Senator', 'Governor'],
};
export function backableCandidates(c: Career) {
  return networkOf(c).figures.filter(f => f.score >= 30 && profileOf(f.id).tier === 'active').flatMap(f => {
    const race = (Object.keys(FEEDER) as (keyof typeof FEEDER)[]).find(r => FEEDER[r].includes(f.office));
    return race ? [{ id: f.id, name: profileOf(f.id).name, party: f.party, office: f.office, race, score: f.score }] : [];
  });
}
export function nextElection(date: string) { const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)); return `${m >= 8 ? y + 1 : y}-11-01`; }
export function backCandidate(c0: Career, figureId: string): Result {
  const c = ensureNetwork(c0), ap = appointmentsOf(c);
  if (ap.pledge) return { ok: false, message: 'You are already backing a candidate.' };
  if (c.campaign) return { ok: false, message: 'You cannot back another race while running your own.' };
  const cand = backableCandidates(c).find(x => x.id === figureId);
  if (!cand) return { ok: false, message: 'That politician is not running for an executive office you can back.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Pledging needs 15% energy.' };
  const n = withAp({ ...c, actions: c.actions - ACTION_COST }, { pledge: { figureId, race: cand.race, electionDate: nextElection(c.date), effort: 0, lastEffort: '', since: c.date } });
  return { ok: true, career: shiftSuperior(n, figureId, 4), message: `You pledged to back ${cand.name} for ${cand.race} in exchange for an appointment. Your own candidacy is on hold until the election.` };
}
export function campaignForCandidate(c: Career): Result {
  const ap = appointmentsOf(c), p = ap.pledge;
  if (!p) return { ok: false, message: 'You are not backing a candidate.' };
  if (p.lastEffort === c.date) return { ok: false, message: 'You already campaigned for them this turn.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Campaigning needs 15% energy.' };
  const n = withAp({ ...c, actions: c.actions - ACTION_COST }, { pledge: { ...p, effort: p.effort + 1, lastEffort: c.date } });
  return { ok: true, career: shiftSuperior(n, p.figureId, 2), message: `You campaigned for ${profileOf(p.figureId).name}. Their odds improve.` };
}
export function withdrawPledge(c: Career): Result {
  const p = c.appointments?.pledge;
  if (!p) return { ok: false, message: 'You are not backing a candidate.' };
  return { ok: true, career: shiftSuperior(withAp(c, { pledge: null }), p.figureId, -20), message: `You broke your pledge to ${profileOf(p.figureId).name}. They feel betrayed.` };
}
export function pledgeOdds(c: Career) {
  const p = c.appointments?.pledge; if (!p) return 0;
  const score = networkOf(c).figures.find(f => f.id === p.figureId)?.score ?? 0;
  return Math.max(0.1, Math.min(0.9, 0.4 + p.effort * 0.06 + score / 300));
}

const MISCONDUCT = ['steering no-bid contracts to a donor', 'using public staff for campaign work', 'concealing an audit of agency funds', 'accepting undisclosed gifts from a lobbyist'];

/** Quarterly settlement, applied once per turn end via the lastEnd watermark. */
export function appointmentTurn(c0: Career, end: string): { career: Career; notices: string[] } {
  const ap0 = c0.appointments;
  if (!ap0 || ap0.lastEnd >= end || (!ap0.current && !ap0.pledge)) return { career: ap0 && ap0.lastEnd < end ? withAp(c0, { lastEnd: end }) : c0, notices: [] };
  let c = ensureNetwork(c0);
  const notes: AppointmentNote[] = [], s = `${seedOf(c)}|${end}`;
  const note = (text: string, tone: AppointmentNote['tone']) => notes.push({ end, text, tone });
  const p = appointmentsOf(c).pledge;
  if (p && end >= p.electionDate) {
    const name = profileOf(p.figureId).name, won = rand(`${s}|pledge`) < pledgeOdds(c);
    if (won) {
      const net = c.network!;
      c = withAp({ ...c, network: { ...net, figures: net.figures.map(f => f.id === p.figureId ? { ...f, office: p.race } : f) } }, { pledge: null, owed: p.figureId });
      note(`${name} wins the race for ${p.race}! Your appointment pledge can now be redeemed in Government.`, 'good');
    } else { c = withAp({ ...c, reputation: c.reputation - 2 }, { pledge: null }); note(`${name} loses the race for ${p.race}. Your pledge lapses.`, 'bad'); }
  }
  let a = appointmentsOf(c).current;
  if (a) {
    const role = roleOf(a.roleId);
    if (a.lastPaidEnd < end) { const pay = role.salary * 3; c = { ...c, money: Math.round((c.money + pay) * 100) / 100, ledger: [{ month: end, label: `Appointment salary · ${a.title}`, amount: pay }, ...c.ledger] }; a = { ...a, lastPaidEnd: end }; }
    const open = a.docket.filter(d => !d.resolved).length;
    if (open) { a = { ...a, competency: clamp(a.competency - 3 * open), trust: clamp(a.trust - open) }; note(`${open} docket item${open > 1 ? 's' : ''} left unattended (competency −${3 * open}).`, 'bad'); }
    if (!a.misconduct && rand(`${s}|misconduct`) < 0.18) { a = { ...a, misconduct: MISCONDUCT[Math.floor(rand(`${s}|mtext`) * MISCONDUCT.length)]! }; note(`You uncovered evidence of ${a.superiorName} ${a.misconduct}.`, 'info'); }
    c = withAp(c, { current: a });
    if (a.trust < DISMISS_AT || a.competency < DISMISS_AT) {
      const why = a.trust < DISMISS_AT ? 'lost confidence in you' : 'judged your performance inadequate';
      c = { ...endAppointment(c, 'dismissed', end), reputation: c.reputation - 5 };
      c = { ...c, newsQueue: [...c.newsQueue, { h: `${c.character.name} dismissed as ${a.title}`, sub: a.superiorName, body: `${a.superiorName} ${why}.`, tag: 'government', subject: c.character.name }] };
      note(`${a.superiorName} ${why} and dismissed you as ${a.title}.`, 'bad');
    } else if (end >= a.termEnd) {
      if (a.trust >= 65 && a.competency >= 60) { a = { ...a, termEnd: addYears(a.termEnd, 4) }; c = withAp(c, { current: buildDocket(c, a, docketQuarter(end)) }); note(`${a.superiorName} reappointed you as ${a.title} for another term.`, 'good'); }
      else { c = endAppointment(c, 'term', end); note(`Your term as ${a.title} has expired with ${a.superiorName}'s term.`, 'info'); }
    } else c = withAp(c, { current: buildDocket(c, a, docketQuarter(end)) });
  }
  const ap = appointmentsOf(c);
  c = withAp(c, { lastEnd: end, notes: [...notes, ...ap.notes].slice(0, 20) });
  return { career: c, notices: notes.map(n => n.text) };
}
export const freshAppointmentNotes = (c: Career) => { const a = c.appointments; return a?.lastEnd ? a.notes.filter(n => n.end === a.lastEnd) : []; };

/** Whether the Government section should be shown at all: elected officials, or anyone with an appointment, pledge, owed seat or an open pathway. */
export function governmentVisible(c: Career): boolean {
  if (c.office || c.publicOffice || c.eligibleAppointment) return true;
  const a = c.appointments;
  if (a?.current || a?.pledge || a?.owed) return true;
  return roleViews(c).some(v => v.pathway && !v.blocked);
}
