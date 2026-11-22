import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { activities, activityGains } from '@/lib/game/gameplay';
import { adultHeirs, dynastyTurn, fertilityCheck, hireManager, partnerAge, passTorch, retireCareer, tryForChild } from '@/lib/game/dynasty';
import { socialOf } from '@/lib/game/relationships';

const base = (sex: 'Male' | 'Female', age = 30): Career => {
  const c = createCareer({ ...defaultDraft, name: 'Ada Stone', sex }, () => 0.5);
  const s = socialOf(c);
  const partner = { id: 'contact-romantic', archetypeId: 'romantic' as const, name: 'Julian Hart', role: 'x', affinity: 80, status: 'close' as const, portrait: '', weddingDate: '2026-01-01', sharedMonthlyExpenses: 0 };
  return { ...c, age, money: 100_000, life: { ...c.life!, social: { ...s, maritalStatus: 'married', partner } } };
};

describe('fertility', () => {
  it('female player must be 22–50', () => {
    expect(fertilityCheck(base('Female', 21), 'contact-romantic').ok).toBe(false);
    expect(fertilityCheck(base('Female', 50), 'contact-romantic').ok).toBe(true);
    expect(fertilityCheck(base('Female', 51), 'contact-romantic').ok).toBe(false);
  });
  it('male player depends on partner age', () => {
    const c = base('Male', 70);
    expect(partnerAge(c, { id: 'contact-romantic' })).toBeGreaterThan(50);
    expect(fertilityCheck(c, 'contact-romantic').ok).toBe(false);
  });
  it('birth adds a dependent and only one attempt per turn', () => {
    const r = tryForChild(base('Female'), 'contact-romantic', 0);
    expect(r.ok && socialOf(r.career).dependents.length).toBe(1);
    if (r.ok) expect(tryForChild(r.career, 'contact-romantic', 0).ok).toBe(false);
  });
});

describe('manager', () => {
  it('boosts activity gains by 40% and expires after 4 quarters', () => {
    const c = base('Male');
    const a = activities[0]!;
    const before = activityGains(c, a);
    const r = hireManager(c, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const k = Object.keys(before)[0] as keyof typeof before;
    expect(activityGains(r.career, a)[k]).toBeCloseTo(Math.floor((before[k] ?? 0) * 1.4 * 10 + 1e-9) / 10, 5);
    let n = r.career;
    for (const d of ['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']) n = dynastyTurn(n, d).career;
    expect(activityGains(n, a)).toEqual(before);
  });
});

describe('succession', () => {
  it('pass torch requires an adult child', () => {
    const c = base('Female');
    expect(passTorch(c, 'x').ok).toBe(false);
    const s = socialOf(c);
    const withKid: Career = { ...c, life: { ...c.life!, social: { ...s, dependents: [{ id: 'k', name: 'Clara Stone', age: 18, supportCost: 600 }] } } };
    expect(adultHeirs(withKid)).toHaveLength(1);
    const r = passTorch(withKid, 'k');
    expect(r.ok && r.career.character.name).toBe('Clara Stone');
    expect(r.ok && r.career.dynasty?.generation).toBe(2);
    expect(retireCareer(c).ok && true).toBe(true);
  });
});
