import { describe, it, expect } from 'vitest';
import { createCareer, parseCareer, defaultDraft, type Career } from '@/lib/game/career';
import { chooseTransition, transitionOptions } from '@/lib/game/transition';

const base = (): Career => createCareer({ ...defaultDraft, name: 'Alex Doe' });
const result = (won: boolean, mine: number, other: number, office = 'governor') => ({ office, title: 'Governor', jurisdiction: 'Ohio', date: '2026-11-01', stage: 'general' as const, won, rows: [{ name: won ? 'Alex Doe' : 'Rival', party: 'Republican' as const, votes: 1, pct: won ? mine : other, poll: 50 }, { name: won ? 'Rival' : 'Alex Doe', party: 'Democrat' as const, votes: 1, pct: won ? other : mine, poll: 50 }], ec: null, statesWon: [], raised: 0, spent: 0, effects: [] });
const withElection = (r: ReturnType<typeof result>): Career => ({ ...base(), elections: [r] });

describe('post-election transition', () => {
  it('victory speech applies once and is saved', () => {
    const c = withElection(result(true, 55, 45));
    const r = chooseTransition(c, 'technocrat');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.career.experience).toBe(c.experience + 5);
    expect(r.career.contacts).toBe(c.contacts + 2);
    expect(r.career.elections[0]?.transitionChoice).toBe('technocrat');
    expect(chooseTransition(r.career, 'technocrat').ok).toBe(false);
    const reloaded = parseCareer(JSON.stringify(r.career));
    expect(reloaded && transitionOptions(reloaded)).toEqual([]);
  });
  it('non-executive wins get no speech', () => {
    expect(transitionOptions(withElection(result(true, 55, 45, 'council')))).toEqual([]);
  });
  it('narrow loss (under 5%) offers the PAC, wide loss does not', () => {
    expect(transitionOptions(withElection(result(false, 48, 52))).map(o => o.id)).toContain('pac');
    expect(transitionOptions(withElection(result(false, 40, 60)))).toEqual([]);
  });
  it('PAC keeps war chest and adds contacts and reputation', () => {
    const c = { ...withElection(result(false, 48, 52)), warChest: 5000 };
    const r = chooseTransition(c, 'pac');
    expect(r.ok && r.career.warChest).toBe(5000);
    expect(r.ok && r.career.contacts).toBe(c.contacts + 3);
  });
  it('older election records load without a choice', () => {
    const c = withElection(result(true, 55, 45));
    expect(parseCareer(JSON.stringify(c))?.elections[0]?.transitionChoice).toBeUndefined();
  });
});
