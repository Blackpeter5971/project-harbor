import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { createBusiness, calculateValuation, liquidateBusiness, liquidationQuote } from '@/lib/game/business';

const base = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Seller' }, () => .5), money: 100000 });
const founded = () => { const r = createBusiness(base(), { sector: 'construction', name: 'Crossia Build', focus: 'Roads', investment: 75000 }); if (!r.ok) throw new Error(r.message); return r.career; };

describe('Company valuation and liquidation', () => {
  it('values cash + 8x average profit + reputation premium', () => {
    const c = founded(), b = { ...c.businesses[0]!, quarterlyHistory: [{ date: '2025-01-01', revenue: 0, expenses: 0, netProfit: 10000, operatingCash: 75000, retainedEarnings: 0, valuation: 0 }] };
    expect(calculateValuation(b)).toBe(75000 + 80000 + b.reputation * 1000);
  });
  it('settles severance first and deposits net proceeds, removing the company', () => {
    const c = founded(), b = c.businesses[0]!, staffed = { ...c, businesses: [{ ...b, employees: [{ id: 'e1', quarterlySalary: 9000 } as never] }] };
    const q = liquidationQuote(staffed.businesses[0]!);
    expect(q.severance).toBe(9000);
    const r = liquidateBusiness(staffed, b.id);
    if (!r.ok) throw new Error(r.message);
    expect(r.career.money).toBe(staffed.money + q.value - 9000);
    expect(r.career.businesses).toHaveLength(0);
    expect(r.career.ledger[0]?.label).toContain('Liquidation proceeds');
  });
  it('new companies start with no products and saves round-trip', () => {
    const c = founded();
    expect(c.businesses[0]!.products ?? []).toHaveLength(0);
    expect(() => parseCareer(JSON.stringify(c))).not.toThrow();
  });
});
