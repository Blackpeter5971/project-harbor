import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { financeSchema, type Finance, type Economy, type GovLoan, type AnnualReport } from './finance-schema';
import { currentBudget, ensureTreasury, revenueWithTaxes, taxTradeOff, type TaxStance } from './budget';
import { shiftApproval } from './approval';
import { activeOffice, tenureKey, type Result } from './support';
import { rand, usd } from './campaign';
import { approveProject, projectCatalog, publicProjects } from './public-projects';
import { federalState } from './federal';
import { approvalMomentum, happinessTarget, mood, publicReaction } from './happiness';

/* Phase 1 — Government treasury & economic management. Pure, browser-safe.
   Everything here moves only treasury money (never personal, campaign or business cash)
   and persists inside the tenure-scoped treasury so it resets with each new government. */

export const EXECUTIVES = ['mayor', 'governor', 'president'] as const;
export const isExecutive = (c: Career) => activeOffice(c) && !!c.office && (EXECUTIVES as readonly string[]).includes(c.office.id) && c.date >= c.office.since;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = (n: number) => Math.round(n * 10) / 10;
const monthIndex = (d: string) => { const [y = 0, m = 1] = d.split('-').map(Number); return y * 12 + m - 1; };
const year = (d: string) => Number(d.slice(0, 4));

export function financeOf(c: Career): Finance { return c.treasury?.finance ?? financeSchema.parse({}); }
export function withFinance(c: Career, f: Finance): Career {
  const n = ensureTreasury(c);
  return n.treasury ? { ...n, treasury: { ...n.treasury, finance: f } } : n;
}
export function credit(c: Career, amount: number, key: string, label: string): Career {
  const t = c.treasury!; const k = `${t.tenure}|${key}`;
  if (t.transactions.some(x => x.key === k)) return c;
  return { ...c, treasury: { ...t, balance: Math.max(0, t.balance + amount), transactions: [...t.transactions, { key: k, tenure: t.tenure, date: c.date, label, amount }] } };
}

/* ---------- Taxes & economy ---------- */
export const TAX_RATES: Record<string, Record<TaxStance, number>> = {
  mayor: { cut: 1.6, hold: 1.9, raise: 2.2 }, governor: { cut: 4.8, hold: 5.6, raise: 6.4 }, president: { cut: 18, hold: 21, raise: 24 },
};
export const taxRate = (c: Career, s: TaxStance = currentBudget(c).stance) => TAX_RATES[c.office?.id ?? 'mayor']?.[s] ?? 0;
const taxLean = (s: TaxStance) => (s === 'cut' ? 1 : s === 'raise' ? -1 : 0);
/** Tax revenue scales with business health and employment; neutral economy = 1. */
export const economyFactor = (e: Economy) => r1((1 + (e.business - 50) * 0.004 + (e.employment - 50) * 0.002) * 1000) / 1000;
const tradeFactor = (c: Career) => (c.office?.id === 'president' ? 1 + (federalState(c).diplomacy - 40) * 0.005 : 1);

type Stream = { label: string; kind: 'tax' | 'statutory' | 'trade'; share: number };
const STREAMS: Record<string, Stream[]> = {
  mayor: [{ label: 'Local income & sales taxes', kind: 'tax', share: 0.35 }, { label: 'Business & property taxes', kind: 'tax', share: 0.3 }, { label: 'Municipal fees & permits', kind: 'tax', share: 0.15 }, { label: 'State & federal statutory allocations', kind: 'statutory', share: 0.2 }],
  governor: [{ label: 'State income & sales taxes', kind: 'tax', share: 0.45 }, { label: 'Business & property taxes', kind: 'tax', share: 0.2 }, { label: 'State-generated revenue', kind: 'tax', share: 0.15 }, { label: 'Federal statutory allocations', kind: 'statutory', share: 0.2 }],
  president: [{ label: 'Federal income taxes', kind: 'tax', share: 0.55 }, { label: 'Corporate & business taxes', kind: 'tax', share: 0.15 }, { label: 'Tariffs & foreign trade', kind: 'trade', share: 0.15 }, { label: 'Other federal receipts', kind: 'statutory', share: 0.15 }],
};
/** Quarterly revenue by source. Statutory allocations are fixed — no arbitrary deductions. */
export function revenueStreams(c: Career) {
  const base = currentBudget(c).revenue / 4, e = financeOf(c).economy, f = economyFactor(e), t = tradeFactor(c);
  return (STREAMS[c.office?.id ?? ''] ?? []).map(s => ({ ...s, amount: Math.round(base * s.share * (s.kind === 'tax' ? f : s.kind === 'trade' ? t : 1)) }));
}
/** Difference between source-based revenue and the flat base already posted by treasuryTurn. */
export function economicAdjustment(c: Career) {
  const base = Math.round(currentBudget(c).revenue / 4);
  return revenueStreams(c).reduce((s, x) => s + x.amount, 0) - base;
}

function economyTarget(c: Career, e: Economy): Economy {
  const t = taxLean(currentBudget(c).stance);
  const done = publicProjects(c).filter(p => p.status === 'completed').length;
  const debtDrag = Math.min(8, debtTotal(c) / Math.max(1, currentBudget(c).revenue) * 10);
  const business = 50 + 12 * t + done * 1.5 - debtDrag;
  const employment = 50 + 8 * t + done * 2 + (e.business - 50) * 0.3;
  const household = 50 + 10 * t + (e.employment - 50) * 0.4;
  const happiness = 50 + 6 * t + (e.household - 50) * 0.4 + done * 2 - debtDrag / 2;
  return { business: clamp(business), employment: clamp(employment), household: clamp(household), happiness: clamp(happiness) };
}
const drift = (e: Economy, to: Economy): Economy => ({ business: r1(e.business + (to.business - e.business) * 0.35), employment: r1(e.employment + (to.employment - e.employment) * 0.35), household: r1(e.household + (to.household - e.household) * 0.35), happiness: r1(e.happiness + (to.happiness - e.happiness) * 0.35) });
export const economyPreview = (c: Career, s: TaxStance) => {
  const t = taxLean(s);
  return { revenue: revenueWithTaxes(c, s), business: 12 * t, employment: 8 * t, household: 10 * t, happiness: 6 * t };
};

/** Executive tax adjustment: once per quarter, 1 action, feeds the shared budget tax stance. */
export function setTaxStance(c: Career, stance: TaxStance): Result {
  if (!isExecutive(c)) return { ok: false, message: 'Only a sitting mayor, governor or president sets tax rates.' };
  const f = financeOf(c), b = currentBudget(c);
  if (stance === b.stance) return { ok: false, message: 'That tax rate is already in effect.' };
  if (f.taxTurn === c.date) return { ok: false, message: 'Tax rates can change once per quarter.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const n0 = ensureTreasury(c);
  const tr = taxTradeOff(stance);
  const label = stance === 'raise' ? 'raised' : stance === 'cut' ? 'cut' : 'returned to balanced';
  let n: Career = { ...n0, actions: c.actions - ACTION_COST, budget: { year: year(c.date), revenue: revenueWithTaxes(c, stance), taxes: stance, spending: b.spending, proposals: c.budget?.proposals ?? [] } };
  n = shiftApproval(n, stance === 'hold' ? 0.5 : tr.approval, `Taxes ${label} to ${taxRate(c, stance)}% — ${tr.text}`, tr.groups);
  n = withFinance(n, { ...financeOf(n), taxTurn: c.date });
  const msg = `Taxes ${label}: ${taxRate(c, stance)}% rate · ${usd(revenueWithTaxes(c, stance))}/yr projected revenue.`;
  return { ok: true, message: msg, career: { ...n, log: [msg, ...n.log].slice(0, 12) } };
}

/* ---------- Loans ---------- */
export const debtTotal = (c: Career) => financeOf(c).loans.reduce((s, l) => s + l.payment * l.remaining + l.arrears, 0);
export const quarterlyDebtService = (c: Career) => financeOf(c).loans.filter(l => l.remaining > 0).reduce((s, l) => s + l.payment, 0);
export const LOAN_THRESHOLD = 0.1;
export const loanVisible = (c: Career) => isExecutive(c) && (c.treasury?.balance ?? 0) < currentBudget(c).total * LOAN_THRESHOLD;
const quartersLeft = (c: Career) => c.office?.termEnd ? Math.floor((monthIndex(c.office.termEnd) - monthIndex(c.date)) / 3) : 16;
export function amortize(principal: number, annualRate: number, quarters: number) {
  const r = annualRate / 100 / 4;
  const payment = Math.ceil(r ? principal * r / (1 - (1 + r) ** -quarters) : principal / quarters);
  return { payment, total: payment * quarters };
}
export function loanOffers(c: Career) {
  if (!loanVisible(c)) return [];
  const b = currentBudget(c), f = financeOf(c);
  const room = Math.max(0, Math.round(b.revenue * 0.6) - debtTotal(c));
  const principal = Math.min(Math.round(b.total * 0.25), room);
  if (principal < 1000 || f.loans.some(l => l.taken === c.date)) return [];
  const base = { mayor: 6.5, governor: 5, president: 3.5 }[c.office!.id as 'mayor'] ?? 6;
  const missed = f.loans.reduce((s, l) => s + l.missed, 0);
  const rate = r1(base + missed * 1.5 + debtTotal(c) / Math.max(1, b.revenue) * 4 + (50 - f.economy.business) * 0.03);
  return [4, 8, 12].filter(q => q <= quartersLeft(c)).map(quarters => ({ quarters, principal, rate: r1(rate + quarters * 0.1), ...amortize(principal, r1(rate + quarters * 0.1), quarters) }));
}
export function takeLoan(c: Career, quarters: number): Result {
  const offer = loanOffers(c).find(o => o.quarters === quarters);
  if (!offer) return { ok: false, message: 'No government loan is available on these terms right now.' };
  const n0 = ensureTreasury(c);
  const loan: GovLoan = { id: `${tenureKey(c)}|loan|${c.date}`, taken: c.date, principal: offer.principal, rate: offer.rate, quarters, payment: offer.payment, remaining: quarters, arrears: 0, missed: 0, lastPaidEnd: '' };
  let n = credit(n0, offer.principal, `loan|${c.date}`, `Government loan · ${offer.rate}% over ${quarters} quarters`);
  n = withFinance(n, { ...financeOf(n), loans: [...financeOf(n).loans, loan] });
  const msg = `Government loan approved: ${usd(offer.principal)} credited to the treasury; ${usd(offer.payment)} deducted each quarter (${usd(offer.total)} total).`;
  return { ok: true, message: msg, career: { ...n, log: [msg, ...n.log].slice(0, 12) } };
}

/* ---------- Intergovernmental relations ---------- */
/** Party of the federal (for governors) or state (for mayors) administration, fixed per 4-year cycle. */
export function higherGovernmentParty(c: Career) {
  const cycle = Math.floor((year(c.date) - 1) / 4);
  return rand(`${c.office?.id === 'mayor' ? c.character.state : 'federal'}|${cycle}`) < 0.5 ? 'Democrat' : 'Republican';
}
export function relationship(c: Career) {
  if (c.office?.id === 'president') return null;
  const aligned = higherGovernmentParty(c) === c.character.party;
  const score = clamp(Math.round((aligned ? 62 : c.character.party === 'Independent' ? 42 : 30) + (c.relationships - 50) / 4));
  return { score, partner: c.office?.id === 'mayor' ? 'Governor' : 'President', party: higherGovernmentParty(c), aligned };
}
export const grantAmount = (c: Career) => Math.round(currentBudget(c).revenue * (c.office?.id === 'president' ? 0.02 : 0.03));
/** Mayors/governors lobby for discretionary aid; presidents award development grants to states. */
export function requestGrant(c: Career): Result {
  if (!isExecutive(c)) return { ok: false, message: 'Only an executive office handles intergovernmental funding.' };
  const f = financeOf(c);
  if (f.grantTurn === c.date) return { ok: false, message: 'Intergovernmental funding was already handled this quarter.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const amount = grantAmount(c);
  let n: Career = { ...ensureTreasury(c), actions: c.actions - ACTION_COST };
  let msg: string;
  if (c.office!.id === 'president') {
    if ((n.treasury?.balance ?? 0) < amount) return { ok: false, message: `Insufficient government treasury: ${usd(amount)} required.` };
    n = credit(n, -amount, `grant|${c.date}`, 'Discretionary development grants to states');
    n = shiftApproval(n, 1, 'Federal development grants reached struggling states.');
    msg = `Awarded ${usd(amount)} in discretionary development grants to states. Approval +1.`;
  } else {
    const rel = relationship(c)!;
    const won = rand(`${tenureKey(c)}|grant|${c.date}`) < rel.score / 100;
    if (won) { n = credit(n, amount, `grant|${c.date}`, `Discretionary ${rel.partner.toLowerCase()} grant`); msg = `The ${rel.partner} approved ${usd(amount)} in special development aid.`; }
    else msg = `The ${rel.partner}'s office turned down your request for discretionary aid (relationship ${rel.score}/100). Statutory allocations are unaffected.`;
  }
  n = withFinance(n, { ...financeOf(n), grantTurn: c.date });
  return { ok: true, message: msg, career: { ...n, log: [msg, ...n.log].slice(0, 12) } };
}

/* ---------- Annual projects agenda ---------- */
export type AgendaItem = { catalogId: string; name: string; cost: number; critical: boolean; carried: boolean; decision: Finance['decisions'][number]['decision'] | 'pending'; canPostpone: boolean };
export function annualAgenda(c: Career): AgendaItem[] {
  if (!isExecutive(c)) return [];
  const y = year(c.date), f = financeOf(c), jan = `${y}-01-01`;
  const builtBefore = new Set(publicProjects(c).filter(p => (p.startDate ?? '') < jan).map(p => p.catalogId));
  const carried = new Set(f.decisions.filter(d => d.year === y - 1 && d.decision === 'postponed').map(d => d.catalogId));
  const catalog = projectCatalog(c).filter(p => !builtBefore.has(p.catalogId));
  const ordered = [...catalog.filter(p => carried.has(p.catalogId)), ...catalog.filter(p => !carried.has(p.catalogId))].slice(0, 3);
  const criticalPick = Math.floor(rand(`${tenureKey(c)}|agenda|${y}`) * Math.max(1, ordered.length));
  return ordered.map((p, i) => {
    const d = f.decisions.find(x => x.year === y && x.catalogId === p.catalogId);
    const built = publicProjects(c).some(x => x.catalogId === p.catalogId);
    const critical = carried.has(p.catalogId) || i === criticalPick;
    return { catalogId: p.catalogId, name: p.name, cost: p.totalCost, critical, carried: carried.has(p.catalogId), decision: d?.decision ?? (built ? 'approved' : 'pending'), canPostpone: !critical };
  });
}
const record = (c: Career, catalogId: string, decision: Finance['decisions'][number]['decision']) => withFinance(c, { ...financeOf(c), decisions: [...financeOf(c).decisions.filter(d => !(d.year === year(c.date) && d.catalogId === catalogId)), { year: year(c.date), catalogId, decision, date: c.date }] });
/** Records a project decision taken through the executive docket so the agenda stays in sync. */
export function noteAgendaDecision(c: Career, catalogId: string, decision: 'approved' | 'rejected'): Career {
  const item = annualAgenda(c).find(i => i.catalogId === catalogId);
  if (!item || item.decision !== 'pending' && item.decision !== decision) return c;
  let n = record(c, catalogId, decision);
  if (decision === 'rejected' && item.critical) n = shiftApproval(n, -2, `Critical ${item.name} rejected.`);
  return n;
}
export function decideAgenda(c: Career, catalogId: string, decision: 'approve' | 'reject' | 'postpone'): Result {
  const item = annualAgenda(c).find(i => i.catalogId === catalogId);
  if (!item || item.decision !== 'pending') return { ok: false, message: 'This project is no longer awaiting a decision.' };
  if (decision === 'approve') {
    const r = approveProject(c, catalogId);
    return r.ok ? { ...r, career: record(r.career, catalogId, 'approved') } : r;
  }
  if (decision === 'postpone') {
    if (!item.canPostpone) return { ok: false, message: 'Critical projects cannot be postponed.' };
    const n = record(c, catalogId, 'postponed');
    return { ok: true, career: n, message: `${item.name} postponed to next fiscal year — it returns as a critical priority.` };
  }
  const hit = item.critical ? -3 : -1;
  let n = record(ensureTreasury(c), catalogId, 'rejected');
  n = shiftApproval(n, hit, `${item.name} rejected${item.critical ? ' despite being critical' : ''}.`, item.critical ? [{ group: 'working', delta: -3 }, { group: 'suburban', delta: -2 }] : []);
  if (item.critical) n = withFinance(n, { ...financeOf(n), economy: { ...financeOf(n).economy, happiness: clamp(financeOf(n).economy.happiness - 4) } });
  return { ok: true, career: n, message: `${item.name} rejected: approval ${hit}${item.critical ? ', citizen happiness −4' : ''}. No treasury money spent.` };
}

/* ---------- History ---------- */
export type QuarterRow = { start: string; end: string; revenue: number; expenditure: number };
/** Quarterly revenue/expenditure rebuilt from the permanent keyed treasury transactions. */
export function quarterHistory(c: Career): QuarterRow[] {
  const t = c.treasury; if (!t) return [];
  const rows = new Map<string, QuarterRow>();
  for (const x of t.transactions) {
    const m = x.key.match(/\|quarter\|(\d{4}-\d{2}-01)\|(\d{4}-\d{2}-01)\|/);
    if (m) { const r = rows.get(m[1]!) ?? { start: m[1]!, end: m[2]!, revenue: 0, expenditure: 0 }; rows.set(m[1]!, r); }
  }
  const list = [...rows.values()].sort((a, b) => a.start.localeCompare(b.start));
  for (const x of t.transactions) {
    if (x.key.endsWith('|opening') || x.key.includes('|loan|')) continue;
    const m = x.key.match(/\|quarter\|(\d{4}-\d{2}-01)\|/);
    const row = m ? rows.get(m[1]!) : list.find(r => x.date >= r.start && x.date < r.end);
    if (!row) continue;
    if (x.amount >= 0) row.revenue += x.amount; else row.expenditure -= x.amount;
  }
  return list.reverse();
}

/* ---------- Quarterly simulation & annual report ---------- */
/** Runs right after treasuryTurn settled [start,end); a persisted watermark prevents replay. */
export function financeTurn(c: Career, start: string, end: string): { career: Career; notices: string[] } {
  if (!isExecutive(c) || c.treasury?.lastProcessedEnd !== end || c.treasury.tenure !== tenureKey(c)) return { career: c, notices: [] };
  const f0 = financeOf(c);
  if (f0.lastEnd >= end) return { career: c, notices: [] };
  const notices: string[] = [];
  let n = c;
  const adj = economicAdjustment(n);
  if (adj) { n = credit(n, Math.max(adj, -(n.treasury?.balance ?? 0)), `quarter|${start}|${end}|economy`, adj > 0 ? 'Revenue above base: strong economy & trade' : 'Revenue shortfall: weak economy & trade'); notices.push(`Economic conditions ${adj > 0 ? 'added' : 'cut'} ${usd(Math.abs(adj))} ${adj > 0 ? 'to' : 'from'} tax receipts.`); }
  let loans = f0.loans.map(l => ({ ...l }));
  for (const l of loans) {
    if (l.lastPaidEnd >= end || (l.remaining <= 0 && l.arrears <= 0) || l.taken >= end) continue;
    const due = (l.remaining > 0 ? l.payment : 0) + l.arrears;
    const paid = Math.min(due, n.treasury?.balance ?? 0);
    n = credit(n, -paid, `quarter|${start}|${end}|debt|${l.id}`, `Debt service · loan from ${l.taken}${paid < due ? ` (missed ${usd(due - paid)})` : ''}`);
    l.arrears = due - paid; if (l.remaining > 0) l.remaining -= 1; l.lastPaidEnd = end;
    if (paid < due) { l.missed += 1; n = shiftApproval(n, -1, 'Government missed a debt payment; credit rating downgraded.'); notices.push(`Missed ${usd(due - paid)} in debt service — lenders will charge more.`); }
    else notices.push(`Debt service paid: ${usd(paid)}.`);
  }
  loans = loans.filter(l => l.remaining > 0 || l.arrears > 0);
  let f: Finance = { ...financeOf(n), loans, lastEnd: end };
  if (!f.yearStart || f.yearStart.year !== year(start)) f = { ...f, yearStart: { year: year(start), economy: f.economy } };
  n = withFinance(n, f);
  const economy = drift(f.economy, economyTarget(n, f.economy));
  f = { ...f, economy };
  n = withFinance(n, f);
  {
    const prev = f.mood ?? { score: 0, unrestQuarters: 0, history: [] };
    const target = happinessTarget(n), score = prev.score + Math.sign(target - prev.score);
    const unrestQuarters = score <= -5 ? prev.unrestQuarters + 1 : 0;
    n = withFinance(n, { ...financeOf(n), mood: { score, unrestQuarters, history: [{ date: end, score }, ...prev.history].slice(0, 12) } });
    const m = mood(score), react = publicReaction(score, unrestQuarters), mom = approvalMomentum(n, score);
    if (mom) n = shiftApproval(n, mom, `Citizen mood ${m.emoji} ${m.label}.`);
    notices.push(`Citizen happiness ${m.emoji} ${score > 0 ? '+' : ''}${score} ${m.label}${score !== prev.score ? (score > prev.score ? ' (improving)' : ' (worsening)') : ''}.`);
    if (react.level !== 'calm') {
      notices.push(react.text);
      if (react.level !== 'criticism') n = { ...n, newsQueue: [...n.newsQueue, { h: react.level === 'unrest' ? `Unrest in ${n.office!.jurisdiction}: crowds demand ${n.character.name} resign` : `Strikes and student marches hit ${n.office!.jurisdiction}`, sub: `Citizen mood ${m.emoji} ${m.label}`, body: react.text, tag: 'government', subject: n.character.name }] };
    }
  }
  if (year(end) > year(start)) {
    const y = year(start);
    const agenda = annualAgenda({ ...n, date: start });
    const ignored = agenda.filter(i => i.decision === 'pending');
    for (const i of ignored) {
      f = { ...financeOf(n), decisions: [...financeOf(n).decisions, { year: y, catalogId: i.catalogId, decision: 'ignored', date: end }] };
      n = withFinance(n, f);
      n = shiftApproval(n, i.critical ? -3 : -1, `${i.name} left without a decision all year.`);
    }
    const rows = quarterHistory(n).filter(r => year(r.start) === y);
    const projects = publicProjects(n);
    const report: AnnualReport = {
      year: y, revenue: rows.reduce((s, r) => s + r.revenue, 0), expenditure: rows.reduce((s, r) => s + r.expenditure, 0),
      planned: currentBudget(n).total, variance: 0, debt: debtTotal(n),
      completed: projects.filter(p => p.completionDate && year(p.completionDate) === y).map(p => p.name),
      unfinished: projects.filter(p => ['approved', 'in_progress', 'paused'].includes(p.status)).map(p => p.name),
      ignored: ignored.map(i => i.name), economyStart: financeOf(n).yearStart?.economy ?? economy, economyEnd: economy,
    };
    report.variance = report.planned * (rows.length / 4) - report.expenditure;
    f = { ...financeOf(n), reports: [report, ...financeOf(n).reports].slice(0, 6), pendingReport: y };
    n = withFinance(n, f);
    notices.push(`Fiscal year ${y} closed — the annual financial report is ready.`);
  }
  return { career: n, notices };
}
export const pendingAnnualReport = (c: Career) => { const f = c.treasury?.finance; return f?.pendingReport != null ? f.reports.find(r => r.year === f.pendingReport) ?? null : null; };
export const dismissAnnualReport = (c: Career): Career => c.treasury?.finance ? { ...c, treasury: { ...c.treasury, finance: { ...c.treasury.finance, pendingReport: null } } } : c;
