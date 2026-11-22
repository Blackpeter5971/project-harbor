import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { createCareer as createFreshCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
// Legacy fixtures assume a zero-resource start; background bonuses are covered in character-backgrounds.test.ts.
const createCareer = (d: Parameters<typeof createFreshCareer>[0]) => ({ ...createFreshCareer(d), money: 0, reputation: 0, experience: 0, relationships: 0 });
import { ensureApproval } from '@/lib/game/approval';
import { billAction, proposeLaw, closeTenure } from '@/lib/game/legislation';
import { evaluateSupport, type Result } from '@/lib/game/support';
import { governorAction, stateCost, stateFunds, stateGovernment, stateLegislativeAction, stateMeasure, stateTurn } from '@/lib/game/state-government';
import { baselineSpend, indicators, proposeBudget } from '@/lib/game/budget';
import { advanceTurn as advanceGameTurn } from '@/lib/game/gameplay';
import { resignOffice } from '@/lib/game/campaign';

const holder = (id = 'governor', strong = true): Career => ensureApproval({ ...createCareer({ ...defaultDraft, name: 'State Player', party: 'Democrat' }), date: '2028-04-01', publicOffice: true, reputation: strong ? 90 : 0, relationships: strong ? 100 : 0, skills: { communication: 20, leadership: strong ? 100 : 0, knowledge: 20 }, office: { id, title: id === 'governor' ? 'Governor' : 'State Legislator', jurisdiction: 'California', party: 'Democrat', since: '2028-01-01', elected: '2027-11-01', termEnd: '2032-01-01', margin: strong ? 20 : 0 } });
const take = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };
const act = (c: Career, a: Parameters<typeof billAction>[2]) => { const id = c.bills[0]?.id; if (!id) throw new Error('Missing bill'); return take(billAction(c, id, a)); };

describe('State legislative work', () => {
  it('sponsors bills, works committees and votes without automatically enacting', () => {
    let c = take(proposeLaw(holder('stateLeg'), 'services', 'bill'));
    expect(c.bills[0]?.stage).toBe('proposed');
    expect(stateLegislativeAction(c, 'committee').ok).toBe(false);
    c = act(c, 'consider'); c = take(stateLegislativeAction(c, 'committee'));
    expect(c.bills[0]?.boost).toBe(4); expect(c.skills.knowledge).toBe(22);
    expect(c.bills[0]?.stage).toBe('under consideration');
    c = act(c, 'vote'); expect(c.bills[0]?.stage).toBe('awaiting approval');
    c = act(c, 'approve'); expect(c.bills[0]?.stage).toBe('passed');
    expect(c.stateGovernment?.spent).toBe(stateCost(c, 'bill')); expect(c.city).toBeNull();
  });
  it('coalitions improve shared support without creating votes or passage', () => {
    const c = holder('stateLeg', false), before = evaluateSupport(c, 'services', 'same');
    const n = take(stateLegislativeAction(c, 'coalition'));
    expect(n.stateGovernment?.coalition).toBe(4); expect(n.actions).toBe(85);
    expect(evaluateSupport(n, 'services', 'same').score).toBeGreaterThan(before.score);
    expect(evaluateSupport(n, 'services', 'same').seats).toBe(60); expect(n.bills).toEqual([]);
  });
  it('state legislators review and vote on an affordable executive budget', () => {
    let c = take(stateMeasure(holder('stateLeg'), 'budget'));
    expect(c.budget).toBeNull(); expect(c.bills[0]?.stage).toBe('proposed');
    c = act(act(act(c, 'consider'), 'vote'), 'approve');
    expect(c.budget?.spending).toEqual(baselineSpend(c));
  });
});

describe('Governor bill stages and funding', () => {
  it('veto is only available after chamber consideration and majority approval', () => {
    let c = take(stateMeasure(holder(), 'bill'));
    const id = c.bills[0]?.id ?? '';
    expect(billAction(c, id, 'veto').ok).toBe(false);
    c = act(c, 'consider'); expect(billAction(c, id, 'veto').ok).toBe(false);
    c = act(c, 'vote'); expect(c.bills[0]?.stage).toBe('awaiting approval');
    c = act(c, 'veto'); expect(c.bills[0]?.stage).toBe('rejected');
    expect(c.stateGovernment?.spent ?? 0).toBe(0); expect(c.money).toBe(0);
    expect(c.bills[0]?.history).toHaveLength(4); expect(billAction(c, id, 'approve').ok).toBe(false);
    expect(c.newsQueue.some(s => s.body.includes('Governor vetoed'))).toBe(true);
  });
  it('governor signs only chamber-approved bills, once, using state allocations', () => {
    let c = take(stateMeasure(holder(), 'bill'));
    expect(billAction(c, c.bills[0]?.id ?? '', 'approve').ok).toBe(false);
    c = act(act(act(c, 'consider'), 'vote'), 'approve');
    expect(c.bills[0]?.stage).toBe('passed'); expect(c.stateGovernment?.spent).toBe(stateCost(c, 'bill'));
    expect(billAction(c, c.bills[0]?.id ?? '', 'approve').ok).toBe(false); expect(c.ledger).toEqual([]);
  });
  it('opposition can stop the governor bill before executive approval', () => {
    const weak = holder('governor', false);
    weak.office = weak.office ? { ...weak.office, party: 'Independent' } : null;
    if (!weak.approval) throw new Error('Missing approval');
    weak.approval = { ...weak.approval, overall: 5, independent: 5 };
    const c = act(act(take(stateMeasure(weak, 'bill')), 'consider'), 'vote');
    expect(c.bills[0]?.stage).toBe('rejected'); expect(billAction(c, c.bills[0]?.id ?? '', 'approve').ok).toBe(false);
  });
  it('rejects excessive governor budgets and prevents erasing funded commitments', () => {
    let c = holder(); const b = baselineSpend(c);
    expect(proposeBudget(c, { ...b, services: 1e12 }, 'hold').ok).toBe(false);
    c = take(governorAction(c, 'agency'));
    expect(proposeBudget(c, { ...b, infrastructure: 0, safety: 0 }, 'hold').ok).toBe(false);
    // Exhaust appropriations, not the cash-limited availability helper.
    c.stateGovernment = { ...stateGovernment(c), spent: b.infrastructure + b.safety };
    expect(governorAction(c, 'appoint', 'Health secretary').ok).toBe(false);
    expect(stateMeasure(c, 'bill').ok).toBe(false);
  });
});

describe('State executive administration', () => {
  it('appointments face confirmation and only successes spend public funds', () => {
    const weak = take(governorAction(holder('governor', false), 'appoint', 'Health secretary'));
    expect(weak.stateGovernment?.officials).toEqual([]); expect(weak.stateGovernment?.spent).toBe(0);
    const c = take(governorAction(holder(), 'appoint', 'Health secretary'));
    expect(c.stateGovernment?.officials[0]?.competence).toBe(86); expect(c.stateGovernment?.spent).toBe(stateCost(c, 'appointment'));
    expect(c.money).toBe(0); expect(c.campaign).toBeNull(); expect(parseCareer(JSON.stringify(c))).toEqual(initializeDocket(c));
  });
  it('sets priorities and progresses funded agencies once per quarterly turn', () => {
    let c = take(governorAction(holder(), 'priority', 'environment'));
    expect(c.stateGovernment?.priority).toBe('environment');
    c = take(governorAction(c, 'agency'));
    const first = stateTurn(c, '2028-07-01'); expect(first.stateGovernment?.agencies[0]?.progress).toBe(30);
    expect(stateTurn(first, '2028-07-01')).toEqual(first);
    const done = stateTurn(stateTurn(stateTurn(first, '2028-10-01'), '2029-01-01'), '2029-04-01');
    expect(done.stateGovernment?.agencies[0]?.status).toBe('completed');
    const withoutDisaster = { ...done, stateGovernment: { ...stateGovernment(done), disaster: null } };
    expect(indicators(withoutDisaster).services).toBe(88);
    const advanced = advanceTurn(c).career; expect(advanced.date).toBe('2028-07-01'); expect(advanced.stateGovernment?.agencies[0]?.progress).toBe(30);
    expect(advanceTurn(advanced).career).toEqual(advanced);
  });
  it('disasters penalize neglect and funded responses restore approval without personal charges', () => {
    const c = holder(); c.stateGovernment = { ...stateGovernment(c), disaster: { id: c.date, title: 'Statewide flood disaster', cost: stateCost(c, 'disaster'), resolved: false } };
    expect(stateTurn(c, '2028-07-01').approval?.history.some(h => h.change === -2)).toBe(true);
    const n = take(governorAction(c, 'disaster')); expect(n.stateGovernment?.disaster?.resolved).toBe(true);
    expect(n.stateGovernment?.spent).toBe(stateCost(c, 'disaster')); expect(n.approval?.history[0]?.change).toBe(3);
    expect(n.money).toBe(c.money); expect(governorAction(holder('stateLeg'), 'disaster').ok).toBe(false);
  });
  it('old saves default safely and resignation or term expiry stops state operations', () => {
    const old: Record<string, unknown> = { ...holder() }; delete old['stateGovernment'];
    expect(parseCareer(JSON.stringify(old))?.stateGovernment).toBeNull();
    const c = take(governorAction(holder(), 'agency'));
    expect(take(resignOffice(c)).stateGovernment).toBeNull(); expect(closeTenure(c).stateGovernment).toBeNull();
    expect(advanceTurn({ ...c, date: '2031-10-01' }).career.stateGovernment).toBeNull();
    expect(governorAction({ ...c, actions: 0 }, 'agency').ok).toBe(false);
    expect(governorAction({ ...c, date: '2032-01-01' }, 'agency').ok).toBe(false);
  });
});
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
