import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { businessAction, collectBusinesses, createBusiness, injectFunds } from '@/lib/game/business';
import { normalizeBusiness } from '@/lib/game/business-schema';
import { quarterlySimulation, corporateTaxRate } from '@/lib/game/business-engine';
import { businessFinance } from '@/lib/game/business-finance';
import { activeManager, trustedManagers } from '@/lib/game/business-workforce';
import { advanceTurn, type Result } from '@/lib/game/gameplay';
import { legalSchema } from '@/lib/game/legal-schema';
const ok = (r: Result): Career => { if (!r.ok) throw new Error(r.message); return r.career; };
const owned = () => ok(createBusiness({ ...createCareer({ ...defaultDraft, name: 'Workforce Owner' }, () => .5), money: 200000 }, { sector: 'retail', name: 'Crossia Market', focus: 'Groceries', investment: 75000 }));
const company = (c: Career) => { const b = c.businesses[0]; if (!b) throw new Error('No company'); return normalizeBusiness(b); };
const hire = (c: Career, count = 1) => ok(businessAction(c, { type: 'hire-staff', id: company(c).id, count, revision: c.businessRevision ?? 0 }));
const products = (c: Career, price = 25) => ok(businessAction(c, { type: 'launch-product', id: company(c).id, draft: { name: 'Fresh Box', tier: 'standard', price }, revision: c.businessRevision ?? 0 }));
const manager = (c: Career, id = 'professional') => ok(businessAction(c, { type: 'manager', id: company(c).id, personId: id, revision: c.businessRevision ?? 0 }));
const reload = (c: Career) => { const n = parseCareer(JSON.stringify(c)); if (!n) throw new Error('Bad save'); return n; };
describe('Workforce and quarterly engine', () => {
  it('hires staff, projects quarterly salary, and debits each salary from company funds only at settlement', () => {
    const c = hire(products(owned()), 2), b = company(c), f = businessFinance(b, c);
    expect(b.employees).toHaveLength(2); expect(f.staffPayroll).toBe(5600); expect(b.account).toBe(71500);
    const n = collectBusinesses(c, c.date).career, settled = company(n);
    expect(settled.ledger.filter(e => e.label.startsWith('Staff payroll')).map(e => e.amount)).toEqual([-2800, -2800]);
    expect(n.money).toBe(c.money); expect(n.ledger).toEqual(c.ledger); expect(n.campaign).toEqual(c.campaign); expect(n.treasury).toEqual(c.treasury); expect(n.corruption).toEqual(c.corruption); expect(n.crime).toEqual(c.crime);
  });
  it('firing reduces projected payroll and capacity without refunding past expenses', () => {
    const c = hire(owned(), 2), b = company(c);
    const n = ok(businessAction(c, { type: 'fire-staff', id: b.id, count: 1, revision: 1 }));
    expect(company(n).employees).toHaveLength(1); expect(businessFinance(company(n), n).staffPayroll).toBe(2800); expect(company(n).account).toBe(75000);
    expect(businessAction(n, { type: 'fire-staff', id: b.id, count: 2, revision: 2 }).ok).toBe(false);
  });
  it('rejects invalid counts, insufficient company payroll cover and stale hiring requests', () => {
    const c = owned(), b = company(c), n = hire(c);
    for (const count of [0, -1, 1.5, Infinity, 1001]) expect(businessAction(c, { type: 'hire-staff', id: b.id, count, revision: 0 }).ok).toBe(false);
    expect(businessAction(n, { type: 'hire-staff', id: b.id, count: 1, revision: 0 }).ok).toBe(false);
    expect(businessAction({ ...c, businesses: [{ ...b, account: 2799 }] }, { type: 'hire-staff', id: b.id, count: 1, revision: 0 }).ok).toBe(false);
  });
  it('appoints a trusted family manager and saves their quality and quarterly salary', () => {
    const c = owned(), family = trustedManagers(c).find(p => p.status === 'family'); if (!family) throw new Error('No family');
    const n = manager(c, family.id), gm = activeManager(reload(n), company(n));
    expect(gm?.source).toBe('contact'); expect(gm?.name).toBe(family.name); expect(gm?.quality).toBe(family.quality); expect(businessFinance(company(n), n).managerPayroll).toBe(3000); expect(n.money).toBe(c.money);
  });
  it('recruits professional executives strictly from company cash and rejects recruitment replay', () => {
    const c = owned(), n = manager(c), b = company(n);
    expect(b.account).toBe(72500); expect(b.generalManager).toMatchObject({ quality: 70, quarterlySalary: 4500, source: 'professional' }); expect(n.money).toBe(c.money);
    expect(businessAction(n, { type: 'manager', id: b.id, personId: 'professional', revision: 1 }).ok).toBe(false);
  });
  it('an active GM removes President and Governor unavailability penalties', () => {
    const c = hire(products(owned())), managed = manager(c);
    for (const id of ['president', 'governor']) {
      const office = { id, title: id, jurisdiction: 'Test', since: c.date, party: 'Independent' as const, elected: c.date, termEnd: '2030-01-01', margin: 1 };
      expect(quarterlySimulation(company(c), { ...c, office }).efficiency).toBe(.5);
      expect(quarterlySimulation(company(managed), { ...managed, office }).efficiency).toBe(quarterlySimulation(company(managed), managed).efficiency);
    }
  });
  it('an active GM removes incarceration penalties and higher quality improves capacity', () => {
    const c = hire(products(owned())), standard = manager(c), senior = manager(c, 'senior-professional');
    const jailed = { ...standard, legal: legalSchema.parse({ prison: { caseId: 'test', since: c.date, quarters: 4, release: '2027-01-01', tier: 'Felony' } }) };
    expect(quarterlySimulation(company(standard), jailed).efficiency).toBe(quarterlySimulation(company(standard), standard).efficiency);
    expect(quarterlySimulation(company(senior), senior).capacity).toBeGreaterThan(quarterlySimulation(company(standard), standard).capacity);
  });
  it('sales are capped by staff capacity and no staff or discontinued products produce no revenue', () => {
    const c = products(owned()); expect(quarterlySimulation(company(c), c).revenue).toBe(0);
    const staffed = hire(c), b = company(staffed), f = quarterlySimulation(b, staffed);
    expect(f.sold).toBeLessThanOrEqual(f.capacity); expect(f.sold).toBeLessThanOrEqual(f.demanded); expect(f.revenue).toBe(f.sold * 25);
    expect(quarterlySimulation({ ...b, products: b.products.map(p => ({ ...p, active: false })) }, staffed).revenue).toBe(0);
  });
  it('reconciles revenue, wages, manufacturing, overhead, profitable local tax and retained cash', () => {
    const c = hire(products(owned()), 2), b = company(c), f = quarterlySimulation(b, c), n = company(collectBusinesses(c, c.date).career);
    expect(f.expenses).toBe(f.payroll + f.production + 7000); expect(f.operatingIncome).toBeCloseTo(f.revenue - f.expenses);
    expect(f.operatingIncome).toBeGreaterThan(0); expect(f.taxes).toBe(Math.round(f.operatingIncome * .0884 * 100) / 100);
    expect(n.account).toBeCloseTo(b.account + f.profit); expect(n.retainedEarnings).toBeCloseTo(b.retainedEarnings + f.profit); expect(n.lastExpenses).toBe(f.expenses + f.taxes);
  });
  it('negative quarters cause cash losses, no tax, distress and reputation penalties', () => {
    const c = owned(), b = company(c), low = { ...c, businesses: [{ ...b, account: 1000, operatingCash: 1000 }] }, n = company(collectBusinesses(low, c.date).career);
    expect(n.account).toBe(-6000); expect(n.retainedEarnings).toBe(-7000); expect(n.lastTaxes).toBe(0); expect(n.financialDistress).toBe(true); expect(n.reputation).toBe(22);
    expect(company(ok(injectFunds({ ...low, businesses: [n] }, n.id, 7000))).financialDistress).toBe(false);
  });
  it('low pricing can lose money despite high customer demand', () => {
    const c = hire(products(owned(), 10), 2), f = quarterlySimulation(company(c), c);
    expect(f.demanded).toBeGreaterThan(0); expect(f.profit).toBeLessThan(0); expect(f.taxes).toBe(0);
  });
  it('market conditions vary by quarter without rerolling the same saved quarter', () => {
    const c = hire(products(owned())), b = company(c);
    expect(quarterlySimulation(b, c)).toEqual(quarterlySimulation(b, reload(c)));
    expect(quarterlySimulation(b, c, '2026-04-01').market).not.toBe(quarterlySimulation(b, c, '2026-01-01').market);
  });
  it('quarter settlement cannot replay after reload, overlapping periods, history trimming or legacy watermarks', () => {
    let c = owned();
    for (const date of ['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01', '2027-01-01']) c = collectBusinesses({ ...c, date }, date).career;
    expect(company(c).quarterlyHistory).toHaveLength(4); expect(company(c).quarterlyHistory[0]?.date).toBe('2026-04-01');
    const saved = reload(c); expect(collectBusinesses(saved, saved.date).career).toEqual(saved);
    expect(collectBusinesses({ ...saved, date: '2027-02-01' }, '2027-02-01').career.businesses).toEqual(saved.businesses);
    const b = company(saved); const { lastProcessedEnd, ...legacy } = b;
    expect(collectBusinesses({ ...saved, businesses: [legacy], date: '2027-02-01' }, '2027-02-01').notices).toEqual([]);
    expect(collectBusinesses(saved, 'bad-date').career).toEqual(saved);
  });
  it('normal and detained three-month turns settle once and preserve company results through reports', () => {
    const c = hire(products(owned())), f = quarterlySimulation(company(c), c), next = advanceTurn(c).career;
    expect(next.date).toBe('2026-04-01'); expect(company(next).account).toBeCloseTo(company(c).account + f.profit); expect(advanceTurn(next).career).toEqual(next);
    const m = manager(c), jailed = { ...m, legal: legalSchema.parse({ prison: { caseId: 'test', since: c.date, quarters: 4, release: '2027-01-01', tier: 'Felony' } }) }, p = quarterlySimulation(company(m), jailed), after = advanceTurn(jailed).career;
    expect(company(after).account).toBeCloseTo(company(m).account + p.profit); expect(after.money).toBe(jailed.money); expect(company(after).lastProcessedEnd).toBe('2026-04-01');
  });
  it('legacy workforce fields load safely without inventing staff or salaries', () => {
    const c = owned(), { employees, generalManager, ...old } = company(c), n = reload({ ...c, businesses: [old] });
    expect(company(n).employees).toEqual([]); expect(company(n).generalManager).toBeNull(); expect(company(n).account).toBe(75000);
  });
  it('local game tax rate follows company jurisdiction and applies only to profits', () => {
    expect(corporateTaxRate('California')).toBe(.0884); expect(corporateTaxRate('Texas')).toBe(0); expect(corporateTaxRate('Alabama')).toBe(.06);
  });
});