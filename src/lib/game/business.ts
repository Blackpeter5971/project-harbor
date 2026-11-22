import { jobs, type Result } from './gameplay';
import type { Career } from './career';
import type { Business, BusinessCategory } from './business-schema';
import { employmentPay } from './employment';
import { normalizeBusiness, changeBusinessCash } from './business-schema';
import { MIN_BUSINESS_INVESTMENT, businessSectors, sectorById, type BusinessSector } from './business-sectors';
import { isDetained } from './prison';
import { productAction, type ProductRequest } from './business-products';
import { quarterlySimulation } from './business-engine';
import { expansionById } from './business-expansions';
import { growthAction, ownerStake, type GrowthRequest } from './business-growth';
import { activeManager, staffingEconomics } from './business-workforce';
import { workforceAction, assignBusinessManager as appointManager, type WorkforceRequest } from './business-workforce';
export { activeManager, trustedManagers, assignBusinessManager } from './business-workforce';
export { careerLevel, careerLevels } from './employment';
export { businessSchema, type Business } from './business-schema';

/** Read-only Career & Business overview; never modifies the career. */
export function careerBusinessView(career: Pick<Career, 'job' | 'workMonths' | 'businesses'> & Partial<Pick<Career, 'skills'>>) {
  const job = career.job ? jobs.find(j => j.id === career.job?.id) ?? null : null;
  const pay = employmentPay(career);
  return {
    employed: !!job, title: pay.title, since: career.job?.since ?? null,
    salaryPerMonth: pay.salary, salaryPerTurn: pay.quarterly,
    progression: pay.progression, workMonths: career.workMonths,
    businesses: career.businesses,
  };
}

// ---------- Catalog ----------
export type BusinessType = { id: string; name: string; category: BusinessCategory; description: string; cost: number; revenue: number; expenses: number; reputation: number; asset: string };
/** Quarterly figures at base reputation. Revenue scales with reputation; expenses are fixed. */
export const businessCatalog: BusinessType[] = [
  { id: 'local-retail', name: 'Local Retail Shop', category: 'commerce', description: 'A neighborhood store with steady foot traffic.', cost: 75_000, revenue: 12_000, expenses: 10_000, reputation: 20, asset: 'retail' },
  { id: 'consulting', name: 'Consulting Firm', category: 'commerce', description: 'Advise local companies and organizations.', cost: 75_000, revenue: 22_000, expenses: 17_000, reputation: 25, asset: 'consulting' },
  { id: 'newspaper', name: 'Independent Newspaper', category: 'media', description: 'A printing press and a weekly local paper.', cost: 75_000, revenue: 18_000, expenses: 15_500, reputation: 30, asset: 'newspaper' },
  { id: 'radio', name: 'Local Radio Station', category: 'media', description: 'Talk and music radio across the county.', cost: 75_000, revenue: 32_000, expenses: 27_000, reputation: 30, asset: 'radio' },
  { id: 'regional-media', name: 'Regional Media House', category: 'media', description: 'TV, print and online news across the region.', cost: 150_000, revenue: 60_000, expenses: 50_000, reputation: 35, asset: 'media-house' },
  ...businessSectors.map(s => ({ id: `sector:${s.id}`, name: s.name, category: s.id === 'media' ? 'media' as const : 'commerce' as const, description: s.focus, cost: MIN_BUSINESS_INVESTMENT, revenue: s.revenue, expenses: Math.round(s.revenue * (1 - s.margin)), reputation: 25, asset: s.asset })),
];
export const businessType = (id: string) => businessCatalog.find(b => b.id === id);
export const isMediaCompany = (b: Pick<Business, 'category'>) => b.category === 'media';
/** Hook for later media phases: owned media outlets. */
export const mediaCompanies = (c: Pick<Career, 'businesses'>) => c.businesses.filter(isMediaCompany);

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Shared projection/settlement math; never modifies saves. */
export const quarterlyForecast = (b: Business, c?: Career) => quarterlySimulation(b, c);

const addBizEntry = (b: Business, month: string, label: string, amount: number): Business => ({ ...b, ledger: [{ month, label, amount: amount === 0 ? 0 : amount }, ...b.ledger] });

export type BusinessCreation = { sector: BusinessSector; name: string; focus: string; investment: number };
export function createBusiness(c: Career, draft: BusinessCreation): Result {
  const s = sectorById(draft.sector);
  if (!s) return { ok: false, message: 'Choose a business sector.' };
  const name = draft.name.trim(), focus = draft.focus.trim();
  if (!name || name.length > 48 || !focus || focus.length > 120) return { ok: false, message: 'Enter a company name (up to 48 characters) and a product/service focus (up to 120).' };
  return startBusiness(c, `sector:${s.id}`, { name, focus, investment: draft.investment });
}
export function startBusiness(c: Career, catalogId: string, options?: { name: string; focus: string; investment: number }): Result {
  const t = businessType(catalogId);
  if (!t) return { ok: false, message: 'Unknown business.' };
  const amount = options?.investment ?? Math.max(MIN_BUSINESS_INVESTMENT, t.cost), name = options?.name ?? t.name;
  if (!Number.isFinite(amount) || amount < MIN_BUSINESS_INVESTMENT) return { ok: false, message: 'Each company requires at least $75,000 of personal cash.' };
  if (c.businesses.some(b => b.name.trim().toLowerCase() === name.trim().toLowerCase())) return { ok: false, message: 'You already own a company with that name. Choose a unique name.' };
  if (!Number.isFinite(c.money) || c.money < amount) return { ok: false, message: `You need ${money(amount - c.money)} more in personal cash.` };
  let suffix = c.businesses.length + 1;
  while (c.businesses.some(b => b.id === `${catalogId}-${c.date}-${suffix}`)) suffix++;
  const id = `${catalogId}-${c.date}-${suffix}`;
  let b: Business = normalizeBusiness({ id, catalogId, name, focus: options?.focus ?? t.description, kind: t.name, category: t.category, sector: sectorById(catalogId.replace('sector:', ''))?.id, founded: c.date, account: amount, initialInvestment: amount, additionalCapital: 0, operatingCash: amount, retainedEarnings: 0, valuation: amount, startupPaid: !options, quarterlyHistory: [], reputation: t.reputation, managerId: null, lastProcessed: null, lastRevenue: 0, lastExpenses: 0, ledger: [] });
  b = addBizEntry(b, c.date, 'Owner capital investment', amount);
  return { ok: true, message: `You founded ${name} with ${money(amount)} of your own capital.`, career: { ...c, money: c.money - amount, ledger: [{ month: c.date, label: `Capital invested · ${name}`, amount: -amount }, ...c.ledger], businesses: [...c.businesses, b] } };
}

const updateBiz = (c: Career, id: string, f: (b: Business) => Business): Career => ({ ...c, businesses: c.businesses.map(b => (b.id === id ? f(b) : b)) });

export function injectFunds(c: Career, id: string, amount: number): Result {
  const b = c.businesses.find(x => x.id === id);
  if (!b) return { ok: false, message: 'Business not found.' };
  if (!Number.isFinite(amount) || !(amount > 0)) return { ok: false, message: 'Enter a finite amount above zero.' };
  if (c.money < amount) return { ok: false, message: `You need ${money(amount - c.money)} more in personal cash.` };
  const n = updateBiz(c, id, x => { const b = normalizeBusiness(x); return addBizEntry({ ...b, account: b.account + amount, operatingCash: b.account + amount, financialDistress: b.account + amount < 0, additionalCapital: b.additionalCapital + amount, valuation: b.valuation + amount }, c.date, 'Owner capital injection', amount); });
  return { ok: true, message: `Moved ${money(amount)} from personal cash into ${b.name}.`, career: { ...n, money: c.money - amount, ledger: [{ month: c.date, label: `Capital injected · ${b.name}`, amount: -amount }, ...c.ledger] } };
}

export function withdrawDividend(c: Career, id: string, amount: number): Result {
  const b = c.businesses.find(x => x.id === id);
  if (!b) return { ok: false, message: 'Business not found.' };
  if (!Number.isFinite(amount) || !(amount > 0)) return { ok: false, message: 'Enter a finite amount above zero.' };
  if (distributableProfit(b, c) < amount) return { ok: false, message: `${b.name} has ${money(distributableProfit(b, c))} distributable profit. Invested capital is locked.` };
  // Investors receive their pro-rata share of every distribution; the owner keeps only their stake.
  const share = Math.round(amount * ownerStake(b) * 100) / 100;
  const n = updateBiz(c, id, x => addBizEntry(changeBusinessCash(x, -amount), c.date, share < amount ? `Dividend paid · owner ${money(share)}, investors ${money(amount - share)}` : 'Dividend paid to owner', -amount));
  return { ok: true, message: `Paid a ${money(amount)} dividend from ${b.name}; ${money(share)} to your personal cash.`, career: { ...n, money: c.money + share, ledger: [{ month: c.date, label: `Dividend · ${b.name}`, amount: share }, ...c.ledger] } };
}
/** Protected cash: locked capital, and never less than next quarter's payroll/overhead. */
export function dividendLimits(b: Business, c?: Career) {
  const n = normalizeBusiness(b), locked = n.initialInvestment + n.additionalCapital, buffer = Math.max(0, quarterlySimulation(n, c).expenses);
  const max = Math.max(0, Math.floor(Math.min(n.retainedEarnings, n.account - Math.max(locked, buffer))));
  return { cash: n.account, locked, buffer, max };
}
export function distributableProfit(b: Business, c?: Career) { return dividendLimits(b, c).max; }
export function buyExpansion(c: Career, id: string, expansionId: string): Result {
  const x = c.businesses.find(b => b.id === id), e = expansionById(expansionId);
  if (!x || !e) return { ok: false, message: 'Unknown company or project.' };
  const b = normalizeBusiness(x);
  if (b.expansions.includes(e.id)) return { ok: false, message: `${b.name} already has a ${e.name}.` };
  if (b.account < e.cost) return { ok: false, message: `${b.name} needs ${money(e.cost - b.account)} more operating cash.` };
  // Upfront spending reduces company cash and earnings like any operating expense; locked capital totals stay unchanged.
  const paid = addBizEntry(changeBusinessCash(b, -e.cost), c.date, `Expansion · ${e.name}`, -e.cost);
  const n = { ...paid, expansions: [...b.expansions, e.id], reputation: clamp(paid.reputation + e.reputation) };
  return { ok: true, message: `${b.name} completed the ${e.name} for ${money(e.cost)}. Benefits apply from next quarter.`, career: updateBiz(c, id, () => n) };
}

export const businessOperations = (c: Career, b: Business) => quarterlySimulation(b, c);
function quarterEnd(start: string) {
  if (!/^\d{4}-\d{2}-01$/.test(start)) return null;
  const [year, month] = start.split('-').map(Number);
  if (year === undefined || month === undefined || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month + 2, 1)).toISOString().slice(0, 10);
}
/** GM automation: size the staff to this quarter's sellable demand, hiring only what company cash covers. */
export function gmAutoStaff(b: Business, c: Career, period: string): ReturnType<typeof normalizeBusiness> {
  const n = normalizeBusiness(b);
  if (!n.gmAutomation || !activeManager(c, n)) return n;
  const f = quarterlySimulation(n, c, period), target = f.rows.reduce((s, r) => s + r.cap, 0);
  const perEmployee = Math.max(1, staffingEconomics(n).capacityPerEmployee * f.efficiency), salary = staffingEconomics(n).quarterlySalary;
  const needed = Math.min(1000, Math.ceil(target / perEmployee)), have = n.employees.length;
  if (needed < have) return { ...n, employees: n.employees.slice(0, needed) };
  const affordable = Math.max(0, Math.floor((n.account - f.expenses) / salary));
  const hire = Math.min(needed - have, affordable);
  if (hire <= 0) return n;
  let suffix = 1;
  const additions = Array.from({ length: hire }, () => { while (n.employees.some(e => e.id === `${n.id}-staff-${suffix}`)) suffix++; return { id: `${n.id}-staff-${suffix++}`, hired: period, quarterlySalary: salary }; });
  return { ...n, employees: [...n.employees, ...additions] };
}
/** Existing normal/prison turn hooks settle one complete quarter atomically with an end watermark. */
export function collectBusinesses(c: Career, periodStart: string): { career: Career; notices: string[] } {
  const end = quarterEnd(periodStart);
  if (!end || periodStart !== c.date) return { career: c, notices: [] };
  const notices: string[] = [];
  const businesses = c.businesses.map(b => {
    const normalized = normalizeBusiness(b), priorEnd = normalized.lastProcessedEnd || (b.lastProcessed ? quarterEnd(b.lastProcessed) : null);
    if (periodStart < b.founded || (b.lastProcessed && periodStart <= b.lastProcessed) || (priorEnd && periodStart < priorEnd)) return b;
    const staffed = gmAutoStaff(normalized, c, periodStart);
    const f = quarterlySimulation(staffed, c, periodStart);
    let n = addBizEntry(staffed, periodStart, 'Quarterly product sales', f.revenue);
    for (const employee of staffed.employees) n = addBizEntry(n, periodStart, `Staff payroll · ${employee.id}`, -employee.quarterlySalary);
    if (f.manager) n = addBizEntry(n, periodStart, `GM salary · ${f.manager.name}`, -f.managerPayroll);
    n = addBizEntry(n, periodStart, 'Production / service unit costs', -f.production);
    n = addBizEntry(n, periodStart, 'Sector base overhead', -f.overhead);
    if (f.marketing > 0) n = addBizEntry(n, periodStart, 'Marketing & advertising', -f.marketing);
    if (f.taxes > 0) n = addBizEntry(n, periodStart, 'Local corporate tax', -f.taxes);
    n = changeBusinessCash(n, f.profit);
    const account = n.account, state = normalizeBusiness(n);
    n = { ...state, startupPaid: true, lastProcessed: periodStart, lastProcessedEnd: end, lastRevenue: f.revenue, lastExpenses: f.totalExpenses, lastTaxes: f.taxes, lastUnitsDemanded: f.demanded, lastUnitsSold: f.sold, financialDistress: account < 0, reputation: clamp(n.reputation + (f.profit > 0 ? 1 : -1) + (account < 0 ? -2 : 0) + (f.efficiency < 1 && !f.manager ? -2 : 0)), quarterlyHistory: [...state.quarterlyHistory, { date: periodStart, revenue: f.revenue, expenses: f.totalExpenses, netProfit: f.profit, operatingCash: account, retainedEarnings: state.retainedEarnings, valuation: state.valuation, taxes: f.taxes, payroll: f.payroll, demanded: f.demanded, sold: f.sold }].slice(-4) };
    notices.push(`Business: ${b.name} · ${f.sold.toLocaleString('en-US')} / ${f.demanded.toLocaleString('en-US')} units sold · revenue ${money(f.revenue)} − operating costs ${money(f.expenses)} − tax ${money(f.taxes)} = ${f.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(f.profit))} (cash ${money(account)}).${account < 0 ? ' In Financial Distress / Cash Flow Crisis.' : ''}`);
    return n;
  });
  return { career: notices.length ? { ...c, businesses, businessRevision: (c.businessRevision ?? 0) + 1 } : c, notices };
}
/** Market value: cash + expansion assets + 8× avg quarterly profit + reputation premium − debt. */
export function calculateValuation(x: Business) {
  const b = normalizeBusiness(x), h = b.quarterlyHistory;
  const avg = h.length ? h.reduce((s, q) => s + q.netProfit, 0) / h.length : 0;
  const assets = b.expansions.reduce((s, id) => s + (expansionById(id)?.cost ?? 0) * 0.5, 0);
  return Math.max(0, Math.round(Math.max(0, b.account) + assets + avg * 8 + b.reputation * 1000 - Math.max(0, -b.account)));
}
export function liquidationQuote(x: Business) {
  const b = normalizeBusiness(x), value = calculateValuation(b);
  const severance = Math.round(b.employees.reduce((s, e) => s + e.quarterlySalary, 0) + (b.generalManager?.quarterlySalary ?? 0));
  const net = value - severance, stake = ownerStake(b);
  return { value, severance, net, stake, ownerNet: net > 0 ? Math.round(net * stake) : net };
}
/** Sells the company outright: severance settled first, net proceeds to personal cash, company removed. */
export function liquidateBusiness(c: Career, id: string): Result {
  const b = c.businesses.find(x => x.id === id);
  if (!b) return { ok: false, message: 'Business not found.' };
  const q = liquidationQuote(b);
  if (q.net < 0 && c.money < -q.net) return { ok: false, message: `Severance exceeds the sale price; you need ${money(-q.net - c.money)} more personal cash.` };
  const msg = `Sold ${b.name} for ${money(q.value)}; ${money(q.severance)} severance paid; ${money(q.ownerNet)} net to you${q.stake < 1 ? ` (your ${Math.round(q.stake * 100)}% stake)` : ''}.`;
  return { ok: true, message: msg, career: { ...c, money: c.money + q.ownerNet, businesses: c.businesses.filter(x => x.id !== id), ledger: [{ month: c.date, label: `Liquidation proceeds · ${b.name}`, amount: q.ownerNet }, ...c.ledger], log: [msg, ...c.log].slice(0, 12) } };
}
export type BusinessRequest = ({ type: 'liquidate'; id: string } | { type: 'create'; draft: BusinessCreation } | { type: 'inject'; id: string; amount: number } | { type: 'dividend'; id: string; amount: number } | { type: 'manager'; id: string; personId: string | null } | { type: 'expansion'; id: string; expansionId: string } | ProductRequest | WorkforceRequest | GrowthRequest) & { revision: number };
export function businessAction(c: Career, request: BusinessRequest): Result {
  if (isDetained(c) || c.crime?.arrest?.stage === 'intake') return { ok: false, message: 'Outside business management is unavailable during detention.' };
  if (request.revision !== (c.businessRevision ?? 0)) return { ok: false, message: 'This business request has already been processed or is out of date.' };
  if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter || c.debate) return { ok: false, message: 'Finish the turn first.' };
  const r = request.type === 'liquidate' ? liquidateBusiness(c, request.id) : request.type === 'create' ? createBusiness(c, request.draft) : request.type === 'manager' ? appointManager(c, request.id, request.personId) : request.type === 'inject' ? injectFunds(c, request.id, request.amount) : request.type === 'dividend' ? withdrawDividend(c, request.id, request.amount) : request.type === 'expansion' ? buyExpansion(c, request.id, request.expansionId) : request.type === 'hire-staff' || request.type === 'fire-staff' ? workforceAction(c, request) : request.type === 'open-branch' || request.type === 'marketing' || request.type === 'gm-automation' || request.type === 'pitch-investors' ? growthAction(c, request, calculateValuation) : productAction(c, request);
  return r.ok ? { ...r, career: { ...r.career, businessRevision: (c.businessRevision ?? 0) + 1 } } : r;
}
