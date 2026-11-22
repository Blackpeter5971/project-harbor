import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { legalSchema } from '@/lib/game/legal-schema';
import { legalOf, legalTurn, payCourtDebt } from '@/lib/game/legal';

const withDebt = (owed: number, money: number, prison = false): Career => {
  const base = createCareer({ ...defaultDraft, name: 'Ada' }, () => 0);
  return { ...base, date: '2026-01-01', money, legal: legalSchema.parse({ owed, ...(prison ? { prison: { caseId: 'x', since: '2025-10-01', quarters: 8, release: '2028-01-01' } } : {}) }) };
};

describe('Court debt repayment', () => {
  it('quarterly turn pays court debt from available cash', () => {
    const n = legalTurn(withDebt(5000, 2000), '2026-04-01').career;
    expect(legalOf(n).owed).toBe(3000); expect(n.money).toBe(0);
  });
  it('debt reaches zero once cash covers it and never overpays', () => {
    const n = legalTurn(withDebt(5000, 9000), '2026-04-01').career;
    expect(legalOf(n).owed).toBe(0); expect(n.money).toBe(4000);
  });
  it('the same quarter cannot charge twice', () => {
    const once = legalTurn(withDebt(5000, 2000), '2026-04-01').career;
    const twice = legalTurn({ ...once, money: 2000 }, '2026-04-01').career;
    expect(legalOf(twice).owed).toBe(3000);
  });
  it('debt is also paid while in prison', () => {
    const n = legalTurn(withDebt(1000, 1500, true), '2026-04-01').career;
    expect(legalOf(n).owed).toBe(0); expect(n.money).toBe(500);
  });
  it('manual payment pays what cash allows', () => {
    const r = payCourtDebt(withDebt(5000, 1200));
    expect(r.ok && legalOf(r.career).owed).toBe(3800);
    expect(payCourtDebt(withDebt(5000, 0)).ok).toBe(false);
  });
});
