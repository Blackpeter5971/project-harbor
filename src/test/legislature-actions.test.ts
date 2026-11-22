import { describe, expect, it } from 'vitest';
import { ensureLegislature } from '@/lib/game/legislation';
import { contestLeadership, leadershipPosts, lobbyLawmaker } from '@/lib/game/legislature-actions';
import { hemicycle } from '@/components/game/chamber-chart';
import { executive } from './executive-docket.test';

const legislator = (id: string, date = '2028-02-01') => ensureLegislature({ ...executive(id, date), actions: 75 });

describe('Seating chart', () => {
  it.each([435, 100, 120, 15])('draws exactly %i seats', n => expect(hemicycle(n).pts).toHaveLength(n));
});

describe('Lobbying key lawmakers', () => {
  it('costs one action and can only be tried once per lawmaker per quarter', () => {
    const c = legislator('house'), id = c.legislature!.lawmakers[0]!.id;
    const r = lobbyLawmaker(c, id, 'compromise');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.career.actions).toBe(60);
    expect(r.career.legislature!.lawmakers[0]!.relationship).toBe(Math.min(100, c.legislature!.lawmakers[0]!.relationship + 15));
    expect(lobbyLawmaker(r.career, id, 'compromise').ok).toBe(false);
  });
  it('requires a +10 relationship before asking for sponsorship', () => {
    const c = legislator('house'), L = c.legislature!;
    const cold = { ...c, legislature: { ...L, lawmakers: L.lawmakers.map(l => ({ ...l, relationship: 0 })) } };
    expect(lobbyLawmaker(cold, L.lawmakers[0]!.id, 'sponsor').ok).toBe(false);
  });
});

describe('Leadership contests', () => {
  it('offers Council Chairman, Speaker and Senate President by seat; executives get none', () => {
    expect(leadershipPosts(legislator('council'))[0]!.title).toBe('Council Chairman');
    expect(leadershipPosts(legislator('house'))[0]!.title).toBe('House Speaker');
    expect(leadershipPosts(legislator('senate'))[0]!.title).toBe('Senate President');
    expect(leadershipPosts(legislator('governor'))).toHaveLength(0);
  });
  it('is only open in Q1 (outside a new tenure) and once per post per year', () => {
    expect(contestLeadership(legislator('house', '2029-07-01'), 'house_speaker').ok).toBe(false);
    const r = contestLeadership(legislator('house', '2029-02-01'), 'house_speaker');
    expect(r.ok).toBe(true);
    if (r.ok && !r.career.legislature!.playerRoles.includes('house_speaker')) expect(contestLeadership(r.career, 'house_speaker').ok).toBe(false);
  });
});
