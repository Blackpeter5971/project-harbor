import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { monthLabel, rank } from './gameplay';
import { officeById, nextCycle, rand, usd, type OfficeId, type Story } from './campaign';
import { applyActionApproval, ensureApproval } from './approval';
import { activeOffice, evaluateSupport, recordDecision } from './support';
import { proposeLaw, councilBudget } from './legislation';
import { baselineSpend, proposeBudget } from './budget';
import { stateLegislativeAction, stateMeasure } from './state-government';
import { federalAction } from './federal';

/* Government control center: office-specific dashboards, stats, priorities and decisions.
   Pure functions over Career; all stats are derived deterministically, so no schema change. */
type Res = { ok: true; career: Career; message: string } | { ok: false; message: string };
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;
const log = (c: Career, msg: string): Career => ({ ...c, log: [msg, ...c.log].slice(0, 12) });
const queue = (c: Career, s: Story): Career => ({ ...c, newsQueue: [...c.newsQueue, s] });
const monthsBetween = (a: string, b: string) => { const A = a.split('-').map(Number), B = b.split('-').map(Number); return ((B[0] ?? 2026) - (A[0] ?? 2026)) * 12 + (B[1] ?? 1) - (A[1] ?? 1); };

// ---------- Term progress ----------
export function termProgress(c: Career): { elapsed: number; total: number; pct: number; monthsLeft: number } | null {
  const o = c.office;
  if (!o?.termEnd) return null;
  const total = Math.max(1, monthsBetween(o.since, o.termEnd));
  const elapsed = clamp(monthsBetween(o.since, c.date), 0, total);
  return { elapsed, total, pct: Math.round((elapsed / total) * 100), monthsLeft: total - elapsed };
}

// ---------- Govern approval & standing (derived, deterministic) ----------
export type GovStats = { approval: number; influence: number; partySupport: number | null; opposition: number };
export function govStats(c: Career): GovStats | null {
  const o = c.office;
  if (!o) return null;
  const seed = `${c.character.name}|${o.id}|${c.date}`;
  const tenure = Math.max(0, monthsBetween(o.since, c.date));
  const noise = (rand(seed + 'ap') - 0.5) * 8;
  // Once the persistent approval model exists (Phase 5), it is the source of truth.
  const approval = c.approval ? Math.round(c.approval.overall) : Math.round(clamp(38 + c.reputation * 0.3 + o.margin * 0.6 - tenure * 0.25 + noise, 5, 95));
  const influence = Math.round(clamp(15 + c.experience * 0.15 + c.skills.leadership * 0.35 + rank[c.position] * 6, 5, 95));
  const partySupport = o.party === 'Independent' ? null : Math.round(clamp(35 + c.relationships * 1.2 + rank[c.position] * 10 + (rand(seed + 'ps') - 0.5) * 6, 5, 95));
  const opposition = Math.round(clamp(100 - approval + (rand(seed + 'op') - 0.5) * 10 - 8, 3, 90));
  return { approval, influence, partySupport, opposition };
}

// ---------- Priorities per office ----------
export function govPriorities(id: OfficeId): string[] {
  switch (id) {
    case 'council': return ['Pass a balanced city budget', 'Keep streets and services funded', 'Answer constituent complaints'];
    case 'mayor': return ['Deliver the city budget on time', 'Keep crime and housing costs in check', 'Maintain a working council majority'];
    case 'stateLeg': return ['Move your bills through committee', 'Bring state funding home to the district', 'Hold the party line on key votes'];
    case 'house': return ['Sponsor legislation that can pass the House', 'Secure federal funds for the district', 'Build seniority and committee standing'];
    case 'governor': return ['Sign a state budget the legislature accepts', 'Manage agencies and emergencies', 'Keep approval ahead of re-election'];
    case 'senate': return ['Shape national legislation', 'Confirm or block key nominations', 'Represent the whole state, not one district'];
    case 'president': return ['Set the national agenda', 'Work with Congress on your program', 'Keep national approval above water'];
  }
}

// ---------- Decisions (actions) per office ----------
export type GovAct = { id: string; name: string; summary: string; major?: boolean; gains: { reputation?: number; relationships?: number; contacts?: number; knowledge?: number; leadership?: number; experience?: number } };
const common: GovAct[] = [
  { id: 'constituents', name: 'Meet constituents', summary: 'Open office hours for residents.', gains: { reputation: 1, relationships: 0.5 } },
  { id: 'townhall', name: 'Hold a town hall', summary: 'Face voters and answer questions.', gains: { reputation: 1.5, knowledge: 0.5 } },
  { id: 'partyleaders', name: 'Meet party leaders', summary: 'Keep your coalition aligned.', gains: { relationships: 1.5, contacts: 0.5 } },
];
const perOffice: Record<OfficeId, GovAct[]> = {
  council: [
    { id: 'ordinance', name: 'Propose an ordinance', summary: 'Put a local measure on the agenda.', major: true, gains: { reputation: 2, knowledge: 1, experience: 1 } },
    { id: 'budgetvote', name: 'Work the city budget', summary: 'Review line items before the vote.', gains: { knowledge: 1.5, experience: 1 } },
    { id: 'localservices', name: 'Advocate for local services', summary: 'Sponsor funded service improvements for residents.', gains: {} },
    { id: 'negotiate', name: 'Negotiate with colleagues', summary: 'Build relationships and leadership; no automatic passage.', gains: { relationships: 4, leadership: 1 } },
  ],
  mayor: [
    { id: 'citybudget', name: 'Present the city budget', summary: 'Your spending plan, your name on it.', major: true, gains: { reputation: 2.5, leadership: 1, experience: 1 } },
    { id: 'presser', name: 'Hold a press conference', summary: 'Set the city agenda in public.', gains: { reputation: 1.5, knowledge: 0.5 } },
  ],
  stateLeg: [
    { id: 'bill', name: 'Sponsor a bill', summary: 'File legislation in your name.', major: true, gains: { reputation: 2, knowledge: 1.5, experience: 1 } },
    { id: 'committee', name: 'Committee hearing', summary: 'Work a measure under consideration: +4 support, +2 knowledge; vote still required.', gains: {} },
    { id: 'coalition', name: 'Form a state coalition', summary: '+4 negotiated support, +2 relationships; no automatic passage.', gains: {} },
    { id: 'statebudgetvote', name: 'Review the state budget', summary: 'Bring the governor’s funded plan into chamber consideration.', gains: {} },
  ],
  house: [
    { id: 'bill', name: 'Sponsor a bill', summary: 'File federal legislation in your name.', major: true, gains: { reputation: 2.5, knowledge: 1.5, experience: 1 } },
    { id: 'whip', name: 'Whip votes in the House', summary: 'Count and persuade colleagues.', gains: { relationships: 1, contacts: 0.5, experience: 1 } },
  ],
  governor: [
    { id: 'order', name: 'Sign an executive order', summary: 'Direct state agencies by decree.', major: true, gains: { reputation: 2.5, leadership: 1.5, experience: 1 } },
    { id: 'statebudget', name: 'Negotiate the state budget', summary: 'Bargain with legislative leaders.', gains: { knowledge: 1.5, relationships: 1, experience: 1 } },
    { id: 'coalition', name: 'Negotiate with the legislature', summary: '+4 negotiated support, +2 relationships; no automatic passage.', gains: {} },
  ],
  senate: [
    { id: 'bill', name: 'Sponsor a bill', summary: 'File national legislation in your name.', major: true, gains: { reputation: 2.5, knowledge: 1.5, experience: 1 } },
    { id: 'filibuster', name: 'Floor strategy session', summary: 'Whip votes and plan the floor fight.', gains: { relationships: 1, knowledge: 1, experience: 1 } },
  ],
  president: [
    { id: 'address', name: 'Address the nation', summary: 'Speak to the country from the Oval Office.', major: true, gains: { reputation: 3, leadership: 1, experience: 1 } },
    { id: 'order', name: 'Agency transparency directive', summary: 'Existing management authority only; no new law or spending.', major: true, gains: {} },
  ],
};
export function govActions(c: Career): GovAct[] {
  const id = c.office?.id as OfficeId | undefined;
  if (!id || !(id in perOffice)) return [];
  return [...perOffice[id], ...common];
}

const majorText: Record<string, { h: (n: string, t: string) => string; sub: string; body: (c: Career) => string }> = {
  ordinance: { h: (n, t) => `${n} introduces new ordinance`, sub: 'Measure heads to committee', body: c => `${c.character.name}, ${c.office?.title} of ${c.office?.jurisdiction}, introduced a new ordinance. Council colleagues will take it up in committee in the coming weeks.` },
  citybudget: { h: (n) => `Mayor ${n} presents city budget`, sub: 'Council review begins', body: c => `Mayor ${c.character.name} unveiled the city budget proposal, setting spending priorities for the year. The council begins hearings next month.` },
  bill: { h: (n, t) => `${t} ${n} sponsors new bill`, sub: 'Legislation filed and referred', body: c => `${c.character.name} filed new legislation as ${c.office?.title}. The bill was referred to committee, where its prospects will be tested.` },
  order: { h: (n, t) => `${t} ${n} signs executive order`, sub: 'Supporters cheer, critics object', body: c => `${c.character.name} signed an executive order directing agencies under ${c.office?.jurisdiction}. Supporters praised the decisiveness; opponents promised a legal review.` },
  address: { h: (n) => `President ${n} addresses the nation`, sub: 'Prime-time speech lays out agenda', body: c => `President ${c.character.name} addressed the nation in prime time, laying out the administration's agenda and calling for unity behind it.` },
};

export function govAction(c: Career, id: string): Res {
  if (!c.office || !activeOffice(c)) return { ok: false, message: 'You hold no active public office. Win an election to govern.' };
  const a = govActions(c).find(x => x.id === id);
  if (!a) return { ok: false, message: 'That decision is not available to your office.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn. Advance time to continue.' };
  if (id === 'ordinance') return proposeLaw(c, 'services', 'ordinance');
  if (id === 'bill') return proposeLaw(c, 'services', 'bill');
  if (id === 'localservices') return proposeLaw(c, 'services', 'services');
  if (id === 'budgetvote') return councilBudget(c);
  if (id === 'statebudgetvote') return stateMeasure(c, 'budget');
  if (id === 'coalition') return stateLegislativeAction(c, 'coalition');
  if (id === 'committee' && c.office.id === 'stateLeg') return stateLegislativeAction(c, 'committee');
  if (id === 'citybudget' || id === 'statebudget') return proposeBudget(c, baselineSpend(c), 'hold');
  if (id === 'order' && c.office.id === 'president') return federalAction(c, 'order', 'transparency');
  if (['whip', 'filibuster'].includes(id)) return federalAction(c, 'deal');
  // Meetings train skills, but public decisions face the same support model as legislation.
  const needsSupport = !['constituents', 'townhall', 'partyleaders', 'negotiate', 'committee', 'whip', 'filibuster'].includes(id);
  const support = needsSupport ? evaluateSupport(c, id === 'order' ? 'safety' : 'services', `${id}|${c.governmentDecisions.length}`) : null;
  if (support && support.outcome !== 'pass') {
    const n = applyActionApproval(recordDecision({ ...c, actions: c.actions - ACTION_COST }, a.name, support), id, a.major ? -1 : -0.5, a.major ? 'major' : 'routine', `${a.name}: ${support.outcome}; decision not implemented.`, true);
    return { ok: true, career: n, message: `${a.name}: ${support.outcome}. ${support.votes}/${support.seats} support; ${support.needed} required. No gains awarded.` };
  }
  let n: Career = { ...c, actions: c.actions - ACTION_COST, skills: { ...c.skills } };
  if (support) n = recordDecision(n, a.name, support);
  const parts: string[] = [];
  for (const [k, v = 0] of Object.entries(a.gains)) {
    if (k === 'reputation') n.reputation = clamp(n.reputation + v);
    else if (k === 'relationships') n.relationships = r1(Math.max(0, n.relationships + v));
    else if (k === 'contacts') n.contacts = r1(Math.max(0, n.contacts + v));
    else if (k === 'experience') n.experience = r1(n.experience + v);
    else n.skills[k as 'knowledge' | 'leadership'] = clamp(n.skills[k as 'knowledge' | 'leadership'] + v);
    parts.push(`+${v} ${k}`);
  }
  const t = majorText[id];
  if (a.major && t) n = queue(n, { h: t.h(c.character.name, c.office.title), sub: t.sub, body: t.body(n), tag: 'government', subject: c.character.name, portrait: c.character.portrait });
  // Decisions move public opinion with a visible cause; major ones move it more.
  const repGain = a.gains.reputation ?? 0;
  // Routine decisions move opinion ±0.2–1, major ones ±2–5; repeats in the same turn are dampened.
  const delta = a.major ? 1.5 + repGain * 0.4 : Math.max(0.2, repGain * 0.5);
  n = applyActionApproval(n, id, r1(delta), a.major ? 'major' : 'routine', `${a.name} as ${c.office.title} — ${a.summary}`);
  const message = `${a.name}: ${parts.join(', ')}.`;
  return { ok: true, career: log(n, message), message };
}

// ---------- Deadlines ----------
export type Deadline = { label: string; date: string; note: string };
export function govDeadlines(c: Career): Deadline[] {
  const out: Deadline[] = [];
  const o = c.office;
  if (!o) return out;
  if (o.termEnd) out.push({ label: 'Term ends', date: o.termEnd, note: `${monthLabel(o.termEnd)} — run again or step down` });
  const office = officeById(o.id as OfficeId);
  const cycle = nextCycle(c, office);
  if (!o.termEnd || cycle.electionDate <= o.termEnd) out.push({ label: 'Next election', date: cycle.electionDate, note: `${monthLabel(cycle.electionDate)} · ${office.schedule}` });
  if (c.campaign) out.push({ label: `${c.campaign.title} election`, date: c.campaign.electionDate, note: `Campaign funds ${usd(c.campaign.funds)}` });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
