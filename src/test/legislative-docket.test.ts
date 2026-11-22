import { describe, expect, it } from 'vitest';
import { ensureLegislativeDocket } from '@/lib/game/legislation';
import { committees, COMMITTEE_JURISDICTION, projectCommittee, projectVote } from '@/lib/game/committees';
import { resolveLegislativeDocket, type LegislativeRequest } from '@/lib/game/legislative-docket';
import type { Career } from '@/lib/game/career';
import { executive } from './executive-docket.test';

const seat = (id = 'house', date = '2028-04-01') => ensureLegislativeDocket(executive(id, date));
const req = (c: Career, slot: LegislativeRequest['slot'], choice: string): LegislativeRequest => ({ docketId: c.legislature!.docket!.id, revision: c.legislature!.docket!.revision, slot, choice });
const ok = (r: ReturnType<typeof resolveLegislativeDocket>) => { if (!r.ok) throw new Error(r.message); return r.career; };

describe('Standing committees', () => {
  it('has six committees with chairs, full seat splits and one bill category each', () => {
    const cs = committees(seat().legislature!);
    expect(cs.map(c => c.name)).toEqual(['Finance', 'Defense', 'Health', 'Education', 'Judiciary', 'Infrastructure']);
    for (const c of cs) { expect(c.chair).not.toBeNull(); expect(Object.values(c.seats).reduce((a, b) => a + b, 0)).toBe(c.size); }
    expect(COMMITTEE_JURISDICTION.finance).toEqual(['tax']);
  });
});

describe('Quarterly legislative docket', () => {
  it('introduce sends the bill to committee and the card cannot be replayed', () => {
    const c = seat(), billId = c.legislature!.docket!.items[0].billId!;
    const r = req(c, 'priority', 'introduce');
    const n = ok(resolveLegislativeDocket(c, r));
    expect(n.legislature!.bills.find(b => b.id === billId)!.status).toBe('in_committee');
    expect(resolveLegislativeDocket(n, r).ok).toBe(false);
  });
  it('a favorable report schedules the floor vote for next quarter only when the committee has the votes', () => {
    const c = seat(), n = ok(resolveLegislativeDocket(c, req(c, 'priority', 'introduce')));
    const bill = n.legislature!.bills.find(b => b.party === null)!;
    const n2 = ensureLegislativeDocket({ ...n, legislature: { ...n.legislature!, docket: null } });
    const pass = projectCommittee(n2.legislature!, bill, 'Democrat').passes;
    const after = ok(resolveLegislativeDocket(n2, req(n2, 'committee', 'favorable'))).legislature!.bills.find(b => b.id === bill.id)!;
    expect(after.status).toBe(pass ? 'floor_debate' : 'in_committee');
    if (pass) expect(after.floorQuarter).toBe('2028-Q3');
  });
  it('amendments move the bill 40% toward the center and cut cost 15%', () => {
    const c = seat(), n = ok(resolveLegislativeDocket(c, req(c, 'priority', 'introduce')));
    const n2 = ensureLegislativeDocket({ ...n, legislature: { ...n.legislature!, docket: null } });
    const before = n2.legislature!.bills.find(b => b.id === n2.legislature!.docket!.items[1].billId)!;
    const after = ok(resolveLegislativeDocket(n2, req(n2, 'committee', 'amend'))).legislature!.bills.find(b => b.id === before.id)!;
    expect(after.ideology).toBe(Math.round(before.ideology * 0.6));
    expect(after.cost).toBe(Math.round(before.cost * 0.85));
  });
  it('a hearing adds 10 oversight and 2 reputation', () => {
    const c = seat(), n = ok(resolveLegislativeDocket(c, req(c, 'committee', 'hearing')));
    expect(n.legislature!.oversight).toBe(10);
    expect(n.reputation).toBe(Math.min(100, c.reputation + 2));
  });
  it('tabling an opposition bill kills it without votes, otherwise delays it two quarters', () => {
    const c = seat(), d = c.legislature!.docket!;
    const bill = c.legislature!.bills.find(b => b.id === d.items[1].billId)!;
    expect(bill.party).not.toBeNull();
    const pass = projectCommittee(c.legislature!, bill, 'Democrat').passes;
    const after = ok(resolveLegislativeDocket(c, req(c, 'committee', 'table'))).legislature!.bills.find(b => b.id === bill.id)!;
    if (pass) expect(after.stalledUntil).toBe('2028-Q4'); else expect(after.status).toBe('failed');
  });
  it('floor votes follow the projection shown on the card', () => {
    const c = seat('council');
    const L = c.legislature!, own = L.bills.find(b => b.party === null)!;
    const staged = ensureLegislativeDocket({ ...c, legislature: { ...L, docket: null, bills: L.bills.map(b => b.id === own.id ? { ...b, status: 'floor_debate' as const, floorQuarter: '2028-Q2' } : b) } });
    const bill = staged.legislature!.bills.find(b => b.id === own.id)!;
    expect(staged.legislature!.docket!.items[0].actions).toEqual(['floor_vote']);
    const v = projectVote(staged.legislature!, bill, 'council', 'Democrat');
    const after = ok(resolveLegislativeDocket(staged, req(staged, 'priority', 'floor_vote'))).legislature!.bills.find(b => b.id === own.id)!;
    expect(after.status).toBe(v.passes ? 'enacted' : 'failed');
  });
});
