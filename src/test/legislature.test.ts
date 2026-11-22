import { describe, expect, it } from 'vitest';
import { CHAMBER_SEATS, generateSeating, legislatureSchema, isSwing } from '@/lib/game/legislature-schema';
import { ensureLegislativeDocket } from '@/lib/game/legislation';
import { parseCareer } from '@/lib/game/career';
import { executive } from './executive-docket.test';

describe('Legislature model', () => {
  it('uses the specified chamber sizes', () => {
    expect(CHAMBER_SEATS).toEqual({ house: 435, senate: 100, stateLeg: 120, council: 15 });
  });
  it.each(['house', 'senate', 'stateLeg', 'council'] as const)('%s seats add up with a real majority threshold', id => {
    const s = generateSeating(id, 'seed');
    const total = s.composition.Republican + s.composition.Democrat + s.composition.Independent;
    expect(total).toBe(CHAMBER_SEATS[id]);
    expect(s.majorityThreshold).toBe(Math.floor(CHAMBER_SEATS[id] / 2) + 1);
    expect(s.composition[s.governing]).toBeGreaterThan(s.composition[s.opposition]);
  });
  it('generates 14 key lawmakers with leaders, six chairs and bounded stats; backbench fills the rest', () => {
    const L = ensureLegislativeDocket(executive('president')).legislature!;
    expect(L.lawmakers).toHaveLength(14);
    for (const r of ['house_speaker', 'house_majority_leader', 'house_minority_leader', 'senate_president', 'senate_majority_leader', 'senate_minority_leader']) expect(L.lawmakers.filter(l => l.role === r)).toHaveLength(1);
    expect(new Set(L.lawmakers.filter(l => l.role === 'committee_chair').map(l => l.committee))).toEqual(new Set(['finance', 'defense', 'health', 'education', 'judiciary', 'infrastructure']));
    for (const l of L.lawmakers) { expect(Math.abs(l.ideology)).toBeLessThanOrEqual(100); expect(l.loyalty).toBeLessThanOrEqual(100); expect(Math.abs(l.relationship)).toBeLessThanOrEqual(100); }
    for (const s of L.seating) {
      const named = L.lawmakers.filter(l => l.chamber === s.chamber).length;
      expect(L.backbench.filter(b => b.chamber === s.chamber).reduce((t, b) => t + b.seats, 0) + named).toBe(s.seats);
    }
  });
  it.each(['council', 'stateLeg', 'house', 'senate', 'mayor', 'governor', 'president'])('builds a 3-slot quarterly legislative docket for %s', id => {
    const c = ensureLegislativeDocket(executive(id));
    const d = c.legislature!.docket!;
    expect(d.items.map(i => i.slot)).toEqual(['priority', 'committee', 'whip']);
    expect(d.items[0].actions).toEqual(['introduce']);
    expect(d.items[1].actions).toEqual(['favorable', 'amend', 'hearing', 'table']);
    expect(d.items[2].lawmakerIds.length).toBeGreaterThan(0);
    expect(c.legislature!.lawmakers.some(l => isSwing(l) && d.items[2].lawmakerIds.includes(l.id))).toBe(true);
    expect(ensureLegislativeDocket(c)).toBe(c);
    expect(c.money).toBe(executive(id).money);
    expect(legislatureSchema.safeParse(c.legislature).success).toBe(true);
  });
  it('a bill already in progress moves to a floor vote next quarter', () => {
    const c = ensureLegislativeDocket(executive('governor'));
    const L = c.legislature!;
    const moved = { ...c, date: '2028-07-01', legislature: { ...L, bills: L.bills.map(b => b.party === null ? { ...b, status: 'floor_debate' as const, floorQuarter: '2028-Q3' } : b) } };
    expect(ensureLegislativeDocket(moved).legislature!.docket!.items[0].actions).toEqual(['floor_vote']);
  });
  it('older saves without a legislature still load', () => {
    expect(parseCareer(JSON.stringify({ ...executive(), legislature: undefined }))).toBeTruthy();
  });
});
