import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureApproval } from '@/lib/game/approval';
import { impeachmentTurn, respondUnrest, mountDefense, impeachmentRisk, impeachmentOf, ACQUITTAL_REPUTATION } from '@/lib/game/impeachment';
import { ballotRestriction } from '@/lib/game/conviction';

const exec = (id: 'mayor' | 'governor' | 'president', approval: number, extra: Partial<Career> = {}): Career => {
  const base = { ...createCareer({ ...defaultDraft, name: 'Alex Morgan', party: 'Democrat' }), date: '2029-01-01', publicOffice: true, reputation: 60, money: 10_000_000,
    office: { id, title: id, jurisdiction: 'California', since: '2028-01-01', party: 'Democrat', elected: '2027-11-01', termEnd: '2032-01-01', margin: 8 } } as Career;
  const c = ensureApproval(base);
  return { ...c, approval: { ...c.approval!, overall: approval, party: approval, independent: approval }, ...extra };
};
const next = (c: Career, date: string) => ({ ...c, date });

describe('public unrest', () => {
  it('breaks out below 30% approval and not at 30%', () => {
    expect(impeachmentOf(impeachmentTurn(exec('governor', 29), '2029-01-01').career).unrest).not.toBeNull();
    expect(impeachmentOf(impeachmentTurn(exec('governor', 30), '2029-01-01').career).unrest).toBeNull();
  });
  it('processes a quarter only once', () => {
    const a = impeachmentTurn(exec('mayor', 25), '2029-01-01').career;
    expect(impeachmentTurn(a, '2029-01-01').career).toBe(a);
  });
  it('responses end protests once per quarter', () => {
    const c = impeachmentTurn(exec('president', 25), '2029-01-01').career;
    const r = respondUnrest(c, 'concessions');
    expect(r.ok).toBe(true);
    if (r.ok) { expect(impeachmentOf(r.career).unrest).toBeNull(); expect(r.career.approval!.overall).toBe(29); expect(r.career.approval!.party).toBe(23); }
    const e = respondUnrest(c, 'enforcement');
    if (e.ok) expect(impeachmentOf(e.career).unrest).toBeNull();
  });
});

describe('impeachment', () => {
  it('starts after 2 consecutive quarters under 20%', () => {
    let c = impeachmentTurn(exec('governor', 15), '2029-01-01').career;
    expect(impeachmentOf(c).proceeding).toBeNull();
    c = impeachmentTurn(next(c, '2029-04-01'), '2029-04-01').career;
    expect(impeachmentOf(c).proceeding?.stage).toBe('investigation');
  });
  it('starts under 25% with a major scandal active', () => {
    const c = exec('mayor', 24, { scandals: [{ id: 's1', title: 'Kickbacks', allegation: 'x', status: 'alleged', severity: 'Severe', phase: 'Active' } as never] });
    expect(impeachmentOf(impeachmentTurn(c, '2029-01-01').career).proceeding).not.toBeNull();
  });
  it('mayor recall convicts by council majority, removes, bars from office', () => {
    let c = exec('mayor', 5);
    c = impeachmentTurn(c, '2029-01-01').career;
    c = impeachmentTurn(next(c, '2029-04-01'), '2029-04-01').career;
    c = impeachmentTurn(next(c, '2029-07-01'), '2029-07-01').career;
    expect(c.office).toBeNull();
    expect(impeachmentOf(c).barred).toBe(true);
    expect(ballotRestriction(c)).toMatch(/barred/);
    expect(c.scandals.some(s => s.id.endsWith('|referral'))).toBe(true);
    expect(parseCareer(JSON.stringify(c))?.impeachment?.barred).toBe(true);
  });
  it('president goes House then Senate needing 2/3', () => {
    let c = exec('president', 18);
    c = impeachmentTurn(c, '2029-01-01').career;
    c = impeachmentTurn(next(c, '2029-04-01'), '2029-04-01').career;
    c = impeachmentTurn(next(c, '2029-07-01'), '2029-07-01').career;
    const p = impeachmentOf(c);
    const house = p.history.find(h => h.text.includes('U.S. House'));
    expect(house).toBeDefined();
    if (p.proceeding?.stage === 'house_vote') {
      expect(p.proceeding.votes[0]!.needed).toBe(218);
      const rep = c.reputation;
      c = impeachmentTurn(next(c, '2029-10-01'), '2029-10-01').career;
      const s = impeachmentOf(c);
      expect(s.history[0]!.text).toMatch(/Convicted|Acquitted/);
      if (c.office) expect(c.reputation).toBe(Math.max(0, rep - ACQUITTAL_REPUTATION));
    }
  });
  it('defense lobbying costs money and an action, once per quarter', () => {
    let c = exec('governor', 10);
    c = impeachmentTurn(c, '2029-01-01').career; c = impeachmentTurn(next(c, '2029-04-01'), '2029-04-01').career;
    const r = mountDefense(c);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.career.money).toBe(c.money - 60_000); expect(mountDefense(r.career).ok).toBe(false); }
  });
  it('risk meter rises as approval falls', () => {
    expect(impeachmentRisk(exec('governor', 15)).risk).toBeGreaterThan(impeachmentRisk(exec('governor', 34)).risk);
  });
});
