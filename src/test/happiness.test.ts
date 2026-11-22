import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { ensureTreasury, treasuryTurn } from '@/lib/game/budget';
import { ensureApproval } from '@/lib/game/approval';
import { financeOf, financeTurn } from '@/lib/game/government-finance';
import { mood, approvalMomentum, publicReaction } from '@/lib/game/happiness';
import { impeachmentRisk } from '@/lib/game/impeachment';

const holder = (): Career => ensureTreasury(ensureApproval({ ...createCareer({ ...defaultDraft, name: 'Mood', party: 'Democrat' }), date: '2028-04-01', publicOffice: true, office: { id: 'mayor', title: 'Mayor', jurisdiction: 'Test', since: '2028-01-01', elected: '2027-11-01', termEnd: '2032-01-01', party: 'Democrat', margin: 10 } }));
const withMood = (c: Career, score: number, unrestQuarters = 0): Career => ({ ...c, treasury: { ...c.treasury!, finance: { ...financeOf(c), mood: { score, unrestQuarters, history: [] } } } });

describe('Citizen happiness', () => {
  it('uses the -5..+5 scale', () => {
    expect(mood(3)).toEqual({ emoji: '😁', label: 'Happy' });
    expect(mood(-5)).toEqual({ emoji: '👿', label: 'Extreme Unrest' });
    expect(mood(0).label).toBe('Neutral');
  });
  it('moves at most one step per quarter', () => {
    const c = withMood({ ...holder(), budget: null }, -5);
    const s = treasuryTurn(c, '2028-04-01', '2028-07-01');
    const score = financeOf(financeTurn(s, '2028-04-01', '2028-07-01').career).mood!.score;
    expect(Math.abs(score - -5)).toBeLessThanOrEqual(1);
  });
  it('approval momentum follows the bands', () => {
    const c = holder();
    expect(approvalMomentum(c, 3)).toBe(1);
    expect(approvalMomentum(c, 1)).toBe(0.3);
    expect(approvalMomentum(c, 0)).toBe(0);
    expect(approvalMomentum(c, -2)).toBe(-1);
    expect(approvalMomentum(c, -4)).toBe(-2.5);
    expect(approvalMomentum(c, -5)).toBe(-4);
  });
  it('a scandal blocks positive momentum', () => {
    const c = { ...holder(), scandals: [{ phase: 'Active' }] } as unknown as Career;
    expect(approvalMomentum(c, 4)).toBe(0);
    expect(approvalMomentum(c, -2)).toBe(-1);
  });
  it('reactions escalate and persistent unrest raises removal risk', () => {
    expect(publicReaction(-1, 0).level).toBe('criticism');
    expect(publicReaction(-3, 0).level).toBe('protest');
    expect(publicReaction(-5, 0).level).toBe('unrest');
    const c = holder();
    expect(impeachmentRisk(withMood(c, -5, 2)).risk).toBe(impeachmentRisk(c).risk + 20);
  });
});
