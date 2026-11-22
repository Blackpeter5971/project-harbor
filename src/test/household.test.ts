import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { doFamilyAction, householdOf, householdTurn, childStage, heirBonus } from '@/lib/game/household';
import { socialOf } from '@/lib/game/relationships';

const base = (): Career => {
  const c = createCareer({ ...defaultDraft, name: 'Ada Stone', sex: 'Female', background: 'Working-Class Family' }, () => 0.5);
  const s = socialOf(c);
  const partner = { ...s.contacts[0]!, id: 'p1', name: 'Sam Stone', affinity: 70, weddingDate: '2025-04-01', sharedMonthlyExpenses: 0 };
  return { ...c, money: 50_000, life: { ...c.life!, social: { ...s, maritalStatus: 'married', partner, dependents: [{ id: 'k1', name: 'Kid Stone', age: 14, supportCost: 600 }] } } };
};

describe('household', () => {
  it('child stages', () => { expect(childStage(3)).toBe('Early Childhood'); expect(childStage(10)).toBe('School Age'); expect(childStage(15)).toBe('Teen'); expect(childStage(18)).toBe('Adult'); });
  it('vacation charges $3000 + $500 per child to personal ledger', () => {
    const c = base(); const r = doFamilyAction(c, 'vacation');
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(c.money - r.career.money).toBe(3500);
    expect(r.career.ledger[0]!.amount).toBe(-3500);
    expect(doFamilyAction(r.career, 'vacation').ok).toBe(false);
  });
  it('separation then divorce after 2 quarters below 20 affinity', () => {
    let c = base(); const s = socialOf(c);
    c = { ...c, life: { ...c.life!, social: { ...s, partner: { ...s.partner!, affinity: 10 } } } };
    c = householdTurn(c, '2026-01-01').career;
    expect(householdOf(socialOf(c)).separatedSince).toBe('2026-01-01');
    c = householdTurn(c, '2026-04-01').career;
    expect(socialOf(c).maritalStatus).toBe('married');
    c = householdTurn(c, '2026-07-01').career;
    expect(socialOf(c).maritalStatus).toBe('divorced');
  });
  it('quarter processing is idempotent', () => {
    const c = householdTurn(base(), '2026-01-01').career;
    expect(householdTurn(c, '2026-01-01').career).toBe(c);
  });
  it('politics path gives heir reputation bonus', () => {
    let c = base(); const s = socialOf(c);
    c = { ...c, life: { ...c.life!, social: { ...s, dependents: [{ id: 'k1', name: 'Kid', age: 19, supportCost: 600 }] } } };
    const r = doFamilyAction(c, 'career_guidance', 'k1', 'politics'); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(heirBonus(r.career, 'k1').reputation).toBe(5);
  });
});
