import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { enactBudget, baselineSpend, revenueWithTaxes, revenueBase, spendTreasury } from './budget';
import { cityState, cityFunds } from './city';
import { isStateOffice, stateFunds, stateGovernment } from './state-government';
import { federalFunds, federalState, isFederal } from './federal';
import { applyLegislativeFallout, shiftApproval, type Involvement } from './approval';
import { docketQuarter } from './docket-schema';
import { COST_REF, memberSupport, costPenalty, rollCall, swingStance } from './committees';
import { CATEGORY_COMMITTEE, COMMITTEE_NAMES, legislatureParties, type LegislatureParty, billCategories, generateBackbench, generateLawmakers, generateSeating, isSwing, seeded, type BillCategory, type ChamberId, type Legislature, type LegislativeBill, type LegislativeSlot } from './legislature-schema';
import { usd } from './campaign';
import { activeOffice, evaluateSupport, recordDecision, submitMeasure, tenureKey, type Bill, type Policy, type Result } from './support';

export function proposeLaw(c: Career, policy: Policy = 'services', kind: Bill['kind'] = 'ordinance'): Result {
  if (!activeOffice(c) || !['council', 'stateLeg', 'house', 'senate'].includes(c.office?.id ?? '')) return { ok: false, message: 'Only legislators can sponsor this measure.' };
  const cost = Math.round(revenueBase(c) * 0.02);
  if (['council'].includes(c.office?.id ?? '') && cost > cityFunds(c)) return { ok: false, message: 'Insufficient public funds for this local measure.' };
  if (isStateOffice(c) && cost > stateFunds(c)) return { ok: false, message: 'Insufficient state allocation for this funded bill.' };
  if (isFederal(c) && cost > federalFunds(c)) return { ok: false, message: 'Insufficient congressional allocation for this funded bill.' };
  return submitMeasure(c, { title: kind === 'services' ? 'Local service improvement' : kind === 'ordinance' ? `${policy} ordinance` : `${policy} bill`, kind, policy, cost });
}
export function councilBudget(c: Career): Result {
  if (c.office?.id !== 'council') return { ok: false, message: 'Only council members vote on the city budget here.' };
  return submitMeasure(c, { title: 'Mayor’s balanced city budget', kind: 'budget', policy: 'services', cost: 0, budget: { spending: baselineSpend(c), stance: 'hold' } });
}
export function billAction(c: Career, id: string, action: 'consider' | 'negotiate' | 'amend' | 'compromise' | 'vote' | 'approve' | 'veto'): Result {
  if (!activeOffice(c)) return { ok: false, message: 'You hold no active public office.' };
  const bill = c.bills.find(b => b.id === id && b.tenure === tenureKey(c));
  if (!bill || ['passed', 'rejected'].includes(bill.stage)) return { ok: false, message: 'This measure is not active in your current office.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const federal = isFederal(c), votes = bill.chamberVotes ?? [];
  const legacyVote = federal && bill.stage === 'awaiting approval' && votes.length < 2;
  if (action === 'consider' && bill.stage !== 'proposed' || ['negotiate', 'amend', 'compromise', 'vote'].includes(action) && bill.stage !== 'under consideration' && !(action === 'vote' && legacyVote) || ['approve', 'veto'].includes(action) && bill.stage !== 'awaiting approval') return { ok: false, message: 'That action is not available at this bill stage.' };
  if (federal && ['approve', 'veto'].includes(action) && !(['house', 'senate'] as const).every(ch => votes.some(v => v.chamber === ch && v.support.outcome === 'pass'))) return { ok: false, message: 'Both the House and Senate must approve this measure before presidential action.' };
  let next: Bill = { ...bill, chamberVotes: [...votes], history: [...bill.history] };
  let n: Career = { ...c, actions: c.actions - ACTION_COST };
  let message = '';
  if (action === 'consider') { next.stage = 'under consideration'; message = 'Committee consideration opened.'; }
  if (action === 'negotiate') { next.boost = Math.min(24, next.boost + 8); n.relationships += 2; message = 'Negotiated support +8; relationships +2.'; }
  if (action === 'amend' || action === 'compromise') {
    next.chamberVotes = []; // A changed federal text must pass both chambers again.
    next.revision += 1; next.boost = Math.min(24, next.boost + (action === 'compromise' ? 10 : 4));
    next.cost = Math.round(next.cost * 0.9);
    if (next.budget) next.budget = { ...next.budget, spending: Object.fromEntries(Object.entries(next.budget.spending).map(([k, v]) => [k, Math.round(v * 0.95)])) };
    message = `${action === 'amend' ? 'Amended' : 'Compromise accepted'}: narrower scope and reduced funding; core supporters lose enthusiasm.`;
    n = shiftApproval(n, -1, `${bill.title}: ${message}`, [{ group: 'establishment', delta: 1 }, { group: 'working', delta: -2 }]);
  }
  if (action === 'vote') {
    const order = c.office?.id === 'senate' ? ['senate', 'house'] as const : ['house', 'senate'] as const;
    const votingChamber = federal ? order.find(ch => !next.chamberVotes.some(v => v.chamber === ch && v.support.outcome === 'pass')) ?? 'house' : c.office?.id;
    const support = evaluateSupport(c, next.policy, federal ? `${id}|${next.attempts}|${votingChamber}` : `${id}|${next.attempts}`, next.boost, next.revision, votingChamber);
    next.support = support; next.attempts += 1;
    if (federal && support.outcome === 'pass' && (votingChamber === 'house' || votingChamber === 'senate')) next.chamberVotes = [...next.chamberVotes.filter(v => v.chamber !== votingChamber), { chamber: votingChamber, support }];
    next.stage = support.outcome === 'pass' ? !federal || next.chamberVotes.length === 2 ? 'awaiting approval' : 'under consideration' : support.outcome === 'fail' ? 'rejected' : 'under consideration';
    n = recordDecision(n, next.title, support);
    message = `${federal ? `${votingChamber === 'house' ? 'House' : 'Senate'} vote` : 'Vote'}: ${support.outcome}; ${support.votes}/${support.seats}, ${support.needed} required. ${next.stage === 'awaiting approval' ? 'Awaiting executive approval.' : federal && support.outcome === 'pass' ? 'Other chamber approval required; no law or spending enacted.' : 'No law enacted.'}`;
    n = shiftApproval(n, support.outcome === 'pass' ? 0.5 : -0.5, `${next.title}: ${message}`);
  }
  if (action === 'veto') {
    next.stage = 'rejected';
    message = c.office?.id === 'governor' ? 'Governor vetoed the chamber-approved bill; measure rejected. No funds committed.' : 'Executive approval withheld; measure rejected.';
    if (c.office?.id === 'governor') n = shiftApproval(n, -1, `${next.title}: ${message}`, [{ group: 'working', delta: -2 }, { group: 'business', delta: 1 }]);
  }
  if (action === 'approve') {
    const executive = ['mayor', 'governor', 'president'].includes(c.office?.id ?? '');
    const support = evaluateSupport(c, next.policy, `${id}|approval`, next.boost, next.revision);
    const signed = executive || support.outcome === 'pass';
    next.stage = signed ? 'passed' : 'rejected';
    message = signed ? 'Executive approval granted; measure enacted.' : 'Executive withheld approval; measure rejected.';
    if (signed && next.budget && Object.values(next.budget.spending).reduce((s, v) => s + v, 0) > revenueWithTaxes(c, next.budget.stance)) return { ok: false, message: 'The pending budget exceeds available revenue; it cannot be approved.' };
    if (signed && next.cost > (federal ? federalFunds(c) : isStateOffice(c) ? stateFunds(c) : cityFunds(c))) return { ok: false, message: 'Insufficient public funds to enact this measure.' };
    if (signed && next.cost) {
      const payment = spendTreasury(n, next.cost, `bill|${next.id}`, next.title);
      if (!payment.ok) return payment;
      n = payment.career;
      if (federal) { const state = federalState(n); n.federalGovernment = { ...state, spent: state.spent + next.cost }; }
      else if (isStateOffice(c)) { const state = stateGovernment(n); n.stateGovernment = { ...state, spent: state.spent + next.cost }; }
      else { const state = cityState(n); n.city = { ...state, spent: state.spent + next.cost }; }
    }
    n = shiftApproval(n, signed ? 1 : -1, `${next.title}: ${message}`, [{ group: 'working', delta: signed ? 2 : -2 }, { group: 'business', delta: signed ? -1 : 1 }]);
  }
  next.history.push({ date: c.date, text: message });
  n.bills = n.bills.map(b => b.id === id ? next : b);
  if (next.stage === 'passed' && next.budget) {
    const enacted = enactBudget(n, next);
    if (!enacted.ok) return enacted;
    n = enacted.career;
  }
  if (['passed', 'rejected'].includes(next.stage) || action === 'vote') n.newsQueue = [...n.newsQueue, { h: `${next.title}: ${next.stage} · ${id} · ${action === 'vote' ? next.chamberVotes.at(-1)?.chamber ?? 'chamber' : action}`, sub: message, body: `${message} ${next.support?.reasons.join(' ') ?? ''} Public cost: ${usd(next.cost)}.`, tag: 'government', subject: c.character.name, portrait: c.character.portrait }];
  n.log = [`${next.title}: ${message}`, ...n.log].slice(0, 12);
  return { ok: true, career: n, message };
}

/** Retain historical measures but withdraw unfinished business when its office tenure ends. */
export function closeTenure(c: Career): Career {
  return { ...c, city: null, stateGovernment: null, federalGovernment: null, budget: null, approval: null, bills: c.bills.map(b => b.tenure === tenureKey(c) && !['passed', 'rejected'].includes(b.stage) ? { ...b, stage: 'rejected', history: [...b.history, { date: c.date, text: 'Withdrawn: office tenure ended.' }] } : b) };
}
/* ---------- Executive legislative pool (docket slot 1) ---------- */
type GroupId = 'working' | 'suburban' | 'business' | 'labor' | 'youth' | 'environment' | 'seniors' | 'religious' | 'establishment';
export type IssueEffect = { overall: number; groups: Partial<Record<GroupId, number>> };
export type LegislativeIssue = { id: string; title: string; revised: string; policy: Policy; sign: IssueEffect; veto: IssueEffect };
const fx = (overall: number, groups: IssueEffect['groups']): IssueEffect => ({ overall, groups });
const issue = (id: string, title: string, revised: string, policy: Policy, sign: IssueEffect, veto: IssueEffect): LegislativeIssue => ({ id, title, revised, policy, sign, veto });

/** Every issue is a dilemma: signing and vetoing each win one coalition and anger another. */
export const legislativePool: LegislativeIssue[] = [
  issue('min-wage', 'Minimum Wage Increase', 'Phased Minimum Wage Increase', 'services', fx(1, { labor: 6, working: 5, business: -6, establishment: -3 }), fx(-1, { labor: -6, working: -4, business: 5 })),
  issue('police-reform', 'Police Reform & Demilitarization', 'Police Accountability & Training Act', 'safety', fx(0, { youth: 6, working: 2, religious: -4, seniors: -4, suburban: -3 }), fx(0, { youth: -6, seniors: 3, religious: 3 })),
  issue('clean-energy', 'Clean Energy Mandate', 'Gradual Clean Energy Standard', 'environment', fx(1, { environment: 7, youth: 4, business: -5, working: -3 }), fx(-1, { environment: -7, youth: -4, business: 4 })),
  issue('health-subsidy', 'Healthcare Subsidies Expansion', 'Targeted Healthcare Subsidies', 'services', fx(1, { seniors: 5, working: 4, establishment: -4, business: -4 }), fx(-1, { seniors: -5, working: -3, business: 3 })),
  issue('corp-tax', 'Corporate Tax Adjustment', 'Corporate Minimum Tax', 'business', fx(0, { labor: 4, youth: 3, business: -7, establishment: -3 }), fx(0, { labor: -4, business: 5, suburban: 2 })),
  issue('vouchers', 'Education Voucher Expansion', 'Pilot School Choice Program', 'services', fx(0, { religious: 6, suburban: 3, labor: -6, youth: -3 }), fx(0, { religious: -5, suburban: -2, labor: 4 })),
  issue('tech-monopoly', 'Tech Monopoly Regulation', 'Digital Competition Act', 'business', fx(1, { youth: 4, working: 3, business: -6, establishment: -2 }), fx(-1, { youth: -4, business: 4 })),
  issue('zoning', 'Zoning Deregulation', 'Missing-Middle Housing Reform', 'business', fx(0, { youth: 5, business: 4, suburban: -6, seniors: -3 }), fx(0, { youth: -5, business: -3, suburban: 4 })),
  issue('transit-bonds', 'Public Transit Bonds', 'Scaled Transit Bond Measure', 'services', fx(0, { working: 4, environment: 4, seniors: -4, establishment: -4 }), fx(0, { working: -3, environment: -4, seniors: 3 })),
  issue('gun-safety', 'Gun Safety Controls', 'Background Check Modernization', 'safety', fx(0, { suburban: 5, youth: 5, religious: -6, working: -3 }), fx(0, { suburban: -5, youth: -5, religious: 5 })),
  issue('right-to-work', 'Right-to-Work Law', 'Union Transparency Act', 'business', fx(0, { business: 7, establishment: 2, labor: -8, working: -3 }), fx(0, { business: -6, labor: 7 })),
  issue('carbon-tax', 'Carbon Pollution Fee', 'Carbon Fee & Dividend', 'environment', fx(-1, { environment: 7, youth: 3, working: -5, business: -5 }), fx(0, { environment: -6, youth: -3, working: 3, business: 3 })),
  issue('sentencing', 'Sentencing Reform', 'Nonviolent Offender Diversion', 'safety', fx(0, { youth: 5, religious: 2, seniors: -5, suburban: -3 }), fx(0, { youth: -5, seniors: 4 })),
  issue('pension', 'Public Pension Overhaul', 'Pension Stabilization Plan', 'services', fx(0, { establishment: 5, business: 4, labor: -6, seniors: -4 }), fx(0, { establishment: -4, business: -3, labor: 5, seniors: 3 })),
  issue('paid-leave', 'Paid Family Leave', 'Small-Business Exempt Family Leave', 'services', fx(1, { working: 5, youth: 4, business: -6 }), fx(-1, { working: -5, youth: -3, business: 5 })),
  issue('fracking-ban', 'Fracking Moratorium', 'Drilling Safety Standards', 'environment', fx(0, { environment: 7, youth: 3, labor: -5, working: -4 }), fx(0, { environment: -7, labor: 4, working: 3 })),
  issue('sales-tax-cut', 'Sales Tax Cut', 'Grocery Tax Holiday', 'business', fx(1, { working: 3, suburban: 4, establishment: -5, seniors: -2 }), fx(-1, { working: -3, suburban: -4, establishment: 3 })),
  issue('immigration', 'Immigrant Worker Protections', 'Seasonal Worker Visa Program', 'safety', fx(0, { youth: 4, business: 4, working: -5, religious: -3 }), fx(0, { youth: -5, business: -3, working: 4 })),
  issue('rent-control', 'Rent Stabilization Act', 'Tenant Protection Act', 'services', fx(0, { youth: 6, working: 4, business: -6, suburban: -3 }), fx(0, { youth: -6, working: -3, business: 5 })),
  issue('surveillance', 'Public Surveillance Expansion', 'Camera Program with Oversight', 'safety', fx(0, { seniors: 5, suburban: 3, youth: -6 }), fx(0, { seniors: -4, youth: 5 })),
  issue('ag-subsidy', 'Farm Subsidy Reform', 'Family Farm Support Act', 'business', fx(0, { environment: 4, establishment: 2, working: -5, religious: -3 }), fx(0, { environment: -4, working: 4 })),
  issue('drug-pricing', 'Prescription Drug Price Caps', 'Insulin & Generic Price Caps', 'services', fx(1, { seniors: 7, working: 3, business: -6, establishment: -3 }), fx(-1, { seniors: -6, business: 5 })),
  issue('charter-cap', 'Charter School Cap', 'Charter Accountability Standards', 'services', fx(0, { labor: 5, youth: 2, religious: -5, suburban: -3 }), fx(0, { labor: -5, religious: 4, suburban: 2 })),
  issue('stadium', 'Pro Stadium Financing Deal', 'Stadium Deal with Community Benefits', 'business', fx(0, { business: 5, working: 3, environment: -4, establishment: -4 }), fx(0, { business: -5, working: -2, establishment: 3 })),
];
export const legislativeIssue = (id: string | null | undefined) => legislativePool.find(i => i.id === id) ?? null;
/** A returned bill comes back narrower: smaller wins and smaller losses. */
export const issueEffect = (i: LegislativeIssue, choice: 'sign' | 'veto', rev: number): IssueEffect => {
  const k = rev > 0 ? 0.6 : 1, e = i[choice];
  return { overall: Math.round(e.overall * k * 10) / 10, groups: Object.fromEntries(Object.entries(e.groups).map(([g, v]) => [g, Math.round((v ?? 0) * k * 10) / 10])) };
};
const groupNames: Record<GroupId, string> = { working: 'Working Class', suburban: 'Suburbs', business: 'Business', labor: 'Labor', youth: 'Youth', environment: 'Environment', seniors: 'Seniors', religious: 'Religious', establishment: 'Establishment' };
export const describeEffect = (e: IssueEffect) => Object.entries(e.groups).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([g, v]) => `${groupNames[g as GroupId]} ${(v ?? 0) > 0 ? '+' : '−'}${Math.abs(v ?? 0)}`).join(', ');
/** Applies a signed/vetoed pool issue to approval only; no Bill record or treasury movement. */
export function decideIssue(c: Career, i: LegislativeIssue, choice: 'sign' | 'veto', rev: number): Career {
  const e = issueEffect(i, choice, rev);
  return shiftApproval(c, e.overall, `${i.title}: ${choice === 'sign' ? 'signed into law' : 'vetoed'}.`, Object.entries(e.groups).map(([group, delta]) => ({ group, delta: delta ?? 0 })));
}


/* ---------- Lawgivers-style legislature & quarterly legislative docket ---------- */
const LEGISLATIVE_OFFICES = ['council', 'stateLeg', 'house', 'senate', 'mayor', 'governor', 'president'];
/** Lower/upper chamber for an office: federal is bicameral; state and city bodies sit as one chamber. */
export function chambersFor(officeId: string): [ChamberId, ChamberId] {
  if (['house', 'senate', 'president'].includes(officeId)) return ['house', 'senate'];
  if (['stateLeg', 'governor'].includes(officeId)) return ['stateLeg', 'stateLeg'];
  return ['council', 'council'];
}
const BILL_IDEAS: Record<BillCategory, { title: string; description: string }[]> = {
  tax: [{ title: 'Middle-Class Tax Relief Act', description: 'Cuts rates for families earning under the median income, paid for by closing corporate loopholes.' }, { title: 'Small Business Tax Credit', description: 'A hiring credit for firms under 50 employees.' }],
  health: [{ title: 'Rural Hospital Rescue Act', description: 'Emergency grants to keep rural hospitals open.' }, { title: 'Prescription Price Transparency Act', description: 'Requires drugmakers to publish pricing and justify increases.' }],
  defense: [{ title: 'Veterans Readiness Act', description: 'Expands job training and housing support for returning service members.' }, { title: 'Base Modernization Bill', description: 'Upgrades aging military and guard facilities.' }],
  education: [{ title: 'Teacher Pay Raise Act', description: 'Raises starting teacher salaries and funds classroom supplies.' }, { title: 'Community College Access Bill', description: 'Tuition-free community college for qualifying students.' }],
  justice: [{ title: 'Public Safety & Courts Act', description: 'Funds court backlogs, public defenders and community policing.' }, { title: 'Second Chance Hiring Act', description: 'Incentives to hire people with old nonviolent records.' }],
  infrastructure: [{ title: 'Bridges & Roads Renewal Act', description: 'Repairs structurally deficient bridges and highways.' }, { title: 'Broadband for All Act', description: 'Brings high-speed internet to underserved areas.' }],
};

/** Builds the chamber model once per office tenure; schema-only, no money, approval or action changes. */
export function ensureLegislature(c: Career): Career {
  if (!activeOffice(c) || !c.office || !LEGISLATIVE_OFFICES.includes(c.office.id)) return c;
  const tenure = tenureKey(c);
  if (c.legislature?.tenure === tenure) return c;
  const seed = `${tenure}|${c.character.state}`;
  const [lower, upper] = chambersFor(c.office.id);
  const low = generateSeating(lower, seed), up = lower === upper ? low : generateSeating(upper, seed);
  const lawmakers = generateLawmakers(low, up, seed, upper, lower);
  const seating = lower === upper ? [low] : [low, up];
  const legislature: Legislature = { tenure, seating, lawmakers, backbench: seating.flatMap(s => generateBackbench(s, lawmakers, seed)), bills: [], interactions: {}, playerRoles: [], leadershipBids: {}, oversight: 0, congressSession: '', docket: null };
  return { ...c, legislature };
}

export const playerParty = (c: Career): LegislatureParty => {
  const p = c.office?.party ?? c.character.party;
  return (legislatureParties as readonly string[]).includes(p) ? p as LegislatureParty : 'Independent';
};
const leanOf = (p: LegislatureParty) => p === 'Republican' ? 1 : p === 'Democrat' ? -1 : 0;
const LIVE: LegislativeBill['status'][] = ['introduced', 'in_committee', 'floor_debate', 'passed_house', 'passed_senate'];
/** Bills waiting for a floor vote (either chamber). */
export const ON_FLOOR: LegislativeBill['status'][] = ['floor_debate', 'passed_house', 'passed_senate'];
const otherChamber = (L: Legislature, ch: ChamberId): ChamberId => L.seating.find(s => s.chamber !== ch)?.chamber ?? ch;
/** Chamber that votes next: the origin chamber first (lower by default), then the other chamber once it passed there. */
export const votingChamber = (L: Legislature, b: LegislativeBill): ChamberId => {
  const origin = b.origin && L.seating.some(s => s.chamber === b.origin) ? b.origin : L.seating[0]!.chamber;
  return b.status === 'passed_house' || b.status === 'passed_senate' ? otherChamber(L, origin) : origin;
};
/** The chamber the player personally votes in, or null for executives and non-members. */
export const playerChamber = (c: Career, L: Legislature): ChamberId | null => L.seating.find(s => s.chamber === c.office?.id)?.chamber ?? null;
const movable = (b: LegislativeBill, q: string) => !b.stalledUntil || b.stalledUntil <= q;

/** Seeded, deterministic bill text for docket and Congress drafts. */
function draftBill(id: string, key: string, quarter: string, party: LegislatureParty | null, mine: LegislatureParty, sponsor: string, status: LegislativeBill['status'], scale: number, origin: ChamberId | null): LegislativeBill {
  const category = billCategories[Math.floor(seeded(`${id}|${key}|cat`) * billCategories.length)]!;
  const ideas = BILL_IDEAS[category], idea = ideas[Math.floor(seeded(`${id}|${key}|idea`) * ideas.length)]!;
  const lean = leanOf(party ?? mine) || (seeded(`${id}|${key}|lean`) < 0.5 ? -1 : 1) * 0.3;
  return { id: `${id}|${key}`, ...idea, category, sponsor, status, quarterIntroduced: quarter, committeeAssigned: status === 'draft' ? null : CATEGORY_COMMITTEE[category], urgent: seeded(`${id}|${key}|urgent`) < 0.2,
    party, ideology: Math.round(lean * (25 + seeded(`${id}|${key}|ideo`) * 35)), cost: Math.round(scale * (0.4 + seeded(`${id}|${key}|cost`) * 1.2)), amendments: 0, floorQuarter: null, stalledUntil: null, origin, rollCalls: [], executiveAction: null };
}

/** How a law sticks to the player: their own bill, else their last recorded vote on it. */
export function involvementIn(b: LegislativeBill): Involvement {
  if (b.party === null) return 'sponsor';
  return [...b.rollCalls].reverse().find(r => r.playerVote)?.playerVote ?? 'abstain';
}

/** Party and ideology of the sitting (non-player) President, fixed for the tenure. */
export function npcPresident(L: Legislature) {
  const party: LegislatureParty = seeded(`${L.tenure}|president`) < 0.5 ? 'Republican' : 'Democrat';
  return { party, ideology: leanOf(party) * 45, name: `President ${['Hale', 'Morrow', 'Calloway', 'Vance', 'Prescott', 'Langford'][Math.floor(seeded(`${L.tenure}|president|name`) * 6)]}` };
}

/**
 * Quarter-end: the sitting President signs or vetoes every bill Congress sent to the desk (legislators only).
 * Idempotent by status, so replays and reloads cannot act on a bill twice. Enacted laws apply bloc fallout once.
 */
export function presidentialReview(c: Career): { career: Career; notices: string[] } {
  const L = c.legislature;
  if (!L || c.office?.id === 'president' || !activeOffice(c) || L.tenure !== tenureKey(c)) return { career: c, notices: [] };
  const desk = L.bills.filter(b => b.status === 'awaiting_signature');
  if (!desk.length) return { career: c, notices: [] };
  const pres = npcPresident(L), mine = playerParty(c), notices: string[] = [];
  let n = c, reputation = c.reputation;
  const bills = L.bills.map(b => {
    if (b.status !== 'awaiting_signature') return b;
    const support = memberSupport(b, b.party ?? mine, pres.party, pres.ideology, 80, 0, false, costPenalty(b, 'house'));
    const signed = support >= 0.5;
    const line = `${pres.name} ${signed ? 'signed' : 'vetoed'} the ${b.title}.`;
    notices.push(line);
    if (b.party === null) reputation = Math.max(0, Math.min(100, reputation + (signed ? 3 : -2)));
    if (signed) n = applyLegislativeFallout(n, b, COST_REF.house, involvementIn(b), `${b.title}: signed into law.`);
    return { ...b, status: signed ? 'enacted' as const : 'vetoed' as const, executiveAction: line };
  });
  return { career: { ...n, reputation, legislature: { ...L, bills }, log: [...notices, ...n.log].slice(0, 60) }, notices };
}

/**
 * President only: Congress holds one floor vote per turn (filing a new bill when none is moving). A bill that clears
 * both chambers lands on the executive docket for signature or veto. Guarded by a saved turn-start watermark.
 */
export function congressSession(c: Career, start: string): { career: Career; notices: string[] } {
  if (c.office?.id !== 'president' || !activeOffice(c)) return { career: c, notices: [] };
  const n = ensureLegislature(c), L = n.legislature;
  if (!L || L.congressSession === start || L.seating.length < 2) return { career: n, notices: [] };
  const house = L.seating[0]!, quarter = docketQuarter(start), mine = playerParty(n);
  let bills = L.bills;
  let bill = bills.find(b => ON_FLOOR.includes(b.status));
  if (!bill && !bills.some(b => b.status === 'awaiting_signature')) {
    const speaker = L.lawmakers.find(l => l.role === 'house_speaker');
    bill = draftBill(`${L.tenure}|${quarter}`, 'congress', quarter, house.governing, mine, speaker?.name ?? `${house.governing} caucus`, 'floor_debate', COST_REF.house, 'house');
    bills = [...bills, bill];
  }
  const notices: string[] = [];
  if (bill) {
    const chamber = votingChamber(L, bill), rc = rollCall({ ...L, bills }, bill, chamber, mine);
    const first = bill.status === 'floor_debate';
    const status: LegislativeBill['status'] = !rc.passes ? 'failed' : first ? (chamber === 'senate' ? 'passed_senate' : 'passed_house') : 'awaiting_signature';
    const id = bill.id;
    bills = bills.map(b => b.id === id ? { ...b, status, rollCalls: [...b.rollCalls, { chamber, quarter, yes: rc.yes, no: rc.no, abstain: 0, passed: rc.passes, playerVote: null, rebel: false }] } : b);
    notices.push(`Congress: the ${chamber === 'senate' ? 'Senate' : 'House'} ${rc.passes ? 'passed' : 'rejected'} the ${bill.title} ${rc.yes}–${rc.no}.${status === 'awaiting_signature' ? ' It is on your desk for signature or veto.' : ''}`);
  }
  return { career: { ...n, legislature: { ...L, bills, congressSession: start } }, notices };
}

/** Populates the three quarterly legislative cards (floor bill, committee decision, whip) once per quarter. */
export function ensureLegislativeDocket(c: Career): Career {
  const n = ensureLegislature(c), L = n.legislature;
  if (!L || L.tenure !== tenureKey(n)) return n;
  const quarter = docketQuarter(n.date), id = `${L.tenure}|${quarter}|legislative`;
  if (L.docket?.id === id) return n;
  const mine = playerParty(n), scale = COST_REF[L.seating[0]!.chamber];
  let bills = L.bills;
  const own = playerChamber(n, L);
  const draft = (key: string, party: LegislatureParty | null, sponsor: string, status: LegislativeBill['status']) => draftBill(id, key, quarter, party, mine, sponsor, status, scale, party === null ? own : null);
  // Drop last quarter's un-introduced draft so a fresh idea is offered.
  bills = bills.filter(b => b.status !== 'draft');
  // The opposing party files one bill of its own whenever it has none moving.
  const rivalParty: LegislatureParty = mine === L.seating[0]!.governing ? L.seating[0]!.opposition : L.seating[0]!.governing;
  // Colleagues from both parties file bills in rotation (alternating each quarter) so the docket keeps moving AI legislation.
  const qIndex = Number(quarter.slice(0, 4)) * 4 + Number(quarter.slice(6));
  const aiLive = bills.filter(b => b.party !== null && LIVE.includes(b.status)).length;
  if (aiLive < 3) {
    const filer: LegislatureParty = qIndex % 2 ? rivalParty : mine;
    const pool = L.lawmakers.filter(l => l.party === filer);
    const sponsor = pool[qIndex % Math.max(1, pool.length)] ?? null;
    bills = [...bills, draft(aiLive ? `colleague-${qIndex}` : 'opposition', filer, sponsor?.name ?? `${filer} caucus`, 'in_committee')];
  }
  const ownLive = bills.find(b => b.party === null && LIVE.includes(b.status));
  const ready = (b: LegislativeBill) => ON_FLOOR.includes(b.status) && (!b.floorQuarter || b.floorQuarter <= quarter) && movable(b, quarter);
  // Even quarters give colleagues' bills the floor first; odd quarters favour the player's own bill.
  const floor = (qIndex % 2 === 0 ? bills.find(b => b.party !== null && ready(b)) : undefined) ?? bills.find(b => b.party === null && ON_FLOOR.includes(b.status) && (!b.floorQuarter || b.floorQuarter <= quarter) && movable(b, quarter))
    ?? bills.find(b => ON_FLOOR.includes(b.status) && (!b.floorQuarter || b.floorQuarter <= quarter) && movable(b, quarter));
  let priority: LegislativeBill;
  if (floor) priority = floor;
  else if (ownLive) priority = ownLive;
  else { priority = draft('bill', null, n.character.name, 'draft'); bills = [...bills, priority]; }
  const inCmte = (own: boolean) => bills.find(b => (b.party === null) === own && b.status === 'in_committee' && movable(b, quarter));
  const reviewBill = (qIndex % 2 === 0 ? inCmte(false) ?? inCmte(true) : inCmte(true) ?? inCmte(false)) ?? null;
  const chair = reviewBill ? L.lawmakers.find(l => l.committee === CATEGORY_COMMITTEE[reviewBill.category]) : undefined;
  const target = floor ?? reviewBill ?? priority;
  const L2 = { ...L, bills };
  const key = swingStance(L2, target, votingChamber(L2, target), mine)?.lawmaker;
  const others = [...L.lawmakers].filter(l => l.id !== key?.id).sort((a, b) => Number(isSwing(b)) - Number(isSwing(a)) || a.loyalty - b.loyalty).slice(0, key ? 2 : 3);
  const slot = <S extends 'priority' | 'committee' | 'whip'>(s: S, title: string, actions: LegislativeSlot['actions'], billId: string | null, lawmakerIds: string[] = []) => ({ slot: s, title, actions, billId, lawmakerIds, resolved: false, choice: null, outcome: null });
  const pAction: LegislativeSlot['actions'] = priority.status === 'draft' ? ['introduce'] : priority === floor ? ['floor_vote'] : ['await'];
  const pTitle = priority.status === 'draft' ? `Introduce: ${priority.title}` : priority === floor ? `Floor vote: ${priority.title}` : `In committee: ${priority.title}`;
  const cActions: LegislativeSlot['actions'] = !reviewBill ? ['hearing'] : reviewBill.party === null ? ['favorable', 'amend', 'hearing'] : ['favorable', 'amend', 'hearing', 'table'];
  const items = [
    slot('priority', pTitle, pAction, priority.id),
    slot('committee', reviewBill ? `${COMMITTEE_NAMES[CATEGORY_COMMITTEE[reviewBill.category]]} Committee: ${reviewBill.title}` : 'Oversight hearing', cActions, reviewBill?.id ?? null, chair ? [chair.id] : []),
    slot('whip', key ? `Whip ${key.name} on ${target.title}` : 'Whip the swing votes', ['whip', 'compromise'], target.id, [...(key ? [key.id] : []), ...others.map(l => l.id)]),
  ] as NonNullable<Legislature['docket']>['items'];
  return { ...n, legislature: { ...L2, docket: { id, quarter, revision: 0, items } } };
}
