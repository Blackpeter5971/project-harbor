import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it, vi } from 'vitest';
import { createCareer as createFreshCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
// Legacy fixtures assume a zero-resource start; background bonuses are covered in character-backgrounds.test.ts.
const createCareer = (d: Parameters<typeof createFreshCareer>[0]) => ({ ...createFreshCareer(d), money: 0, reputation: 0, experience: 0, relationships: 0 });
import { advanceTurn as advanceGameTurn, continueTurnReport, continueAfterNewspaper, resolveEvent } from '@/lib/game/gameplay';
import { offices, termEndDate, resignOffice, launchCampaign, selfFund } from '@/lib/game/campaign';
import { officeSalaries, payOfficeMonth } from '@/lib/game/office-pay';
// Pay/accounting tests isolate income from personal taxes (covered in taxes.test.ts).
vi.mock('@/lib/game/taxes', async (orig) => ({ ...(await orig<typeof import('@/lib/game/taxes')>()), collectTaxes: (c: unknown) => ({ career: c, notices: [] }) }));

// Salary/campaign accounting checks run rent-free; turn rent is covered in housing.test.ts.
vi.mock('@/lib/game/housing', async orig => ({ ...(await orig<typeof import('@/lib/game/housing')>()), collectRent: (career: unknown) => ({ career, notice: null, evicted: false }) }));
vi.mock('@/lib/game/life', async orig => ({ ...(await orig<typeof import('@/lib/game/life')>()), collectLiving: (career: unknown) => ({ career, notices: [] }) }));


function serving(id = 'council'): Career {
  const definition = offices.find(o => o.id === id);
  if (!definition) throw new Error('Office missing');
  const c = createCareer({ ...defaultDraft, name: 'Salary Player' });
  return { ...c, date: '2028-01-01', publicOffice: true, office: { id, title: definition.title, jurisdiction: definition.jurisdiction(c), since: '2028-01-01', elected: '2027-11-01', termEnd: termEndDate('2028-01-01', definition.id), party: 'Independent', margin: 5 } };
}
function finishTurn(c: Career): Career {
  let n = continueTurnReport(c);
  if (n.newspaperPending) n = continueAfterNewspaper(n);
  if (n.eventEncounter) {
    const choice = n.eventEncounter.choices[0];
    if (!choice) throw new Error('No event choice');
    const r = resolveEvent(n, choice.id);
    if (!r.ok) throw new Error(r.message);
    n = r.career;
  }
  return n;
}
describe('Office salaries and personal finances', () => {
  it.each(offices)('pays $title through its full term once per three-month turn, then stops', o => {
    let c = serving(o.id);
    const termEnd = c.office?.termEnd;
    if (!termEnd) throw new Error('Term missing');
    const months = (Number(termEnd.slice(0, 4)) - 2028) * 12;
    for (let i = 0; i < months / 3; i++) {
      // Pay is under test, not survival: keep an idle officeholder out of unrest/impeachment range.
      if (c.approval) c = { ...c, approval: { ...c.approval, overall: 60 } };
      const old = c;
      c = advanceTurn(c).career;
      expect(c.officePayHistory.length - old.officePayHistory.length).toBe(3);
      expect(c.actions).toBe(100);
      expect(advanceTurn(c).career).toEqual(c);
      c = parseCareer(JSON.stringify(finishTurn(c))) ?? c;
    }
    expect(c.date).toBe(termEnd);
    expect(c.money).toBe(Math.round((officeSalaries[o.id] ?? 0) * months * 100) / 100);
    expect(c.officePayHistory).toHaveLength(months);
    expect(c.ledger.filter(e => e.label.startsWith('Office salary'))).toHaveLength(months);
    expect(c.publicOffice).toBe(false);
    expect(c.office).toBeNull();
    expect(advanceTurn(c).career.money).toBe(c.money);
  });
  it('stops at resignation without erasing the ledger or pay history', () => {
    const paid = finishTurn(advanceTurn(serving()).career);
    const result = resignOffice(paid);
    if (!result.ok) throw new Error(result.message);
    const after = advanceTurn(result.career).career;
    expect(after.money).toBe(9000);
    expect(after.officePayHistory).toEqual(paid.officePayHistory);
    expect(after.ledger).toEqual(paid.ledger);
    expect(after.officePayHistory.every(p => p.month < paid.date)).toBe(true);
  });
  it('pays only served months when term start or end falls inside a turn', () => {
    const c = serving();
    if (!c.office) throw new Error('Office missing');
    const delayed = advanceTurn({ ...c, office: { ...c.office, since: '2028-02-01' } }).career;
    expect(delayed.money).toBe(6000);
    const ending = advanceTurn({ ...c, office: { ...c.office, termEnd: '2028-02-01' } }).career;
    expect(ending.money).toBe(3000);
    expect(ending.officePayHistory.map(p => p.month)).toEqual(['2028-01-01']);
  });
  it('keeps job income and campaign reserves separate from office income', () => {
    const c = { ...serving(), warChest: 10000, job: { id: 'retail', since: '2028-01-01' } };
    const paid = advanceTurn(c).career;
    expect(paid.money).toBe(11550);
    expect(paid.warChest).toBe(10000);
    expect(paid.ledger.filter(e => e.label === 'Salary · Retail Associate')).toHaveLength(3);
    expect(paid.ledger.filter(e => e.label.startsWith('Office salary'))).toHaveLength(3);
    expect(paid.lastPaidMonth).toBe('2028-03-01');
    expect(paid.lastOfficePaidMonth).toBe('2028-03-01');
  });
  it('reloading or retrying a paid month cannot pay it again', () => {
    const paid = payOfficeMonth(serving(), '2028-01-01');
    const loaded = parseCareer(JSON.stringify(paid));
    if (!loaded) throw new Error('Save failed');
    expect(payOfficeMonth(loaded, '2028-01-01')).toEqual(paid);
    const turn = advanceTurn(loaded).career;
    expect(turn.money).toBe(9000);
    expect(turn.officePayHistory).toHaveLength(3);
  });
  it('upgrades old saves without adding retroactive income or losing personal transactions', () => {
    const { officePayHistory, lastOfficePaidMonth, ...legacy } = serving();
    const loaded = parseCareer(JSON.stringify({ ...legacy, ledger: [{ month: '2027-12-01', label: 'Old transaction', amount: -100 }] }));
    expect(loaded?.officePayHistory).toEqual([]);
    expect(loaded?.lastOfficePaidMonth).toBeNull();
    expect(loaded?.money).toBe(0);
    expect(loaded?.ledger[0]?.label).toBe('Old transaction');
    expect(officePayHistory).toEqual([]);
    expect(lastOfficePaidMonth).toBeNull();
  });
  it('preserves the full personal ledger when office pay is contributed to a campaign', () => {
    const c = { ...serving(), money: 10000, experience: 200, reputation: 80, skills: { leadership: 50, communication: 50, knowledge: 50 }, ledger: Array.from({ length: 40 }, (_, i) => ({ month: '2027-12-01', label: `Past ${i}`, amount: 1 })) };
    const launch = launchCampaign({ ...c, date: '2031-01-01' }, 'council', 'Forward', 'grassroots');
    if (!launch.ok) throw new Error(launch.message);
    const paid = finishTurn(advanceTurn(launch.career).career);
    const result = selfFund(paid, 100);
    if (!result.ok) throw new Error(result.message);
    expect(result.career.ledger).toHaveLength(44);
    expect(result.career.officePayHistory).toHaveLength(3);
    expect(result.career.money).toBe(paid.money - 100);
    expect(result.career.campaign?.funds).toBe((paid.campaign?.funds ?? 0) + 100);
  });
});
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
