import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft } from '@/lib/game/career';
import { advanceTurn } from '@/lib/game/gameplay';
import { actionApprovalDelta, applyActionApproval, approvalView, ensureApproval, initApproval, shiftApproval } from '@/lib/game/approval';
import { govAction, govStats } from '@/lib/game/government';
import { groups } from '@/lib/game/campaign';

const base = () => createCareer({ ...defaultDraft, name: 'Alex Morgan', party: 'Democrat' });
const withOffice = (id = 'mayor', title = 'Mayor', party: 'Democrat' | 'Independent' = 'Democrat') => ({ ...base(), date: '2028-06-01', publicOffice: true, reputation: 50, actions: 75, office: { id, title, jurisdiction: 'Test jurisdiction', since: '2028-01-01', party, elected: '2027-11-01', termEnd: '2032-01-01', margin: 8 } });

describe('Approval and public opinion', () => {
  it('initializes overall, party, independent and all nine group meters on taking office', () => {
    const a = initApproval(withOffice());
    expect(a.overall).toBeGreaterThan(0);
    expect(a.party).toBeGreaterThan(0);
    expect(a.independent).toBeGreaterThan(0);
    expect(Object.keys(a.groups)).toHaveLength(groups.length);
    expect(a.history[0]!.reason).toContain('Took office');
  });

  it('every approval change records a visible reason', () => {
    let c = ensureApproval(withOffice());
    c = shiftApproval(c, 2, 'Popular decision.');
    c = shiftApproval(c, -3, 'Unpopular decision.');
    const h = c.approval!.history;
    expect(h[0]).toMatchObject({ change: -3, reason: 'Unpopular decision.' });
    expect(h[1]).toMatchObject({ change: 2, reason: 'Popular decision.' });
    expect(h.every(x => x.reason.length > 0)).toBe(true);
  });

  it('groups react differently to the same event', () => {
    let c = ensureApproval(withOffice());
    const before = { ...c.approval!.groups };
    c = shiftApproval(c, 0, 'Business tax cut.', [{ group: 'business', delta: 3 }, { group: 'labor', delta: -2 }]);
    const after = c.approval!.groups;
    expect(after['business']!).toBeGreaterThan(before['business']!);
    expect(after['labor']!).toBeLessThan(before['labor']!);
    expect(after['seniors']).toBe(before['seniors']); // unmentioned groups follow the overall delta (0)
  });

  it('government decisions move approval with a cause', () => {
    const c = ensureApproval(withOffice());
    const before = c.approval!.overall;
    const r = govAction(c, 'constituents');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.career.approval!.overall).not.toBe(before);
    expect(r.career.approval?.history[0]?.reason).toContain('Meet constituents');
    expect(govStats(r.career)!.approval).toBe(Math.round(r.career.approval!.overall));
  });

  it('turn processing drifts approval and reports the movement', () => {
    const c = ensureApproval(withOffice());
    const t = advanceTurn(c);
    const line = t.events.find(e => e.startsWith('Approval '));
    const moved = t.career.approval!.overall !== c.approval!.overall;
    // Drift is seeded; if it moved, the report must mention it.
    expect(moved ? line !== undefined : true).toBe(true);
    expect(t.career.approval!.history.length).toBeGreaterThanOrEqual(c.approval!.history.length);
  });

  it('approvalView exposes group meters and causes for the UI', () => {
    const c = shiftApproval(ensureApproval(withOffice('stateLeg', 'State Legislator')), -1, 'Test cause.');
    const v = approvalView(c)!;
    expect(v.groups).toHaveLength(9);
    expect(v.party).not.toBeNull();
    expect(v.history[0]!.reason).toBe('Test cause.');
    expect(approvalView(base())).toBeNull();
  });

  it('independent officeholders have no party support meter', () => {
    const v = approvalView(ensureApproval(withOffice('mayor', 'Mayor', 'Independent')))!;
    expect(v.party).toBeNull();
  });

  it('repeating a routine action in the same turn yields smaller approval gains', () => {
    let c = { ...ensureApproval(withOffice()), actions: 150 };
    const gains: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = govAction(c, 'townhall');
      if (!r.ok) throw new Error(r.message);
      gains.push(Math.round((r.career.approval!.overall - c.approval!.overall) * 10) / 10);
      c = r.career;
    }
    expect(gains).toEqual([0.8, 0.4, 0.2]);
  });

  it('repetition dampening resets on a new turn date', () => {
    let c = applyActionApproval(ensureApproval(withOffice()), 'townhall', 0.8, 'routine', 'x');
    expect(actionApprovalDelta(c, 'townhall', 0.8, 'routine')).toBe(0.4);
    c = { ...c, date: '2028-09-01' };
    expect(actionApprovalDelta(c, 'townhall', 0.8, 'routine')).toBe(0.8);
  });

  it('routine actions are bounded to ±1 and major ones to ±5', () => {
    const c = ensureApproval(withOffice());
    expect(actionApprovalDelta(c, 'a', 4, 'routine')).toBe(1);
    expect(actionApprovalDelta(c, 'a', -4, 'routine')).toBe(-1);
    expect(actionApprovalDelta(c, 'a', 12, 'major')).toBe(5);
    expect(shiftApproval(c, 20, 'Huge').approval!.history[0]!.change).toBe(5);
  });

  it('ordinary actions cannot spike approval more than 3 points in one turn', () => {
    let c = { ...ensureApproval(withOffice()), actions: 300 };
    const start = c.approval!.overall;
    for (const id of ['constituents', 'townhall', 'partyleaders', 'constituents', 'townhall', 'partyleaders', 'constituents', 'townhall', 'constituents', 'townhall']) {
      const r = govAction(c, id);
      if (!r.ok) throw new Error(r.message);
      c = r.career;
    }
    expect(c.approval!.overall - start).toBeLessThanOrEqual(3);
  });

  it('failed decisions never earn approval', () => {
    const c = ensureApproval(withOffice());
    expect(actionApprovalDelta(c, 'order', 2, 'major', true)).toBe(0);
    const n = applyActionApproval(c, 'order', -1, 'major', 'Rejected.', true, [{ group: 'business', delta: 2 }]);
    expect(n.approval!.overall).toBeLessThan(c.approval!.overall);
    expect(n.approval!.groups['business']!).toBeLessThanOrEqual(c.approval!.groups['business']!);
  });

  it('successful routine decisions land in the 0.2–1.0 band', () => {
    let c = { ...ensureApproval(withOffice()), actions: 150 };
    // Reputation-bearing routines scale with the gain: +1 rep -> +0.5, +1.5 rep -> +0.8.
    for (const [id, expected] of [['constituents', 0.5], ['townhall', 0.8]] as const) {
      const before = c.approval!.overall;
      const r = govAction(c, id);
      if (!r.ok) throw new Error(r.message);
      expect(Math.round((r.career.approval!.overall - before) * 10) / 10).toBe(expected);
      c = r.career;
    }
    // A routine with no public-reputation component still moves opinion by the 0.2 floor.
    c = { ...ensureApproval(withOffice('council', 'Council Member')), actions: 150 };
    const before = c.approval!.overall;
    const r = govAction(c, 'negotiate');
    if (!r.ok) throw new Error(r.message);
    expect(Math.round((r.career.approval!.overall - before) * 10) / 10).toBe(0.2);
  });

  it('major achievements and crises scale in the 2–5 band', () => {
    const c = ensureApproval(withOffice());
    // Major decision formula: 1.5 + reputation gain * 0.4 (a +2 rep achievement -> +2.3).
    const win = applyActionApproval(c, 'bill', 1.5 + 2 * 0.4, 'major', 'Sponsor a bill — passed.');
    expect(win.approval!.history[0]!.change).toBe(2.3);
    // A proven scandal is a major negative shift.
    const hit = shiftApproval(c, -3, 'A proven scandal damaged your standing.');
    expect(hit.approval!.history[0]!.change).toBe(-3);
    // Nothing exceeds the major bound, in either direction.
    expect(shiftApproval(c, 9, 'x').approval!.history[0]!.change).toBe(5);
    expect(shiftApproval(c, -9, 'x').approval!.history[0]!.change).toBe(-5);
  });

  it('a failed major decision costs approval and awards no gains', () => {
    // Rock-bottom party support guarantees party opposition regardless of the seeded roll.
    let c = ensureApproval(withOffice('president', 'President'));
    c = { ...c, relationships: 0, skills: { ...c.skills, leadership: 0 }, approval: { ...c.approval!, party: 10 } };
    const before = c.approval!.overall;
    const repBefore = c.reputation;
    const r = govAction(c, 'address');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message).toContain('No gains awarded');
    expect(r.career.approval!.overall).toBeLessThan(before);
    expect(r.career.approval!.history[0]!.reason).toContain('not implemented');
    expect(r.career.reputation).toBe(repBefore);
  });

  it('reputation, approval, funds and polls stay decoupled', () => {
    const c = { ...ensureApproval(withOffice()), money: 5000, campaign: null };
    const r = govAction(c, 'constituents');
    if (!r.ok) throw new Error(r.message);
    // +1 reputation but only +0.5 approval: gains do not mirror 1:1.
    expect(r.career.reputation - c.reputation).toBe(1);
    expect(Math.round((r.career.approval!.overall - c.approval!.overall) * 10) / 10).toBe(0.5);
    expect(r.career.money).toBe(5000);
    expect(r.career.campaign).toBeNull();
  });
});
