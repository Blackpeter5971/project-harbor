import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { projectBenefit } from './public-project-schema';
import { officeById, usd, type OfficeId, type Story } from './campaign';
import { shiftApproval, ensureApproval, type GroupDelta } from './approval';
import { activeOffice, submitMeasure, tenureKey, evaluateSupport, type Bill } from './support';

/* Phase 4 — Public budgets & taxes. Jurisdiction revenue, spending categories,
   surplus/deficit, and service/infrastructure/employment indicators.
   Proposals must fit available funds and the office's authority; every spend
   carries a political trade-off that feeds the approval system. */

type Res = { ok: true; career: Career; message: string } | { ok: false; message: string };
const r1 = (n: number) => Math.round(n * 10) / 10;

export const budgetCategories = [
  { id: 'services', name: 'Public services', desc: 'Sanitation, libraries, parks and front-line staff.' },
  { id: 'infrastructure', name: 'Infrastructure', desc: 'Roads, transit, water and public buildings.' },
  { id: 'safety', name: 'Public safety', desc: 'Police, fire and emergency response.' },
  { id: 'education', name: 'Education', desc: 'Schools, teachers and student programs.' },
  { id: 'administration', name: 'Administration', desc: 'Back-office government operations.' },
] as const;
export type BudgetCategory = (typeof budgetCategories)[number]['id'];

export type TaxStance = 'cut' | 'hold' | 'raise';
export const taxStances: { id: TaxStance; name: string; note: string }[] = [
  { id: 'cut', name: 'Cut taxes', note: '−15% revenue · business cheers, services strain' },
  { id: 'hold', name: 'Hold taxes', note: 'Revenue unchanged · no political cost' },
  { id: 'raise', name: 'Raise taxes', note: '+15% revenue · funds services, angers business' },
];

/** Annual revenue base in dollars, scaled to the jurisdiction the office governs. */
export function revenueBase(c: Career): number {
  const o = c.office;
  if (!o) return 0;
  const scale = officeById(o.id as OfficeId).scale;
  return Math.round(2_000_000 * scale * (1 + c.experience / 500));
}

export function revenueWithTaxes(c: Career, stance: TaxStance): number {
  const base = revenueBase(c);
  return Math.round(base * (stance === 'cut' ? 0.85 : stance === 'raise' ? 1.15 : 1));
}

/** Baseline "needs" per category — spending below it degrades indicators. */
export function baselineSpend(c: Career): Record<BudgetCategory, number> {
  const rev = revenueBase(c);
  return { services: rev * 0.24, infrastructure: rev * 0.18, safety: rev * 0.2, education: rev * 0.26, administration: rev * 0.12 };
}

export function currentBudget(c: Career): { stance: TaxStance; spending: Record<BudgetCategory, number>; revenue: number; total: number; balance: number } {
  const stance = c.budget?.taxes ?? 'hold';
  const base = baselineSpend(c);
  const spending = { ...base, ...(c.budget?.spending ?? {}) } as Record<BudgetCategory, number>;
  const revenue = revenueWithTaxes(c, stance);
  const total = Math.round(Object.values(spending).reduce((s, v) => s + v, 0));
  return { stance, spending, revenue, total, balance: revenue - total };
}

/** Inherited public liquidity: one quarter's revenue, less already recorded commitments.
 * Never reconstruct or debit personal/campaign accounts when upgrading a legacy save. */
export function ensureTreasury(c: Career): Career {
  if (!activeOffice(c) || !c.office || c.date < c.office.since) return c;
  const tenure = tenureKey(c);
  if (c.treasury?.tenure === tenure) return c;
  const year = Number(c.date.slice(0, 4));
  const committed = [c.city, c.stateGovernment, c.federalGovernment]
    .filter(s => s?.tenure === tenure && s.year === year)
    .reduce((sum, s) => sum + (s?.spent ?? 0), 0);
  const balance = Math.max(0, Math.round(currentBudget(c).revenue / 4) - committed);
  return { ...c, treasury: { tenure, balance, lastProcessedEnd: c.date, transactions: [
    ...(c.treasury?.transactions ?? []),
    { key: `${tenure}|opening`, tenure, date: c.date, label: 'Opening public treasury reserves (net of existing commitments)', amount: balance },
  ] } };
}

export function treasuryFunds(c: Career): number {
  if (!activeOffice(c) || !c.office || c.date < c.office.since) return 0;
  return ensureTreasury(c).treasury?.balance ?? 0;
}

/** Call only after the existing office-specific authority/appropriation checks.
 * Stable transaction keys make a persisted expense impossible to charge twice. */
export function spendTreasury(c: Career, amount: number, key: string, label: string): Res {
  if (!activeOffice(c) || !c.office || c.date < c.office.since) return { ok: false, message: 'You hold no active public office.' };
  if (!key || !Number.isFinite(amount) || amount < 0) return { ok: false, message: 'Invalid public treasury expense.' };
  const n = ensureTreasury(c), treasury = n.treasury;
  if (!treasury) return { ok: false, message: 'No government treasury is available.' };
  const transactionKey = `${treasury.tenure}|expense|${key}`;
  if (treasury.transactions.some(t => t.key === transactionKey)) return { ok: false, message: 'This public expense was already paid.' };
  if (amount > treasury.balance) return { ok: false, message: `Insufficient government treasury: ${usd(amount)} required; ${usd(treasury.balance)} available.` };
  if (amount === 0) return { ok: true, career: n, message: 'No public funds spent.' };
  return { ok: true, message: `${usd(amount)} paid from government treasury.`, career: { ...n, treasury: { ...treasury, balance: treasury.balance - amount, transactions: [...treasury.transactions, { key: transactionKey, tenure: treasury.tenure, date: c.date, label, amount: -amount }] } } };
}

const monthIndex = (date: string) => {
  if (!/^\d{4}-\d{2}-01$/.test(date)) return NaN;
  const [year = 0, month = 0] = date.split('-').map(Number);
  return month >= 1 && month <= 12 ? year * 12 + month - 1 : NaN;
};

/** Settle exactly one quarterly interval, prorating months outside the office term.
 * Revenue posts first; operating payments are capped at cash, never borrowed. */
export function treasuryTurn(c: Career, start: string, end: string): Career {
  const from = monthIndex(start), to = monthIndex(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to - from !== 3 || start !== c.date) return c;
  const n = ensureTreasury(c), treasury = n.treasury, office = n.office;
  if (!treasury || !office || treasury.tenure !== tenureKey(n) || start < treasury.lastProcessedEnd) return c;
  const months = Math.max(0, Math.min(to, office.termEnd ? monthIndex(office.termEnd) : to) - Math.max(from, monthIndex(office.since)));
  if (!months) return c;
  const budget = currentBudget(n);
  const revenue = Math.max(0, Math.round(budget.revenue * months / 12));
  // Infrastructure/safety are discretionary allocations already paid by the
  // authorized commitment handlers; do not charge those plans a second time.
  const operating = budget.spending.services + budget.spending.education + budget.spending.administration;
  const due = Math.max(0, Math.round(operating * months / 12));
  const expense = Math.min(due, treasury.balance + revenue);
  // Phase 5: existing roads, water, police and fire assets need upkeep every quarter,
  // whatever the discretionary allocation — this is what stops reserves piling up.
  const upkeepDue = Math.max(0, Math.round(maintenanceCost(n) * months / 12));
  const upkeep = Math.min(upkeepDue, treasury.balance + revenue - expense);
  const key = `${treasury.tenure}|quarter|${start}|${end}`;
  return { ...n, treasury: { ...treasury, balance: treasury.balance + revenue - expense - upkeep, lastProcessedEnd: end, transactions: [
    ...treasury.transactions,
    { key: `${key}|revenue`, tenure: treasury.tenure, date: end, label: 'Quarterly government revenue', amount: revenue },
    { key: `${key}|operations`, tenure: treasury.tenure, date: end, label: `Quarterly administrative and operating expenses${expense < due ? ` (unfunded ${usd(due - expense)})` : ''}`, amount: -expense },
    { key: `${key}|maintenance`, tenure: treasury.tenure, date: end, label: `Infrastructure and public safety maintenance${upkeep < upkeepDue ? ` (unfunded ${usd(upkeepDue - upkeep)})` : ''}`, amount: upkeep ? -upkeep : 0 },
  ] } };
}

/** Share of baseline infrastructure and public-safety needs owed every year as recurring upkeep. */
export const INFRASTRUCTURE_UPKEEP_RATE = 0.5;
export const SAFETY_UPKEEP_RATE = 0.5;
/** Annual recurring maintenance of existing roads, water, police and fire assets. */
export function maintenanceCost(c: Career): number {
  const base = baselineSpend(c);
  return Math.round(base.infrastructure * INFRASTRUCTURE_UPKEEP_RATE + base.safety * SAFETY_UPKEEP_RATE);
}
/** Projected quarterly treasury change at the current budget, after operations and maintenance. */
export function quarterlyTreasuryOutlook(c: Career) {
  const b = currentBudget(c);
  const revenue = Math.round(b.revenue / 4);
  const operations = Math.round((b.spending.services + b.spending.education + b.spending.administration) / 4);
  const maintenance = Math.round(maintenanceCost(c) / 4);
  return { revenue, operations, maintenance, net: revenue - operations - maintenance };
}

/** 0–100 indicators derived from spending vs baseline needs. */
export function indicators(c: Career): { services: number; infrastructure: number; employment: number } {
  const base = baselineSpend(c);
  const sp = currentBudget(c).spending;
  const ratio = (k: BudgetCategory) => (base[k] > 0 ? sp[k] / base[k] : 1);
  const pct = (r: number) => Math.round(Math.max(5, Math.min(98, 40 + r * 45)));
  const programs = c.stateGovernment?.tenure === tenureKey(c) ? c.stateGovernment.agencies.filter(a => a.status === 'completed').length : 0;
  const disasterPenalty = c.stateGovernment?.tenure === tenureKey(c) && c.stateGovernment.disaster && !c.stateGovernment.disaster.resolved ? 5 : 0;
  const benefits = [c.city, c.stateGovernment, c.federalGovernment]
    .filter(s => s?.tenure === tenureKey(c))
    .flatMap(s => s?.publicProjects ?? [])
    .filter(p => p.tenure === tenureKey(c) && p.status === 'completed' && p.progress === 100 && p.benefitsApplied)
    .reduce((sum, p) => { const b = projectBenefit(p); return { services: sum.services + b.services, infrastructure: sum.infrastructure + b.infrastructure, employment: sum.employment + b.employment }; }, { services: 0, infrastructure: 0, employment: 0 });
  const crisisEffects = (c.crises ?? []).filter(p => p.tenure === tenureKey(c) && p.status !== 'resolved' && p.selectedResponseId && p.turnCreated <= c.date)
    .reduce((sum, p) => ({ services: sum.services + (p.indicatorEffects?.services ?? 0), infrastructure: sum.infrastructure + (p.indicatorEffects?.infrastructure ?? 0), employment: sum.employment + (p.indicatorEffects?.employment ?? 0) }), { services: 0, infrastructure: 0, employment: 0 });
  return {
    services: Math.max(5, Math.min(98, pct((ratio('services') + ratio('safety') + ratio('education')) / 3) + programs * 3 - disasterPenalty + benefits.services + crisisEffects.services)),
    infrastructure: Math.min(98, pct(ratio('infrastructure')) + (c.city?.tenure === tenureKey(c) ? c.city.projects.filter(p => p.status === 'completed').length * 3 : 0) + benefits.infrastructure + crisisEffects.infrastructure),
    employment: Math.max(5, Math.min(98, pct((ratio('services') + ratio('administration') + ratio('education')) / 3) + programs * 2 - disasterPenalty + benefits.employment + crisisEffects.employment)),
  };
}

/** Executives propose budgets; legislators can only review and amend within their chamber. */
export function budgetAuthority(c: Career): { canPropose: boolean; reason: string } {
  const id = c.office?.id as OfficeId | undefined;
  if (!id) return { canPropose: false, reason: 'You hold no public office.' };
  if (id === 'mayor' || id === 'governor' || id === 'president') return { canPropose: true, reason: 'Your office proposes the budget.' };
  return { canPropose: false, reason: 'As a legislator you review and vote on budgets — the executive proposes them.' };
}

/** The visible trade-off each spending choice carries. */
export function tradeOffs(cat: BudgetCategory, vs: 'more' | 'less'): { text: string; approval: number; groups: GroupDelta[] } {
  const up = vs === 'more';
  switch (cat) {
    case 'services': return up
      ? { text: 'Better services please workers and seniors; fiscal hawks grumble.', approval: 1.5, groups: [{ group: 'working', delta: 2 }, { group: 'seniors', delta: 2 }, { group: 'labor', delta: 1.5 }, { group: 'business', delta: -1 }] }
      : { text: 'Service cuts hit workers, seniors and unions hardest.', approval: -2, groups: [{ group: 'working', delta: -3 }, { group: 'seniors', delta: -3 }, { group: 'labor', delta: -2.5 }, { group: 'business', delta: 1 }] };
    case 'infrastructure': return up
      ? { text: 'Construction jobs and contracts delight business and unions.', approval: 1, groups: [{ group: 'business', delta: 2 }, { group: 'labor', delta: 1.5 }, { group: 'environment', delta: -1 }] }
      : { text: 'Crumbling roads frustrate commuters and businesses.', approval: -1.5, groups: [{ group: 'business', delta: -2 }, { group: 'suburban', delta: -2 }] };
    case 'safety': return up
      ? { text: 'Safety spending reassures seniors and the religious coalition.', approval: 1, groups: [{ group: 'seniors', delta: 2 }, { group: 'religious', delta: 1.5 }, { group: 'youth', delta: -1 }] }
      : { text: 'Safety cuts worry seniors and suburban voters.', approval: -1.5, groups: [{ group: 'seniors', delta: -2.5 }, { group: 'suburban', delta: -2 }] };
    case 'education': return up
      ? { text: 'Schools funding energises youth, parents and educators.', approval: 1.5, groups: [{ group: 'youth', delta: 2.5 }, { group: 'suburban', delta: 2 }, { group: 'working', delta: 1 }] }
      : { text: 'Education cuts anger parents, educators and the young.', approval: -2, groups: [{ group: 'youth', delta: -3 }, { group: 'suburban', delta: -2.5 }, { group: 'working', delta: -1.5 }] };
    case 'administration': return up
      ? { text: 'A bigger bureaucracy is an easy target for critics.', approval: -1, groups: [{ group: 'business', delta: -1.5 }, { group: 'establishment', delta: 0.5 }] }
      : { text: 'Lean administration pleases fiscal conservatives; services may strain.', approval: 0.5, groups: [{ group: 'business', delta: 1.5 }, { group: 'labor', delta: -1 }] };
  }
}

export function taxTradeOff(stance: TaxStance): { text: string; approval: number; groups: GroupDelta[] } {
  if (stance === 'raise') return { text: 'Higher taxes fund services but anger business and suburban homeowners.', approval: -2, groups: [{ group: 'business', delta: -3 }, { group: 'suburban', delta: -2 }, { group: 'working', delta: 1 }, { group: 'seniors', delta: 1 }] };
  if (stance === 'cut') return { text: 'Tax cuts delight business but starve public services.', approval: 1, groups: [{ group: 'business', delta: 3 }, { group: 'suburban', delta: 1.5 }, { group: 'working', delta: -1.5 }, { group: 'labor', delta: -1.5 }] };
  return { text: 'Holding taxes steady changes nothing — and satisfies no one fully.', approval: 0, groups: [] };
}

const queue = (c: Career, s: Story): Career => ({ ...c, newsQueue: [...c.newsQueue, s] });
const log = (c: Career, msg: string): Career => ({ ...c, log: [msg, ...c.log].slice(0, 12) });

/** Propose a budget: must fit available revenue and the office's authority. Costs 1 action. */
export function proposeBudget(c: Career, spending: Record<BudgetCategory, number>, stance: TaxStance): Res {
  if (!activeOffice(c)) return { ok: false, message: 'You hold no active public office.' };
  const auth = budgetAuthority(c);
  if (!auth.canPropose) return { ok: false, message: auth.reason };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn. Advance time to continue.' };
  if (!budgetCategories.every(cat => Number.isFinite(spending[cat.id]) && spending[cat.id] >= 0) || !['cut', 'hold', 'raise'].includes(stance)) return { ok: false, message: 'Every spending amount must be finite and non-negative.' };
  const revenue = revenueWithTaxes(c, stance);
  const total = Math.round(budgetCategories.reduce((s, cat) => s + spending[cat.id], 0));
  if (total > revenue) return { ok: false, message: `Over budget: ${usd(total)} in spending against ${usd(revenue)} in revenue. Cut ${usd(total - revenue)} or raise taxes.` };
  if (c.federalGovernment?.tenure === tenureKey(c) && c.federalGovernment.year === Number(c.date.slice(0, 4)) && spending.infrastructure + spending.safety < c.federalGovernment.spent) return { ok: false, message: 'Congressional appropriations must cover existing federal commitments.' };
  if (c.city?.tenure === tenureKey(c) && c.city.year === Number(c.date.slice(0, 4)) && spending.infrastructure + spending.safety < c.city.spent) return { ok: false, message: 'This budget cuts public allocations below funds already committed to city projects and emergency responses.' };
  if (c.stateGovernment?.tenure === tenureKey(c) && c.stateGovernment.year === Number(c.date.slice(0, 4)) && spending.infrastructure + spending.safety < c.stateGovernment.spent) return { ok: false, message: 'This budget cannot cut allocations below existing state commitments.' };
  return submitMeasure(c, { title: `${c.office?.jurisdiction} budget`, kind: 'budget', policy: stance === 'cut' ? 'business' : 'services', cost: 0, budget: { spending, stance } });
}

/** Enact only a persisted budget that has cleared its chamber and executive approval. */
export function enactBudget(c: Career, bill: Bill): Res {
  if (!activeOffice(c) || !c.office || bill.tenure !== tenureKey(c) || !bill.budget || bill.stage !== 'passed' || !c.bills.some(b => b.id === bill.id && b.stage === 'passed') || c.budget?.proposals.some(p => p.result.includes(bill.id))) return { ok: false, message: 'This budget has not cleared approval, or was already enacted.' };
  const spending = bill.budget.spending as Record<BudgetCategory, number>, stance = bill.budget.stance;
  const revenue = revenueWithTaxes(c, stance);
  const total = Math.round(budgetCategories.reduce((s, cat) => s + (spending[cat.id] ?? 0), 0));
  if (total > revenue) return { ok: false, message: 'Available revenue no longer covers this budget.' };
  if (['house', 'senate', 'president'].includes(c.office.id) && !(['house', 'senate'] as const).every(ch => bill.chamberVotes.some(v => v.chamber === ch && v.support.outcome === 'pass'))) return { ok: false, message: 'Congress has not approved this appropriation in both chambers.' };
  if (c.federalGovernment?.tenure === tenureKey(c) && c.federalGovernment.year === Number(c.date.slice(0, 4)) && spending.infrastructure + spending.safety < c.federalGovernment.spent) return { ok: false, message: 'The budget cannot erase existing federal commitments.' };
  if (c.city?.tenure === tenureKey(c) && c.city.year === Number(c.date.slice(0, 4)) && spending.infrastructure + spending.safety < c.city.spent) return { ok: false, message: 'The budget cannot cover existing city commitments.' };
  if (c.stateGovernment?.tenure === tenureKey(c) && c.stateGovernment.year === Number(c.date.slice(0, 4)) && spending.infrastructure + spending.safety < c.stateGovernment.spent) return { ok: false, message: 'The budget cannot cover existing state commitments.' };
  const prev = currentBudget(c);
  let n: Career = ensureApproval(c);
  const changes: string[] = [];
  for (const cat of budgetCategories) {
    const before = prev.spending[cat.id], after = Math.max(0, spending[cat.id] ?? before);
    const move = after > before * 1.05 ? 'more' : after < before * 0.95 ? 'less' : null;
    if (!move) continue;
    const t = tradeOffs(cat.id, move);
    n = shiftApproval(n, t.approval, `${cat.name} ${move === 'more' ? 'increased' : 'cut'} in the ${c.office.jurisdiction} budget — ${t.text}`, t.groups);
    changes.push(`${cat.name} ${move === 'more' ? 'up' : 'down'}`);
  }
  if (stance !== prev.stance) {
    const t = taxTradeOff(stance);
    if (t.approval !== 0 || t.groups.length) n = shiftApproval(n, t.approval, `Taxes ${stance === 'raise' ? 'raised' : 'cut'} — ${t.text}`, t.groups);
    changes.push(`taxes ${stance === 'hold' ? 'held' : stance === 'raise' ? 'raised' : 'cut'}`);
  }
  const balance = revenue - total;
  n = {
    ...n,
    budget: {
      year: Number(c.date.slice(0, 4)),
      revenue,
      taxes: stance,
      spending: Object.fromEntries(budgetCategories.map(b => [b.id, Math.max(0, Math.round(spending[b.id] ?? prev.spending[b.id]))])),
      proposals: [{ date: c.date, total, result: `Adopted · surplus ${usd(balance)} · reference ${bill.id}` }, ...(n.budget?.proposals ?? [])].slice(0, 10),
    },
  };
  const headline = `${c.office.title} ${c.character.name} ${balance >= 0 ? 'passes balanced budget' : 'signs deficit budget'} · ${bill.id}`;
  n = queue(n, { h: headline, sub: `${usd(total)} spending plan for ${c.office.jurisdiction}`, body: `${c.character.name} adopted a ${usd(total)} budget for ${c.office.jurisdiction}: ${changes.join(', ') || 'spending held steady'}. The plan ${balance >= 0 ? `leaves a surplus of ${usd(balance)}` : `runs a deficit of ${usd(-balance)}`}.`, tag: 'government', subject: c.character.name, portrait: c.character.portrait });
  const message = `Budget adopted: ${usd(total)} of ${usd(revenue)} (${balance >= 0 ? `surplus ${usd(balance)}` : `deficit ${usd(-balance)}`}). ${changes.length ? `Changes: ${changes.join(', ')}.` : 'No category moved enough to shift opinion.'}`;
  return { ok: true, career: log(n, message), message };
}


/** Q4 executive budget negotiation: the chamber votes on the proposed tax stance; a failed vote forces the balanced compromise. */
export function legislativeBudgetVote(c: Career, policyId: string, key: string) {
  const chamber = c.office?.id === 'president' ? 'house' : c.office?.id;
  const support = evaluateSupport(c, policyId === 'low' ? 'business' : 'services', `${key}|budget|${policyId}`, policyId === 'balanced' ? 12 : 0, 0, chamber);
  const passed = policyId === 'balanced' || support.outcome === 'pass';
  return { passed, adopted: passed ? policyId : 'balanced', support };
}
