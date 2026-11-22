import { describe, expect, it } from 'vitest';
import { parseCareer, type Career } from '@/lib/game/career';
import { resolveDocket } from '@/lib/game/executive-docket';
import { revenueBase, treasuryFunds } from '@/lib/game/budget';
import { adoptTaxPolicy, fiscalKey, projectTax } from '@/lib/game/fiscal-year';
import { supportGroupsOf } from '@/lib/game/support-groups';
import { executive } from './executive-docket.test';

const q1 = (id = 'governor') => executive(id, '2028-10-01');
const adopt = (c: Career, choice: string) => {
  const d = c.executiveDocket!;
  const r = resolveDocket(c, { docketId: d.id, revision: d.revision, slot: 'policy', choice });
  if (!r.ok) throw new Error(r.message);
  return r.career;
};

describe('Annual budget & taxes', () => {
  it('presents the Annual Executive Budget & Tax Proposal in Slot 2 every Q4 only', () => {
    for (const id of ['mayor', 'governor', 'president']) expect(q1(id).executiveDocket?.items[1]).toMatchObject({ kind: 'budget', title: 'Annual Executive Budget & Tax Proposal' });
    expect(executive('governor', '2029-10-01').executiveDocket?.items[1].kind).toBe('budget');
    for (const date of ['2029-01-01', '2029-04-01', '2029-07-01']) expect(executive('governor', date).executiveDocket?.items[1].kind).not.toBe('budget');
  });
  it('a rejected budget proposal falls back to the balanced compromise', () => {
    const c = q1();
    const r = resolveDocket(c, { docketId: c.executiveDocket!.id, revision: 0, slot: 'policy', choice: 'progressive' });
    if (!r.ok) throw new Error(r.message);
    expect(['raise', 'hold']).toContain(r.career.budget?.taxes);
    expect(r.message).toMatch(/Legislature (approved|rejected)/);
  });

  it('applies the yearly replenishment only once', () => {
    const c = adopt(q1(), 'balanced');
    const credits = c.treasury!.transactions.filter(t => t.key === fiscalKey(c));
    expect(credits).toHaveLength(1);
    expect(adoptTaxPolicy(c, 'progressive').ok).toBe(false);
    expect(resolveDocket(c, { docketId: c.executiveDocket!.id, revision: c.executiveDocket!.revision, slot: 'policy', choice: 'low' }).ok).toBe(false);
  });

  it('never lets the treasury go negative or exceed the budget cap', () => {
    const start = q1();
    const full = { ...start, treasury: { ...start.treasury!, balance: revenueBase(start) - 1 } } as Career;
    const filled = adopt(full, 'progressive');
    expect(treasuryFunds(filled)).toBeLessThanOrEqual(revenueBase(filled));
    const empty = adopt({ ...start, treasury: { ...start.treasury!, balance: 0 } } as Career, 'low');
    expect(treasuryFunds(empty)).toBeGreaterThanOrEqual(0);
  });

  it('orders revenue and bloc reactions by tax burden', () => {
    const c = q1();
    expect(projectTax(c, 'low').revenue).toBeLessThan(projectTax(c, 'balanced').revenue);
    expect(projectTax(c, 'balanced').revenue).toBeLessThan(projectTax(c, 'progressive').revenue);
    const base = supportGroupsOf(c).loyalty;
    const direct = (id: string) => { const r = adoptTaxPolicy(c, id); if (!r.ok) throw new Error(r.message); return r.career; };
    const hi = supportGroupsOf(direct('progressive')).loyalty;
    const lo = supportGroupsOf(direct('low')).loyalty;
    expect(hi['business']).toBeLessThan(base['business']!);
    expect(hi['labor']).toBeGreaterThan(base['labor']!);
    expect(lo['business']).toBeGreaterThan(base['business']!);
    expect(direct('low').budget?.taxes).toBe('cut');
  });

  it('loads older saves without fiscal fields', () => {
    const c = q1();
    const legacy = parseCareer(JSON.stringify({ ...c, budget: null, executiveDocket: undefined }));
    expect(legacy).toBeTruthy();
  });
});
