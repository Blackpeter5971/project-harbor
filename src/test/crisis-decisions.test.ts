import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { parseCareer, type Career } from '@/lib/game/career';
import { crisisResponses, respondToCrisis, officeCrises } from '@/lib/game/crisis-responses';
import { indicators, spendTreasury } from '@/lib/game/budget';
import { crisisCareer } from './crisis-fixture';

describe('Crisis response treasury and immediate trade-offs', () => {
  it.each([['mayor', 400000, 160000], ['governor', 4000000, 1600000], ['president', 40000000, 16000000]])('scales %s intervention/targeted costs to public jurisdiction', (id, high, targeted) => {
    const options = crisisResponses(crisisCareer(id), 'test-crisis');
    expect(options).toHaveLength(4);
    expect(options.find(r => r.id === 'invest')?.cost).toBe(high);
    expect(options.find(r => r.id === 'targeted')?.cost).toBe(targeted);
    expect(options.find(r => r.id === 'delay')?.cost).toBe(0);
    expect(options.find(r => r.id === 'negotiate')).toMatchObject({ cost: 0, actions: 1, capital: 1 });
  });
  it('rejects unaffordable funding without consuming any resource or effects', () => {
    const c = crisisCareer(); if (!c.treasury) throw new Error('Missing treasury');
    const poor = { ...c, treasury: { ...c.treasury, balance: 18000 } };
    const r = crisisResponses(poor, 'test-crisis').find(r => r.id === 'invest');
    expect(r).toMatchObject({ disabled: true, cost: 400000 });
    expect(r?.unavailable).toContain('$400,000 required; $18,000 available');
    expect(respondToCrisis(poor, 'test-crisis', 'invest').ok).toBe(false);
    expect(poor.actions).toBe(75); expect(poor.treasury?.balance).toBe(18000);
    expect(poor.crises[0]?.selectedResponseId).toBeNull(); expect(poor.approval).toEqual(c.approval);
  });
  it('pays once and preserves personal/campaign ledgers, war chest and unrelated state', () => {
    const c = crisisCareer(), r = respondToCrisis(c, 'test-crisis', 'invest'); if (!r.ok) throw new Error(r.message);
    expect(r.career.treasury?.balance).toBe((c.treasury?.balance ?? 0) - 400000);
    expect(r.career.treasury?.transactions.filter(t => t.key.includes('crisis|test-crisis|response'))).toHaveLength(1);
    expect(r.career.city?.spent).toBe(400000);
    expect(r.career.money).toBe(c.money); expect(r.career.ledger).toEqual(c.ledger); expect(r.career.campaign).toEqual(c.campaign); expect(r.career.warChest).toBe(1234);
    expect(r.career.reputation).toBe(c.reputation); expect(r.career.actions).toBe(c.actions); expect(r.career.age).toBe(c.age); expect(r.career.newsQueue.slice(0, -1)).toEqual(c.newsQueue); expect(r.career.newsQueue.at(-1)?.tag).toBe('government'); expect(r.career.elections).toEqual(c.elections);
    const loaded = parseCareer(JSON.stringify(r.career)); if (!loaded) throw new Error('Save failed');
    expect(respondToCrisis(loaded, 'test-crisis', 'invest').ok).toBe(false);
    expect(respondToCrisis(loaded, 'test-crisis', 'targeted').ok).toBe(false);
    expect(loaded.treasury).toEqual(r.career.treasury); expect(loaded.approval).toEqual(r.career.approval);
  });
  it('permanent payment key prevents debit if a selected-response marker is missing', () => {
    const c = crisisCareer(), paid = spendTreasury(c, 400000, 'crisis|test-crisis|response', 'Crisis intervention'); if (!paid.ok) throw new Error(paid.message);
    expect(respondToCrisis(paid.career, 'test-crisis', 'targeted').ok).toBe(false);
    expect(paid.career.treasury?.transactions).toHaveLength(2);
  });
  it.each([['invest', 2, 3, -2, 1, 'stabilizing', 2], ['targeted', 0.5, 1, -1, 2, 'contained', 1], ['delay', -1.5, -2, 1, 4, 'prolonged', 0], ['negotiate', 0.5, 1, -0.5, 3, 'negotiating', 0]] as const)('applies exact immediate %s approval/group/indicator and trajectory effects', (choice, approval, workers, business, duration, trajectory, infrastructure) => {
    const c = crisisCareer(), r = respondToCrisis(c, 'test-crisis', choice); if (!r.ok) throw new Error(r.message);
    expect((r.career.approval?.overall ?? 0) - (c.approval?.overall ?? 0)).toBeCloseTo(approval);
    expect((r.career.approval?.groups['working'] ?? 0) - (c.approval?.groups['working'] ?? 0)).toBeCloseTo(workers);
    expect((r.career.approval?.groups['business'] ?? 0) - (c.approval?.groups['business'] ?? 0)).toBeCloseTo(business);
    expect(indicators(r.career).infrastructure - indicators(c).infrastructure).toBe(infrastructure);
    expect(r.career.crises[0]).toMatchObject({ status: 'active', selectedResponseId: choice, durationRemaining: duration, trajectory, responseDate: c.date });
    expect(r.career.actions).toBe(choice === 'negotiate' ? 60 : 75); expect(r.career.relationships).toBe(choice === 'negotiate' ? 9 : 10);
    expect(r.career.approval?.history[0]?.change).toBe(approval);
  });
  it.each([['health', 'services'], ['worker_strike', 'employment'], ['economic', 'employment'], ['project_failure', 'infrastructure']] as const)('stabilizes the relevant %s indicator only', (type, indicator) => {
    const c = crisisCareer('mayor', type), r = respondToCrisis(c, 'test-crisis', 'invest'); if (!r.ok) throw new Error(r.message);
    const before = indicators(c), after = indicators(r.career);
    for (const key of ['services', 'employment', 'infrastructure'] as const) expect(after[key] - before[key]).toBe(key === indicator ? 2 : 0);
  });
  it('blocks negotiations lacking actions or political relationships', () => {
    for (const c of [{ ...crisisCareer(), actions: 0 }, { ...crisisCareer(), relationships: 0 }]) {
      expect(crisisResponses(c, 'test-crisis').find(r => r.id === 'negotiate')?.disabled).toBe(true);
      expect(respondToCrisis(c, 'test-crisis', 'negotiate').ok).toBe(false);
    }
  });
  it.each(['council', 'stateLeg', 'house', 'senate'])('preserves %s legislative authority instead of allowing executive spending', id => {
    const c = crisisCareer(id), options = crisisResponses(c, 'test-crisis');
    expect(options.map(r => r.id)).toEqual(['delay', 'negotiate']);
    expect(respondToCrisis(c, 'test-crisis', 'invest').ok).toBe(false);
    expect(respondToCrisis(c, 'test-crisis', 'negotiate').ok).toBe(true);
  });
  it('rejects foreign, expired, resolved, future and pending-event choices without touching state', () => {
    const c = crisisCareer(); if (!c.office || !c.crises[0]) throw new Error('Missing fixture');
    const p = c.crises[0];
    for (const n of [{ ...c, office: null }, { ...c, office: { ...c.office, termEnd: c.date } }, { ...c, office: { ...c.office, since: '2029-01-01' } }, { ...c, crises: [{ ...p, tenure: 'other' }] }, { ...c, crises: [{ ...p, status: 'resolved' as const }] }, { ...c, crises: [{ ...p, turnCreated: '2029-01-01' }] }, { ...c, pendingEvent: 'office:storm' }]) expect(respondToCrisis(n, p.id, 'invest').ok).toBe(false);
    expect(respondToCrisis(c, p.id, 'forged').ok).toBe(false); expect(respondToCrisis(c, 'unknown', 'delay').ok).toBe(false);
  });
  it('respects reserved public allocations even when treasury has cash', () => {
    const c = crisisCareer(), n = { ...c, city: { tenure: c.treasury?.tenure ?? '', priority: 'services' as const, year: 2028, spent: 1e9, officials: [], projects: [], publicProjects: [], emergency: null, lastProcessed: '' } };
    expect(crisisResponses(n, 'test-crisis').find(r => r.id === 'invest')?.disabled).toBe(true);
    expect(respondToCrisis(n, 'test-crisis', 'invest').ok).toBe(false);
  });
  it('keeps legacy crises compatible and only attaches response defaults', () => {
    const c = crisisCareer(), raw = JSON.parse(JSON.stringify(c));
    for (const key of ['trajectory', 'responseDate', 'indicatorEffects']) delete raw.crises[0][key];
    const n = parseCareer(JSON.stringify(raw)); if (!n) throw new Error('Legacy save rejected');
    expect(n).toEqual(initializeDocket(c)); expect(officeCrises(n)).toHaveLength(1);
  });
});