import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { PEOPLE, attendSocialEvent, pendingIntroductions, respondToIntroduction, socialEventsTurn } from '@/lib/game/social-events';
import { socialOf } from '@/lib/game/relationships';

const ok = (r: { ok: boolean; career?: Career }) => { expect(r.ok).toBe(true); return r.career!; };
const base = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'S', background: 'Nobody' }), money: 50000, actions: 45 });

describe('party & social events', () => {
  it('attending costs the ticket and an action but adds nobody immediately', () => {
    const c = base();
    const n = ok(attendSocialEvent(c, 'party'));
    expect(n.money).toBe(10000);
    expect(n.actions).toBe(30);
    expect(socialOf(n).contacts.length).toBe(socialOf(c).contacts.length);
    expect(attendSocialEvent(n, 'birthday').ok).toBe(false);
  });
  it('exclusive invitation requires 70 reputation', () => {
    expect(attendSocialEvent({ ...base(), reputation: 10 }, 'exclusive').ok).toBe(false);
  });
  it('introductions resolve after the turn and only join the circle when accepted', () => {
    let n = ok(attendSocialEvent(base(), 'party'));
    for (let i = 0; i < 12 && !pendingIntroductions(n).length; i++) {
      n = socialEventsTurn({ ...n, date: `20${30 + i}-01-01` }).career;
      if (!pendingIntroductions(n).length) n = ok(attendSocialEvent({ ...n, actions: 45 }, 'party'));
    }
    const [intro] = pendingIntroductions(n);
    expect(intro).toBeTruthy();
    expect(intro!.person.age).toBeGreaterThanOrEqual(18);
    const before = socialOf(n).contacts.length;
    const joined = ok(respondToIntroduction(n, intro!.person.id, true));
    expect(socialOf(joined).contacts.length).toBe(before + 1);
    expect(respondToIntroduction(joined, intro!.person.id, true).ok).toBe(false);
  });
  it('the pool has varied, adult, unique people', () => {
    expect(PEOPLE.length).toBeGreaterThanOrEqual(16);
    expect(new Set(PEOPLE.map(p => p.id)).size).toBe(PEOPLE.length);
    expect(PEOPLE.every(p => p.age >= 18)).toBe(true);
  });
});
