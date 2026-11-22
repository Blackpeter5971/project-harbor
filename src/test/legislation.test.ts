import { describe, expect, it } from 'vitest';
import { createCareer as createFreshCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
// Legacy fixtures assume a zero-resource start; background bonuses are covered in character-backgrounds.test.ts.
const createCareer = (d: Parameters<typeof createFreshCareer>[0]) => ({ ...createFreshCareer(d), money: 0, reputation: 0, experience: 0, relationships: 0 });
import { chamber, evaluateSupport, type Result } from '@/lib/game/support';
import { billAction, councilBudget, proposeLaw } from '@/lib/game/legislation';
import { mayorAction, cityCost, cityFunds, cityState, cityTurn } from '@/lib/game/city';
import { baselineSpend, proposeBudget } from '@/lib/game/budget';
import { ensureApproval } from '@/lib/game/approval';
import { advanceTurn } from '@/lib/game/gameplay';
import { resignOffice, publishEdition } from '@/lib/game/campaign';
import { govAction } from '@/lib/game/government';

export const holder = (id = 'council', strong = false): Career => ensureApproval({ ...createCareer({ ...defaultDraft, name: 'Civic Player', party: 'Democrat' }), publicOffice: true, date: '2028-04-01', reputation: strong ? 90 : 0, relationships: strong ? 100 : 0, skills: { communication: 20, leadership: strong ? 100 : 0, knowledge: 20 }, office: { id, title: id === 'mayor' ? 'Mayor' : 'Council Member', jurisdiction: 'Test City', since: '2028-01-01', elected: '2027-11-01', termEnd: '2032-01-01', party: 'Democrat', margin: strong ? 20 : 0 } });
const take = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };
const firstId = (c: Career) => { const id = c.bills[0]?.id; if (!id) throw new Error('Missing measure'); return id; };
const action = (c: Career, a: Parameters<typeof billAction>[2]) => take(billAction(c, firstId(c), a));

describe('Shared legislative support', () => {
  it('uses seat counts, relationships, leadership, party, policy, public approval and opposition', () => {
    const weak = holder(), strong = holder('council', true);
    const a = evaluateSupport(weak, 'services', 'vote'), b = evaluateSupport(strong, 'services', 'vote');
    expect(chamber(weak).seats).toBe(11);
    expect(chamber(weak).needed).toBe(6);
    expect(b.score).toBeGreaterThan(a.score);
    expect(b.outcome).toBe('pass');
    expect(a.outcome).not.toBe('pass');
    expect(evaluateSupport(strong, 'business', 'vote').score).toBeLessThan(b.score);
    expect(b.reasons).toHaveLength(5);
  });
  it('can yield all six outcomes without rerolling the same decision', () => {
    const outcomes = new Set<string>();
    for (let i = 0; i <= 100; i += 5) for (const party of ['Independent', 'Democrat', 'Republican'] as const) for (const policy of ['services', 'business', 'environment', 'safety'] as const) {
      const c = holder();
      if (!c.office || !c.approval) throw new Error('Missing office');
      c.office.party = party; c.relationships = i; c.skills.leadership = i;
      c.approval = { ...c.approval, overall: i, party: i, independent: i };
      const a = evaluateSupport(c, policy, 'test');
      expect(evaluateSupport(c, policy, 'test')).toEqual(a);
      outcomes.add(a.outcome);
    }
    expect([...outcomes].sort()).toEqual(['amend', 'compromise', 'delay', 'fail', 'party opposition', 'pass'].sort());
  });
  it('proposal is not passage, and a weak council proposal can be rejected', () => {
    const weak = holder();
    if (!weak.approval) throw new Error('Missing approval');
    weak.office = weak.office ? { ...weak.office, party: 'Independent' } : null;
    weak.approval = { ...weak.approval, overall: 5, independent: 5 };
    let c = take(proposeLaw(weak));
    expect(c.bills[0]?.stage).toBe('proposed');
    expect(c.money).toBe(weak.money);
    expect(billAction(c, firstId(c), 'vote').ok).toBe(false);
    c = action(c, 'consider'); c = action(c, 'vote');
    expect(c.bills[0]?.stage).toBe('rejected');
    expect(c.bills[0]?.support?.outcome).toBe('fail');
    expect(cityState(c).spent).toBe(0);
  });
  it('passes through all stages with approval, costs actions and enacts only once', () => {
    let c = take(proposeLaw(holder('council', true)));
    c = action(c, 'consider'); expect(c.bills[0]?.stage).toBe('under consideration');
    c = action(c, 'vote'); expect(c.bills[0]?.stage).toBe('awaiting approval');
    expect(cityState(c).spent).toBe(0);
    c = action(c, 'approve'); expect(c.bills[0]?.stage).toBe('passed');
    expect(c.actions).toBe(40);
    expect(cityState(c).spent).toBe(c.bills[0]?.cost);
    expect(billAction(c, firstId(c), 'approve').ok).toBe(false);
    expect(parseCareer(JSON.stringify(c))).toEqual(c);
  });
  it('amendments and compromise reduce scope and record political costs', () => {
    let c = action(take(proposeLaw(holder())), 'consider');
    const cost = c.bills[0]?.cost ?? 0;
    c = action(c, 'amend'); c = action(c, 'compromise');
    expect(c.bills[0]?.revision).toBe(2);
    expect(c.bills[0]?.cost).toBeLessThan(cost);
    expect(c.bills[0]?.boost).toBe(14);
    expect(c.approval?.history[0]?.change).toBe(-1);
  });
  it('council budget votes and mayor proposals use the same lifecycle and reject excess funds', () => {
    expect(take(councilBudget(holder())).bills[0]?.stage).toBe('proposed');
    const mayor = holder('mayor', true), spend = baselineSpend(mayor);
    expect(proposeBudget(mayor, { ...spend, services: 1e12 }, 'hold').ok).toBe(false);
    expect(proposeBudget(mayor, { ...spend, safety: -1 }, 'hold').ok).toBe(false);
    expect(proposeBudget(mayor, { ...spend, safety: NaN }, 'hold').ok).toBe(false);
    let c = take(proposeBudget(mayor, spend, 'hold'));
    expect(c.budget).toBeNull();
    c = action(c, 'consider'); c = action(c, 'vote'); c = action(c, 'approve');
    expect(c.budget?.spending).toEqual(spend);
    expect(c.budget?.revenue).toBeGreaterThanOrEqual(Object.values(spend).reduce((s, v) => s + v, 0));
  });
  it('unelected and expired players cannot govern and resignation closes pending bills', () => {
    const base = createCareer({ ...defaultDraft, name: 'Citizen' });
    expect(proposeLaw(base).ok).toBe(false);
    expect(mayorAction(base, 'project').ok).toBe(false);
    const c = take(proposeLaw(holder()));
    expect(take(resignOffice(c)).bills[0]?.stage).toBe('rejected');
    expect(billAction({ ...c, date: '2032-01-01' }, firstId(c), 'consider').ok).toBe(false);
    expect(advanceTurn({ ...c, date: '2031-10-01' }).career.bills[0]?.stage).toBe('rejected');
  });
  it('old saves get empty legislation and city defaults', () => {
    const old: Record<string, unknown> = { ...holder() };
    delete old['bills']; delete old['city']; delete old['governmentDecisions'];
    const parsed = parseCareer(JSON.stringify(old));
    expect(parsed?.bills).toEqual([]); expect(parsed?.city).toBeNull(); expect(parsed?.governmentDecisions).toEqual([]);
  });
  it('public decisions can fail without granting automatic reputation gains', () => {
    const c = holder('mayor'); const n = take(govAction(c, 'presser'));
    expect(n.reputation).toBe(c.reputation);
    expect(n.governmentDecisions[0]?.support.outcome).not.toBe('pass');
    expect(n.actions).toBe(85);
  });
});

describe('Mayor governing', () => {
  it('confirmation may fail and never charges public or personal money on failure', () => {
    const c = holder('mayor'); const n = take(mayorAction(c, 'appoint', 'City manager'));
    expect(n.city?.officials).toEqual([]); expect(n.city?.spent).toBe(0);
    expect(n.money).toBe(c.money); expect(n.campaign).toEqual(c.campaign);
  });
  it('appointments, priorities and funded projects persist and progress only once', () => {
    let c = holder('mayor', true);
    c = take(mayorAction(c, 'appoint', 'City manager'));
    expect(c.city?.officials[0]?.competence).toBe(85);
    expect(c.city?.spent).toBe(cityCost(c, 'appointment'));
    c = take(mayorAction(c, 'priority', 'environment')); expect(c.city?.priority).toBe('environment');
    c = take(mayorAction(c, 'project'));
    expect(c.city?.projects[0]?.status).toBe('active');
    expect(c.money).toBe(0);
    const first = cityTurn(c, '2028-07-01');
    expect(first.city?.projects[0]?.progress).toBe(43);
    expect(cityTurn(first, '2028-07-01')).toEqual(first);
    const done = cityTurn(cityTurn(first, '2028-10-01'), '2029-01-01');
    expect(done.city?.projects[0]?.status).toBe('completed');
    expect(publishEdition(done, c, c.date, done.date, []).news.length).toBeGreaterThan(0);
  });
  it('projects reject insufficient allocations and budgets cannot erase committed funds', () => {
    const c = holder('mayor', true), state = cityState(c);
    c.city = { ...state, spent: cityFunds(c) };
    expect(mayorAction(c, 'project').ok).toBe(false);
    expect(proposeBudget(c, { ...baselineSpend(c), infrastructure: 0, safety: 0 }, 'hold').ok).toBe(false);
  });
  it('emergency responses spend public funds, stop penalties, and require mayor authority', () => {
    const c = holder('mayor', true), state = cityState(c);
    c.city = { ...state, emergency: { id: c.date, title: 'Water main emergency', cost: cityCost(c, 'emergency'), resolved: false } };
    const neglected = cityTurn(c, '2028-07-01');
    expect(neglected.approval?.history.some(h => h.change === -2)).toBe(true);
    const n = take(mayorAction(c, 'emergency'));
    expect(n.city?.emergency?.resolved).toBe(true);
    expect(n.city?.spent).toBe(cityCost(c, 'emergency'));
    expect(n.approval?.history[0]?.change).toBe(3);
    expect(mayorAction(holder(), 'emergency').ok).toBe(false);
  });
});