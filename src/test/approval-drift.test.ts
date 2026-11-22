import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { doActivity } from '@/lib/game/gameplay';
import { approvalBaseline, approvalDrift, dutyApproval, ensureApproval, holdsOffice } from '@/lib/game/approval';
import { cityTurn } from '@/lib/game/city';
import { govAction } from '@/lib/game/government';

const base = () => createCareer({ ...defaultDraft, name: 'Alex Morgan', party: 'Democrat' });
const officer = (overall: number): Career => {
  const c = ensureApproval({ ...base(), date: '2028-06-01', publicOffice: true, reputation: 50, actions: 75, office: { id: 'mayor', title: 'Mayor', jurisdiction: 'Test', since: '2028-01-01', party: 'Democrat', elected: '2027-11-01', termEnd: '2040-01-01', margin: 8 } } as Career);
  return { ...c, approval: { ...c.approval!, overall, party: overall } };
};
const next = (d: string) => { const [y = 0, m = 0] = d.split('-').map(Number); const nm = m + 3; return `${nm > 12 ? y + 1 : y}-${String(nm > 12 ? nm - 12 : nm).padStart(2, '0')}-01`; };
// Strip economy noise by measuring only the quiet-quarter drift entries.
const driftOnly = (c: Career, start: string) => approvalDrift({ ...c, character: { ...c.character, name: 'Drift Test' } }, start);

describe('Approval drift and office gating', () => {
  it('inactive officeholders drift gradually toward the baseline over multiple quarters', () => {
    let c = officer(80);
    const baseline = approvalBaseline(c);
    const drifts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const start = c.date;
      const n = driftOnly(c, start);
      const quiet = n.approval!.history.filter(h => h.date === start && h.reason.startsWith('A quiet quarter'));
      expect(quiet).toHaveLength(1);
      expect(quiet[0]!.change).toBeLessThan(0);
      expect(Math.abs(quiet[0]!.change)).toBeLessThanOrEqual(1.5);
      drifts.push(quiet[0]!.change);
      c = { ...n, date: next(start) };
    }
    expect(c.approval!.overall).toBeLessThan(80);
    expect(c.approval!.overall).toBeGreaterThan(baseline);
  });

  it('low approval recovers toward the baseline when quiet', () => {
    const c = officer(20);
    const n = driftOnly(c, c.date);
    expect(n.approval!.history.find(h => h.reason.startsWith('A quiet quarter'))!.change).toBeGreaterThan(0);
  });

  it('a significant governing action in the turn suspends baseline drift', () => {
    const c = officer(80);
    const r = govAction(c, 'townhall');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n = driftOnly(r.career, c.date);
    expect(n.approval!.history.some(h => h.reason.startsWith('A quiet quarter'))).toBe(false);
  });

  it('non-officeholders get no drift, duty penalties or crisis penalties', () => {
    const c = officer(70);
    const former: Career = { ...c, office: { ...c.office!, termEnd: '2028-03-01' } };
    expect(holdsOffice(former)).toBe(false);
    expect(approvalDrift(former, former.date)).toBe(former);
    expect(dutyApproval(former, -3, 'Neglected crisis')).toBe(former);
    const citizen = base();
    expect(dutyApproval(citizen, -3, 'Neglected crisis')).toBe(citizen);
    const withCrisis: Career = { ...former, city: { publicProjects: [], tenure: 'x', priority: 'services', spent: 0, year: 2028, officials: [], projects: [], emergency: { id: 'e', title: 'Water main', cost: 1, resolved: false }, lastProcessed: '' } };
    expect(cityTurn(withCrisis, '2028-09-01').approval!.overall).toBe(70);
  });

  it('reputation gains do not mirror into approval, and party drifts separately', () => {
    const c = officer(60);
    const r = doActivity({ ...c, money: 50000 }, 'community', c.politicalActivityRevision, 0); if (!r.ok) throw new Error(r.message); const g = r.career;
    expect(g.reputation).toBeGreaterThan(c.reputation);
    expect(g.approval!.overall).toBe(60);
    const skewed: Career = { ...c, approval: { ...c.approval!, overall: 50, party: 80 } };
    const n = driftOnly(skewed, skewed.date);
    expect(n.approval!.party).toBeLessThan(80);
    expect(n.approval!.party).not.toBe(n.approval!.overall);
    expect(n.reputation).toBe(skewed.reputation);
    expect(n.campaign).toBe(skewed.campaign);
  });
});
