import { describe, expect, it } from 'vitest';
import type { Career } from '@/lib/game/career';
import { congressSession, ensureLegislativeDocket, ensureLegislature, npcPresident, presidentialReview, votingChamber } from '@/lib/game/legislation';
import { projectVote, rollCall } from '@/lib/game/committees';
import { resolveLegislativeDocket, type LegislativeRequest } from '@/lib/game/legislative-docket';
import { applyLegislativeFallout, ensureApproval, legislativeFallout, partyLineFallout } from '@/lib/game/approval';
import { supportGroupsOf } from '@/lib/game/support-groups';
import { ensureExecutiveDocket, resolveDocket } from '@/lib/game/executive-docket';
import type { Legislature, LegislativeBill } from '@/lib/game/legislature-schema';
import { executive } from './executive-docket.test';

const ok = (r: ReturnType<typeof resolveLegislativeDocket>) => { if (!r.ok) throw new Error(r.message); return r.career; };
const req = (c: Career, choice: string, vote?: LegislativeRequest['vote']): LegislativeRequest => ({ docketId: c.legislature!.docket!.id, revision: c.legislature!.docket!.revision, slot: 'priority', choice, ...(vote ? { vote } : {}) });
/** Every member agrees with the bill text, so the roll call passes unanimously (minus the player's own choice). */
const consensus = (L: Legislature, ideology: number): Legislature => ({ ...L,
  backbench: L.backbench.map(b => ({ ...b, ideology, discipline: 0 })),
  lawmakers: L.lawmakers.map(l => ({ ...l, ideology, loyalty: 0, relationship: 0 })) });
/** Puts the player's own bill on the floor this quarter with an otherwise-unanimous chamber. */
function staged(id: 'house' | 'senate' | 'council', status: LegislativeBill['status'] = 'floor_debate', date = '2028-04-01'): { c: Career; billId: string } {
  const base = ensureLegislativeDocket(ensureApproval(executive(id, date)));
  const L = base.legislature!, own = L.bills.find(b => b.party === null)!;
  const bills = L.bills.map(b => b.id === own.id ? { ...b, status, ideology: -40, cost: 0, floorQuarter: null } : b);
  const c = ensureLegislativeDocket({ ...base, legislature: { ...consensus(L, -40), bills, docket: null } });
  return { c, billId: own.id };
}
const bill = (c: Career, id: string) => c.legislature!.bills.find(b => b.id === id)!;

describe('Roll call voting', () => {
  it('the projection equals a roll call where the player votes with the rank-and-file', () => {
    const { c, billId } = staged('house');
    const L = c.legislature!, b = bill(c, billId);
    const p = projectVote(L, b, 'house', 'Democrat'), rc = rollCall(L, b, 'house', 'Democrat', 'house', null);
    expect([rc.yes, rc.no, rc.passes]).toEqual([p.yes, p.no, p.passes]);
  });
  it('the player\'s own vote moves the tally by exactly one seat; abstaining counts as present', () => {
    const { c, billId } = staged('house');
    const L = c.legislature!, b = bill(c, billId);
    const yes = rollCall(L, b, 'house', 'Democrat', 'house', 'yes'), no = rollCall(L, b, 'house', 'Democrat', 'house', 'no'), ab = rollCall(L, b, 'house', 'Democrat', 'house', 'abstain');
    expect(yes.yes - no.yes).toBe(1);
    expect(ab.abstain).toBe(1);
    expect(ab.yes + ab.no + ab.abstain).toBe(435);
  });
  it('rank-and-file votes split by region and add up to each party bloc', () => {
    const { c, billId } = staged('house');
    const L = c.legislature!, rc = rollCall(L, bill(c, billId), 'house', 'Democrat');
    for (const bloc of L.backbench.filter(x => x.chamber === 'house')) {
      const rows = rc.regions.filter(r => r.party === bloc.party);
      expect(rows.map(r => r.region)).toEqual(['Northeast', 'South', 'Midwest', 'West']);
      expect(rows.reduce((t, r) => t + r.seats, 0)).toBe(bloc.seats);
    }
  });
  it('non-members cannot vote: a House member watching a Senate roll call casts nothing', () => {
    const { c, billId } = staged('house', 'passed_house');
    expect(votingChamber(c.legislature!, bill(c, billId))).toBe('senate');
    const n = ok(resolveLegislativeDocket(c, req(c, 'floor_vote', 'no')));
    expect(bill(n, billId).rollCalls.at(-1)?.playerVote).toBeNull();
  });
  it('rejects an invalid vote choice', () => {
    const { c } = staged('house');
    expect(resolveLegislativeDocket(c, { ...req(c, 'floor_vote'), vote: 'maybe' as never }).ok).toBe(false);
  });
});

describe('Bicameral progression', () => {
  it('House passage sends the bill to the Senate next quarter, then to the President', () => {
    const { c, billId } = staged('house');
    const n = ok(resolveLegislativeDocket(c, req(c, 'floor_vote', 'yes')));
    expect(bill(n, billId).status).toBe('passed_house');
    expect(bill(n, billId).floorQuarter).toBe('2028-Q3');
    const q3 = ensureLegislativeDocket({ ...n, date: '2028-07-01', legislature: { ...n.legislature!, docket: null } });
    expect(q3.legislature!.docket!.items[0].billId).toBe(billId);
    expect(votingChamber(q3.legislature!, bill(q3, billId))).toBe('senate');
    const done = ok(resolveLegislativeDocket(q3, req(q3, 'floor_vote')));
    expect(bill(done, billId).status).toBe('awaiting_signature');
    expect(bill(done, billId).rollCalls.map(r => r.chamber)).toEqual(['house', 'senate']);
  });
  it('a senator\'s own bill starts in the Senate and moves to the House', () => {
    const { c, billId } = staged('senate');
    expect(votingChamber(c.legislature!, bill(c, billId))).toBe('senate');
    const n = ok(resolveLegislativeDocket(c, req(c, 'floor_vote', 'yes')));
    expect(bill(n, billId).status).toBe('passed_senate');
    expect(votingChamber(n.legislature!, bill(n, billId))).toBe('house');
  });
  it('a single-chamber body enacts on passage', () => {
    const { c, billId } = staged('council');
    expect(bill(ok(resolveLegislativeDocket(c, req(c, 'floor_vote', 'yes'))), billId).status).toBe('enacted');
  });
  it('the sitting President acts on bills at quarter end exactly once', () => {
    const { c, billId } = staged('house', 'awaiting_signature');
    const pres = npcPresident(c.legislature!);
    const friendly = { ...c, legislature: { ...c.legislature!, bills: c.legislature!.bills.map(b => b.id === billId ? { ...b, ideology: pres.ideology, party: pres.party } : b) } };
    const first = presidentialReview(friendly);
    expect(bill(first.career, billId).status).toBe('enacted');
    expect(first.notices).toHaveLength(1);
    expect(presidentialReview(first.career).notices).toHaveLength(0);
  });
  it('a bill Congress passes lands on the President\'s executive docket and signing enacts it', () => {
    let p = ensureLegislature(executive('president'));
    const L = p.legislature!, b = { ...congressSession(p, '2028-01-01').career.legislature!.bills[0]!, status: 'awaiting_signature' as const };
    p = ensureExecutiveDocket({ ...p, executiveDocket: null, legislature: { ...L, bills: [b] } });
    expect(p.executiveDocket!.items[0].reference).toBe(`leg:${b.id}`);
    const r = resolveDocket(p, { docketId: p.executiveDocket!.id, revision: p.executiveDocket!.revision, slot: 'legislature', choice: 'sign' });
    if (!r.ok) throw new Error(r.message);
    expect(bill(r.career, b.id).status).toBe('enacted');
  });
  it('a Congress session runs once per turn', () => {
    const p = ensureLegislature(executive('president'));
    const once = congressSession(p, '2028-04-01');
    expect(once.notices).toHaveLength(1);
    expect(congressSession(once.career, '2028-04-01').career).toBe(once.career);
  });
});

describe('Political fallout', () => {
  it('progressive health reform boosts working class and seniors, provokes business and the establishment', () => {
    const t = legislativeFallout({ title: 'Health', category: 'health', ideology: -40, cost: 2000 }, 2000);
    expect(t.approval).toEqual({ working: 5.6, seniors: 5.6, labor: 4.2, business: -4.2, establishment: -2.8 });
    expect(t.loyalty).toEqual({ labor: 4.2, veterans: 2.8, business: -4.2 });
  });
  it('enacting your bill moves bloc approval and loyalty; voting against it moves them the other way', () => {
    const c = ensureApproval(executive('house'));
    const law = { title: 'Rural Hospital Rescue Act', category: 'health', ideology: -40, cost: 2000 };
    const yes = applyLegislativeFallout(c, law, 2000, 'sponsor', 'test'), no = applyLegislativeFallout(c, law, 2000, 'no', 'test');
    expect(yes.approval!.groups["working"]!).toBeGreaterThan(c.approval!.groups["working"]!);
    expect(yes.approval!.groups["business"]!).toBeLessThan(c.approval!.groups["business"]!);
    expect(supportGroupsOf(yes).loyalty["labor"]).toBeGreaterThan(supportGroupsOf(c).loyalty["labor"]!);
    expect(no.approval!.groups["business"]!).toBeGreaterThan(c.approval!.groups["business"]!);
  });
  it('voting against party leadership costs 5 party standing and 2 party support, and wins independents +2', () => {
    const c = ensureApproval(executive('house'));
    const n = partyLineFallout(c, 'no', 'yes', 'Test Act');
    expect(supportGroupsOf(n).partyStanding).toBe(supportGroupsOf(c).partyStanding - 5);
    expect(n.approval!.party).toBe(c.approval!.party - 2);
    expect(n.approval!.independent).toBe(c.approval!.independent + 2);
    expect(partyLineFallout(c, 'yes', 'yes', 'Test Act')).toBe(c);
  });
  it('a floor NO against a leader whipping YES is recorded as a rebellion with the penalty applied', () => {
    const { c, billId } = staged('house');
    const n = ok(resolveLegislativeDocket(c, req(c, 'floor_vote', 'no')));
    expect(bill(n, billId).rollCalls.at(-1)).toMatchObject({ playerVote: 'no', rebel: true });
    expect(supportGroupsOf(n).partyStanding).toBe(supportGroupsOf(c).partyStanding - 5);
  });
});
