import { describe, expect, it, vi } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { campaignTurn, stateData, stateProjections, swingStates, targetState, STATE_SWING_CAP, type Campaign } from '@/lib/game/campaign';

vi.mock('@/lib/game/housing', async orig => ({ ...(await orig<typeof import('@/lib/game/housing')>()), collectRent: (career: unknown) => ({ career, notice: null, evicted: false }) }));
vi.mock('@/lib/game/life', async orig => ({ ...(await orig<typeof import('@/lib/game/life')>()), collectLiving: (career: unknown) => ({ career, notices: [] }) }));

const rival = { name: 'Rita Vance', party: 'Republican' as const, bio: 'Senator', policy: 'Lower taxes', trait: 'money' as const, quality: 1, funds: 1e7, raised: 1e7, spent: 0, staff: 10, volunteers: 100, support: 20, momentum: 3, primary: false, out: false };
function presidential(): Career {
  const base = { ...createCareer({ ...defaultDraft, name: 'Alex Morgan', party: 'Democrat' }), date: '2028-07-01', actions: 75 };
  const camp: Campaign = { office: 'president', title: 'President of the United States', jurisdiction: 'United States · Electoral College', party: 'Democrat', electionDate: '2028-11-01', primaryDate: null, startDate: '2028-01-01', phase: 'general', slogan: 's', strategy: 'grassroots', manager: null, funds: 5e7, raised: 5e7, spent: 0, donors: 0, staff: 10, volunteers: 100, support: 20, momentum: 3, opponents: [rival], polls: [], txns: [], endorsements: [], headlines: [], attack: null, allegation: null, turnActs: [], lastProcessedEnd: '2028-07-01' };
  return { ...base, campaign: camp };
}

describe('electoral college', () => {
  it('has 538 electoral votes', () => {
    expect(Object.values(stateData).reduce((a, [ev]) => a + ev, 0)).toBe(538);
  });
  it('lists Pennsylvania, Michigan and Georgia as battlegrounds but not California', () => {
    expect(swingStates).toEqual(expect.arrayContaining(['Pennsylvania', 'Michigan', 'Georgia', 'Arizona']));
    expect(swingStates).not.toContain('California');
  });
  it('projections split all 538 votes', () => {
    const p = stateProjections(presidential(), presidential().campaign!);
    expect(p.myEv + p.rivalEv).toBe(538);
  });
  it('targeting a swing state raises only that state, spends one action, and caps', () => {
    let c = presidential();
    const before = stateProjections(c, c.campaign!).rows;
    const r = targetState(c, 'Pennsylvania', 'ad');
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.career.actions).toBe(60);
    const after = stateProjections(r.career, r.career.campaign!).rows;
    expect(after.find(x => x.state === 'Pennsylvania')!.margin).toBeGreaterThan(before.find(x => x.state === 'Pennsylvania')!.margin);
    expect(after.find(x => x.state === 'Ohio')!.margin).toBe(before.find(x => x.state === 'Ohio')!.margin);
    c = { ...r.career, actions: 300 };
    for (let i = 0; i < 10; i++) { const n = targetState(c, 'Pennsylvania', 'ad'); if (n.ok) c = n.career; }
    expect(c.campaign!.stateSwing!['Pennsylvania']).toBe(STATE_SWING_CAP);
    expect(targetState(c, 'California', 'rally').ok).toBe(false);
  });
  it('settles the same state calls deterministically and they survive a save reload', () => {
    const c = presidential();
    const a = campaignTurn(c, '2028-10-01', '2029-01-01').career.elections[0]!;
    const b = campaignTurn(c, '2028-10-01', '2029-01-01').career.elections[0]!;
    expect(a.stateCalls).toHaveLength(51);
    expect(a.stateCalls).toEqual(b.stateCalls);
    const winnerEv = Math.max(...a.ec!.map(e => e.ev));
    expect(a.ec!.reduce((s, e) => s + e.ev, 0)).toBe(538);
    expect(a.won).toBe(a.ec![0]!.name === 'Alex Morgan' && winnerEv >= 270 ? true : a.won);
    const reloaded = parseCareer((JSON.stringify(campaignTurn(c, '2028-10-01', '2029-01-01').career)));
    expect(reloaded).not.toBeNull();
    expect(reloaded?.elections[0]?.stateCalls).toEqual(a.stateCalls);
  });
  it('old saves without state data still load', () => {
    const c = presidential();
    const reloaded = parseCareer((JSON.stringify(c)));
    expect(reloaded).not.toBeNull();
    expect(reloaded?.campaign?.stateSwing).toBeUndefined();
  });
});
