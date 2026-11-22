import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { createBusiness, injectFunds, withdrawDividend, collectBusinesses, distributableProfit, businessAction, type BusinessCreation } from '@/lib/game/business';
import { businessSectors } from '@/lib/game/business-sectors';
import { normalizeBusiness } from '@/lib/game/business-schema';
const rich = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Portfolio Owner' }, () => .5), money: 200000 });
const draft = (name = 'Crossia Market', investment = 75000): BusinessCreation => ({ sector: 'retail', name, focus: 'Neighborhood groceries', investment });
const ok = (r: ReturnType<typeof createBusiness>) => { if (!r.ok) throw new Error(r.message); return r.career; };
const company = (c: Career) => { const b = c.businesses[0]; if (!b) throw new Error('Missing company'); return b; };
describe('Business expansion capital rules', () => {
  it('requires at least $75,000 of personal cash for every company', () => {
    expect(createBusiness({ ...rich(), money: 74999 }, draft()).ok).toBe(false);
    expect(createBusiness(rich(), draft('Too small', 74999)).ok).toBe(false);
    const c = ok(createBusiness({ ...rich(), money: 75000 }, draft()));
    expect(c.money).toBe(0);
    expect(company(c)).toMatchObject({ initialInvestment: 75000, additionalCapital: 0, operatingCash: 75000, account: 75000, retainedEarnings: 0, valuation: 75000 });
    expect(c.ledger[0]?.amount).toBe(-75000);
    expect(company(c).ledger[0]?.amount).toBe(75000);
  });
  it('a second distinct company requires a separate $75,000 and can share a sector', () => {
    const c = ok(createBusiness({ ...rich(), money: 150000 }, draft('First')));
    const n = ok(createBusiness(c, draft('Second')));
    expect(n.money).toBe(0); expect(n.businesses).toHaveLength(2);
    expect(n.businesses[0]?.id).not.toBe(n.businesses[1]?.id);
    expect(createBusiness(n, draft('Third')).ok).toBe(false);
    expect(createBusiness({ ...c, money: 74999 }, draft('Second')).ok).toBe(false);
  });
  it('company names are unique regardless of whitespace and case', () => {
    const c = ok(createBusiness(rich(), draft('Crossia')));
    expect(createBusiness(c, draft(' crossia ')).ok).toBe(false);
  });
  it('initial capital is never immediately distributable', () => {
    const c = ok(createBusiness(rich(), draft()));
    expect(distributableProfit(company(c))).toBe(0);
    expect(withdrawDividend(c, company(c).id, 1).ok).toBe(false);
  });
  it('additional capital does not create profit or allow withdrawal', () => {
    const c = ok(createBusiness(rich(), draft()));
    const n = ok(injectFunds(c, company(c).id, 25000));
    expect(company(n)).toMatchObject({ operatingCash: 100000, initialInvestment: 75000, additionalCapital: 25000, retainedEarnings: 0 });
    expect(withdrawDividend(n, company(c).id, 25000).ok).toBe(false);
  });
  it('only positive earned profits pay dividends while locked capital stays untouched', () => {
    const c = ok(createBusiness(rich(), draft()));
    const b = company(c), earned = { ...c, businesses: [{ ...b, account: 85000, operatingCash: 85000, retainedEarnings: 10000 }] };
    expect(withdrawDividend(earned, b.id, 10001).ok).toBe(false);
    const n = ok(withdrawDividend(earned, b.id, 10000));
    expect(company(n).account).toBe(75000); expect(company(n).retainedEarnings).toBe(0);
    expect(n.money).toBe(earned.money + 10000);
  });
  it('negative cumulative earnings must recover before any dividend', () => {
    const c = ok(createBusiness(rich(), draft())), b = company(c);
    expect(distributableProfit({ ...b, account: 74000, retainedEarnings: -1000 })).toBe(0);
    expect(distributableProfit({ ...b, account: 85000, retainedEarnings: -1000 })).toBe(0);
  });
  it('creation, capital and dividends never touch campaign, treasury or illicit accounts', () => {
    const c = rich(), n = ok(createBusiness(c, draft())), i = ok(injectFunds(n, company(n).id, 1000));
    for (const result of [n, i]) {
      expect(result.campaign).toEqual(c.campaign); expect(result.warChest).toBe(c.warChest);
      expect(result.treasury).toEqual(c.treasury); expect(result.crime).toEqual(c.crime); expect(result.corruption).toEqual(c.corruption);
    }
  });
  it('invalid transfer amounts cannot create money', () => {
    const c = ok(createBusiness(rich(), draft()));
    for (const amount of [Infinity, NaN, -1, 0]) {
      expect(injectFunds(c, company(c).id, amount).ok).toBe(false);
      expect(withdrawDividend(c, company(c).id, amount).ok).toBe(false);
    }
  });
  it('twelve requested sectors provide margins, volatility and startup overhead', () => {
    expect(businessSectors.map(s => s.name)).toEqual(['Media & Publishing', 'Real Estate', 'Construction', 'Technology & Software', 'Transportation & Logistics', 'Restaurant & Hospitality', 'Retail & Supermarket', 'Manufacturing', 'Agriculture & Farming', 'Financial & Consulting', 'Healthcare', 'Entertainment']);
    for (const s of businessSectors) { expect(s.margin).toBeGreaterThan(0); expect(s.volatility).toBeGreaterThan(0); expect(s.overhead).toBeGreaterThan(0); }
  });
  it('quarterly overhead settles once with saved history', () => {
    const c = ok(createBusiness(rich(), draft()));
    const n = collectBusinesses(c, c.date).career, b = normalizeBusiness(company(n));
    expect(b.lastExpenses).toBe(7000);
    expect(b.operatingCash).toBe(75000 + b.lastRevenue - b.lastExpenses);
    expect(b.retainedEarnings).toBe(b.lastRevenue - b.lastExpenses);
    expect(b.quarterlyHistory).toHaveLength(1);
    const saved = parseCareer(JSON.stringify(n)); if (!saved) throw new Error('Invalid save');
    expect(collectBusinesses(saved, c.date).career.businesses).toEqual(saved.businesses);
    const next = collectBusinesses({ ...saved, date: '2026-04-01' }, '2026-04-01').career;
    expect(company(next).lastExpenses).toBe(7000);
    expect(company(next).quarterlyHistory).toHaveLength(2);
  });
  it('saved revisions reject duplicate rendered investment requests', () => {
    const c = rich(), request = { type: 'create' as const, draft: draft(), revision: 0 };
    const n = ok(businessAction(c, request));
    expect(n.businessRevision).toBe(1);
    expect(businessAction(n, request).ok).toBe(false);
  });
});
describe('Business save compatibility', () => {
  const old = { id: 'old', catalogId: 'local-retail', name: 'Old Shop', kind: 'Local Retail Shop', category: 'commerce', founded: '2025-01-01', account: 16000, reputation: 20, ledger: [{ month: '2025-01-01', label: 'Owner capital investment', amount: 15000 }] };
  it('old company arrays preserve original balances, do not demand new capital and assume no withdrawable profit', () => {
    const n = parseCareer(JSON.stringify({ ...rich(), businesses: [old] })); if (!n) throw new Error('Invalid save');
    expect(n.money).toBe(200000);
    expect(company(n)).toMatchObject({ initialInvestment: 15000, operatingCash: 16000, retainedEarnings: 0, sector: 'retail', quarterlyHistory: [] });
    expect(withdrawDividend(n, 'old', 1).ok).toBe(false);
    expect(parseCareer(JSON.stringify(n))?.businesses).toEqual(n.businesses);
  });
  it('a legacy singular company loads into the portfolio array', () => {
    const { businesses, ...c } = rich();
    const n = parseCareer(JSON.stringify({ ...c, business: old }));
    expect(n?.businesses).toHaveLength(1); expect(n?.businesses[0]?.account).toBe(16000);
  });
  it('old saves without any companies still load', () => {
    const { businesses, ...c } = rich();
    expect(parseCareer(JSON.stringify(c))?.businesses).toEqual([]);
  });
});describe('Phase 1 dividend controls and expansion', () => {
  it('blocks dividends with $75,000 capital and no retained profit', () => {
    const c = ok(createBusiness(rich(), draft()));
    expect(distributableProfit(company(c), c)).toBe(0);
    expect(withdrawDividend(c, company(c).id, 1).ok).toBe(false);
  });
  it('withdrawing $5,000 of $10,000 profit moves exactly $5,000 and leaves $5,000', () => {
    const c = ok(createBusiness(rich(), draft())), b = company(c);
    const earned = { ...c, businesses: [{ ...b, account: 85000, operatingCash: 85000, retainedEarnings: 10000 }] };
    const n = ok(withdrawDividend(earned, b.id, 5000));
    expect(n.money).toBe(earned.money + 5000);
    expect(company(n).account).toBe(80000);
    expect(distributableProfit(company(n), n)).toBe(5000);
    expect(n.ledger[0]?.amount).toBe(5000); expect(company(n).ledger[0]?.amount).toBe(-5000);
  });
  it('expansion deducts company cash once and raises next quarter overhead', () => {
    const c = ok(createBusiness(rich(), draft())), b = company(c);
    const n = ok(businessAction(c, { type: 'expansion', id: b.id, expansionId: 'branch', revision: 0 }));
    expect(company(n).account).toBe(50000);
    expect(company(n).expansions).toEqual(['branch']);
    expect(businessAction(n, { type: 'expansion', id: b.id, expansionId: 'branch', revision: 1 }).ok).toBe(false);
    expect(collectBusinesses(n, n.date).career.businesses[0]?.lastExpenses).toBe(8500);
  });
});
