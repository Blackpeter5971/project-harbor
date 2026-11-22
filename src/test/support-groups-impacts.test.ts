import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft } from '@/lib/game/career';
import { applyPolicyLoyalty, recordPledge, supportGroupsOf, supportGroupsTurn, shiftLoyalty, backingScore, BROKEN_PROMISE } from '@/lib/game/support-groups';
import { scores } from '@/lib/game/campaign';

const make = (party = 'Democrat') => createCareer({ ...defaultDraft, name: 'Ada', party, background: 'Self-Made' } as any, () => 0);
const L = (c: any, id: string) => supportGroupsOf(c).loyalty[id]!;

describe('SGPL decision impacts', () => {
  it('pro-business policy pleases business and alienates labor', () => {
    const c = make('Republican');
    const n = applyPolicyLoyalty(c, 'business', 'Tax cut');
    expect(L(n, 'business')).toBe(L(c, 'business') + 4);
    expect(L(n, 'labor')).toBe(L(c, 'labor') - 3);
    expect(L(n, 'veterans')).toBe(L(c, 'veterans'));
  });
  it('broken promise costs extra loyalty and party disagreement lowers standing', () => {
    const c = recordPledge(make('Democrat'), 'labor');
    const n = applyPolicyLoyalty(c, 'business', 'Tax cut');
    expect(L(n, 'labor')).toBe(L(c, 'labor') - 3 - BROKEN_PROMISE);
    expect(supportGroupsOf(n).partyStanding).toBe(supportGroupsOf(c).partyStanding - 4);
    expect(supportGroupsOf(n).pledges).toHaveLength(0);
  });
  it('endorsements raise and opposition lowers the election score', () => {
    const c = make();
    const fans = shiftLoyalty(c, { labor: 30, youth: 30 }, 'x');
    const foes = shiftLoyalty(c, { business: -30, rural: -30 }, 'x');
    expect(backingScore(fans)).toBe(3);
    expect(backingScore(foes)).toBe(-3);
    const camp: any = { office: 'council', phase: 'general', support: 0, volunteers: 0, staff: 0, momentum: 0, endorsements: [], opponents: [], party: 'Democrat', allegation: null };
    expect(scores(fans, camp)['Ada']! - scores(foes, camp)['Ada']!).toBeCloseTo(6, 5);
  });
  it('quarterly drift applies once per quarter', () => {
    const c = shiftLoyalty(make(), { labor: 20 }, 'x');
    const once = supportGroupsTurn(c, '2026-01-01');
    expect(L(once, 'labor')).toBeLessThan(L(c, 'labor'));
    expect(supportGroupsTurn(once, '2026-01-01')).toBe(once);
  });
});
