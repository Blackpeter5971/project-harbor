import { describe, expect, it } from 'vitest';
import { createCareer as createFreshCareer, defaultDraft, type Career } from '@/lib/game/career';
// Legacy fixtures assume a zero-resource start; background bonuses are covered in character-backgrounds.test.ts.
const createCareer = (d: Parameters<typeof createFreshCareer>[0]) => ({ ...createFreshCareer(d), money: 0, reputation: 0, experience: 0, relationships: 0 });
import { offices, type OfficeId } from '@/lib/game/campaign';
import { doActivity, opportunities } from '@/lib/game/gameplay';
import { govStats } from '@/lib/game/government';

const base = (): Career => createCareer({ ...defaultDraft, name: 'Eligibility Player', party: 'Democrat' });
const priorOffice: NonNullable<Career['office']> = { id: 'mayor', title: 'Mayor', jurisdiction: 'Sacramento', party: 'Democrat', since: '2027-01-01', elected: '2026-11-01', termEnd: '2031-01-01', margin: 5 };
const eligible = (c: Career, id: OfficeId) => offices.find(o => o.id === id)?.reqs(c).every(r => r.met);

describe('Earned progression eligibility', () => {
  const thresholds: { id: OfficeId; experience: number; reputation: number; age?: number; leadership?: number; money?: number; history?: boolean }[] = [
    { id: 'council', experience: 60, reputation: 25, leadership: 20, money: 1000 },
    { id: 'mayor', experience: 90, reputation: 35, leadership: 25 },
    { id: 'stateLeg', experience: 80, reputation: 30 },
    { id: 'house', experience: 120, reputation: 45, age: 25 },
    { id: 'governor', experience: 160, reputation: 55, age: 30, history: true },
    { id: 'senate', experience: 180, reputation: 60, age: 30, history: true },
    { id: 'president', experience: 240, reputation: 70, age: 35, history: true },
  ];
  for (const rule of thresholds) {
    it(`preserves every ${rule.id} threshold and rejects just-below qualifications`, () => {
      const c: Career = { ...base(), experience: rule.experience, reputation: rule.reputation, age: rule.age ?? 22, money: rule.money ?? 0, skills: { communication: 0, knowledge: 0, leadership: rule.leadership ?? 0 }, termHistory: rule.history ? [{ office: priorOffice, ended: '2031-01-01', reason: 'term ended', government: null }] : [] };
      expect(eligible(c, rule.id)).toBe(true);
      expect(eligible({ ...c, experience: rule.experience - 0.1 }, rule.id)).toBe(false);
      expect(eligible({ ...c, reputation: rule.reputation - 0.1 }, rule.id)).toBe(false);
      if (rule.age) expect(eligible({ ...c, age: rule.age - 1 }, rule.id)).toBe(false);
      if (rule.leadership) expect(eligible({ ...c, skills: { ...c.skills, leadership: rule.leadership - 0.1 } }, rule.id)).toBe(false);
      if (rule.money) expect(eligible({ ...c, money: rule.money - 1 }, rule.id)).toBe(false);
      if (rule.history) expect(eligible({ ...c, termHistory: [] }, rule.id)).toBe(false);
      if (rule.id === 'president') expect(eligible({ ...c, termHistory: [{ ...c.termHistory[0], office: { ...priorOffice, id: 'council' }, ended: '2031-01-01', reason: 'term ended', government: null }] }, rule.id)).toBe(false);
    });
  }
  it('does not let repeated paid county actions create an office or shortcut higher-office eligibility', () => {
    let c: Career = { ...base(), position: 'committee', money: 50000, skills: { communication: 0, leadership: 15, knowledge: 0 } };
    for (let i = 0; i < 5; i++) {
      const r = doActivity(c, 'drive', undefined, 0.5);
      if (!r.ok) throw new Error(r.message);
      c = r.career;
    }
    expect(c.reputation).toBe(2.7);
    expect(c.experience).toBe(2.7);
    expect(c.contacts).toBe(1.3);
    expect(offices.filter(o => eligible(c, o.id))).toEqual([]);
    expect(c.office).toBeNull();
    expect(c.publicOffice).toBe(false);
    expect(opportunities(c).find(o => o.id === 'committee')?.reqs.find(r => r.label === '40 experience')?.met).toBe(false);
  });
  it('keeps derived influence and party standing increments modest without changing their formulas', () => {
    const c: Career = { ...base(), experience: 100, relationships: 10, position: 'committee', money: 50000, skills: { leadership: 20, communication: 20, knowledge: 0 }, office: priorOffice };
    const before = govStats(c);
    const r = doActivity(c, 'drive', undefined, 0.5);
    if (!r.ok) throw new Error(r.message);
    const after = govStats(r.career);
    if (!before || !after || before.partySupport === null || after.partySupport === null) throw new Error('Missing governing stats');
    expect(after.influence - before.influence).toBeLessThanOrEqual(1);
    expect(after.partySupport).toBe(before.partySupport);
    expect(r.career.position).toBe('committee');
  });
});