import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureTreasury, treasuryFunds, treasuryTurn, spendTreasury, baselineSpend, revenueBase, maintenanceCost, quarterlyTreasuryOutlook } from '@/lib/game/budget';
import { mayorAction, cityCost, cityState } from '@/lib/game/city';
import { governorAction } from '@/lib/game/state-government';
import { federalAction } from '@/lib/game/federal';
import { commitOfficeFunds, getOfficeEvent, resolveOfficeEvent } from '@/lib/game/office-events';
import { campaignAction, launchCampaign } from '@/lib/game/campaign';
import { advanceTurn as advanceGameTurn, doActivity } from '@/lib/game/gameplay';
import { ensureApproval } from '@/lib/game/approval';
import type { Result } from '@/lib/game/support';

const take = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };
const holder = (id = 'mayor'): Career => ensureApproval({ ...createCareer({ ...defaultDraft, name: 'Treasury Player', party: 'Democrat' }), date: '2028-04-01', money: 10000, warChest: 1234, reputation: 90, relationships: 100, skills: { communication: 80, leadership: 100, knowledge: 80 }, publicOffice: true, office: { id, title: id, jurisdiction: 'Test jurisdiction', since: '2028-01-01', elected: '2027-11-01', termEnd: '2032-01-01', party: 'Democrat', margin: 20 } });
const campaign = () => take(launchCampaign({ ...createCareer({ ...defaultDraft, name: 'Treasury Player', party: 'Democrat' }), date: '2027-07-01', age: 40, experience: 100, reputation: 40, money: 10000, skills: { communication: 30, leadership: 30, knowledge: 30 } }, 'council', 'Public service', 'grassroots')).campaign;

describe('Isolated government treasury', () => {
  it('deducts authorized office expenses only from treasury', () => {
    const c = ensureTreasury({ ...holder(), campaign: campaign() });
    const n = take(mayorAction(c, 'appoint', 'City manager'));
    expect(n.treasury?.balance).toBe(treasuryFunds(c) - cityCost(c, 'appointment'));
    expect(n.money).toBe(10000); expect(n.ledger).toEqual(c.ledger);
    expect(n.campaign).toEqual(c.campaign); expect(n.warChest).toBe(1234);
    expect(n.treasury?.transactions.at(-1)?.amount).toBe(-80000);
  });

  it('personal and campaign spending leave treasury unchanged', () => {
    const camp = campaign(); if (!camp) throw new Error('Missing campaign');
    const c = ensureTreasury({ ...holder(), campaign: { ...camp, funds: 10000 } });
    const personal = take(doActivity(c, 'community', c.politicalActivityRevision, 0.5));
    expect(personal.money).toBe(8500); expect(personal.treasury).toEqual(c.treasury);
    const campaigning = take(campaignAction(personal, 'rally'));
    expect(campaigning.campaign?.funds).toBe((personal.campaign?.funds ?? 0) - 2500);
    expect(campaigning.treasury).toEqual(c.treasury); expect(campaigning.money).toBe(8500);
  });

  it.each(['mayor', 'governor', 'president'])('blocks %s spending when treasury is empty without consuming actions', id => {
    const initialized = ensureTreasury(holder(id));
    if (!initialized.treasury) throw new Error('Missing treasury');
    const c = { ...initialized, treasury: { ...initialized.treasury, balance: 0 } };
    const result = id === 'mayor' ? mayorAction(c, 'appoint', 'City manager') : id === 'governor' ? governorAction(c, 'appoint', 'Health secretary') : federalAction(c, 'order', 'preparedness');
    expect(result.ok).toBe(false); expect(c.actions).toBe(100);
    expect(c.money).toBe(10000); expect(c.warChest).toBe(1234); expect(c.treasury.balance).toBe(0);
  });

  it('rejects invalid amounts, overdrafts and repeated expense keys', () => {
    const c = ensureTreasury(holder());
    for (const amount of [-1, NaN, Infinity, treasuryFunds(c) + 1]) expect(spendTreasury(c, amount, 'expense', 'Expense').ok).toBe(false);
    const paid = take(spendTreasury(c, 100, 'expense', 'Expense'));
    expect(paid.treasury?.balance).toBe(1999900);
    const restored = parseCareer(JSON.stringify(paid));
    if (!restored) throw new Error('Save failed');
    expect(spendTreasury(restored, 100, 'expense', 'Expense').ok).toBe(false);
    expect(commitOfficeFunds(c, treasuryFunds(c) + 1)).toBe(c);
    expect(spendTreasury({ ...c, office: null }, 100, 'invalid-office', 'Expense').ok).toBe(false);
  });

  it('credits quarterly revenue and pays operations once across reload and overlapping attempts', () => {
    const c = ensureTreasury({ ...holder(), campaign: campaign() });
    const settled = treasuryTurn(c, '2028-04-01', '2028-07-01');
    expect(settled.treasury?.balance).toBe(2380000);
    expect(settled.treasury?.transactions.slice(-3).map(t => t.amount)).toEqual([2000000, -1240000, -380000]);
    expect(settled.treasury?.lastProcessedEnd).toBe('2028-07-01');
    expect(settled.money).toBe(c.money); expect(settled.campaign).toEqual(c.campaign); expect(settled.warChest).toBe(1234);
    const restored = parseCareer(JSON.stringify(settled));
    if (!restored) throw new Error('Save failed');
    expect(treasuryTurn(restored, '2028-04-01', '2028-07-01')).toBe(restored);
    const overlapping = { ...restored, date: '2028-05-01' };
    expect(treasuryTurn(overlapping, '2028-05-01', '2028-08-01')).toBe(overlapping);
    expect(treasuryTurn(c, '2028-04-01', '2028-05-01')).toBe(c);
    const next = treasuryTurn({ ...restored, date: '2028-07-01' }, '2028-07-01', '2028-10-01');
    expect(next.treasury?.balance).toBe(2760000);
  });

  it('caps operating expenses at available cash without borrowing from other accounts', () => {
    const n = ensureTreasury(holder());
    if (!n.treasury) throw new Error('Missing treasury');
    const c = { ...n, treasury: { ...n.treasury, balance: 0 }, budget: { year: 2028, revenue: revenueBase(n), taxes: 'hold' as const, spending: { ...baselineSpend(n), services: 1e12 }, proposals: [] } };
    const settled = treasuryTurn(c, c.date, '2028-07-01');
    expect(settled.treasury?.balance).toBe(0);
    expect(settled.treasury?.transactions.at(-2)?.amount).toBe(-2000000);
    expect(settled.treasury?.transactions.at(-1)?.amount).toBe(0);
    expect(settled.money).toBe(10000); expect(settled.warChest).toBe(1234);
  });

  it('legacy defaults preserve careers and net existing commitments without historical replay', () => {
    const c = { ...holder(), city: { ...cityState(holder()), spent: 100000 } };
    const old: Record<string, unknown> = { ...c }; delete old['treasury'];
    const parsed = parseCareer(JSON.stringify(old));
    if (!parsed) throw new Error('Legacy save failed');
    const upgraded = ensureTreasury(parsed);
    expect(upgraded.treasury?.balance).toBe(1900000);
    expect(upgraded.treasury?.lastProcessedEnd).toBe(c.date);
    expect(upgraded.treasury?.transactions).toHaveLength(1);
    expect(ensureTreasury(upgraded)).toBe(upgraded);
    expect({ ...upgraded, treasury: null }).toEqual(initializeDocket(c));
    expect(treasuryFunds(createCareer({ ...defaultDraft, name: 'Citizen' }))).toBe(0);
    const partial = parseCareer(JSON.stringify({ ...holder(), treasury: { tenure: '' } }));
    expect(partial?.treasury?.balance).toBe(0); expect(partial?.treasury?.transactions).toEqual([]);
  });

  it('settles the existing turn before term expiry and never repeats during report continuation', () => {
    const c = holder(); if (!c.office) throw new Error('Missing office');
    c.office = { ...c.office, termEnd: '2028-06-01' };
    const n = advanceTurn(c).career;
    // Isolate deterministic settlement from Phase 3 random event rolls (windfalls/damage).
    const settled = n.treasury?.transactions.filter(t => !t.key.includes('|event|') || t.key.startsWith('event|')) ?? [];
    const eventNet = (n.treasury?.transactions ?? []).filter(t => t.key.includes('|event|') || t.key.startsWith('event|')).reduce((s, t) => s + t.amount, 0);
    expect(n.office).toBeNull(); expect(settled.slice(-3).map(t => t.amount)).toEqual([1333333, -826667, -253333]);
    expect((n.treasury?.balance ?? 0) - eventNet).toBe(2253333);
    expect(n.report?.lines.some(l => l.startsWith('Government treasury:'))).toBe(true);
    expect(advanceTurn(n).career).toBe(n);
    const restored = parseCareer(JSON.stringify(n)); if (!restored) throw new Error('Save failed');
    expect(advanceTurn(restored).career.treasury).toEqual(n.treasury);
  });

  it('does not debit infrastructure and safety allocations again as operating costs', () => {
    const c = ensureTreasury(holder());
    const paid = take(mayorAction(c, 'appoint', 'City manager'));
    const settled = treasuryTurn(paid, c.date, '2028-07-01');
    expect(settled.treasury?.balance).toBe(2300000);
    expect(settled.treasury?.transactions.filter(t => t.amount < 0).map(t => t.amount)).toEqual([-80000, -1240000, -380000]);
  });

  it('charges recurring infrastructure and public safety upkeep every quarter, even when allocations are cut', () => {
    const n = ensureTreasury(holder());
    expect(maintenanceCost(n)).toBe(1520000);
    const cut = { ...n, budget: { year: 2028, revenue: revenueBase(n), taxes: 'hold' as const, spending: { ...baselineSpend(n), infrastructure: 0, safety: 0 }, proposals: [] } };
    const settled = treasuryTurn(cut, cut.date, '2028-07-01');
    expect(settled.treasury?.transactions.at(-1)).toMatchObject({ label: 'Infrastructure and public safety maintenance', amount: -380000 });
    expect(quarterlyTreasuryOutlook(n)).toEqual({ revenue: 2000000, operations: 1240000, maintenance: 380000, net: 380000 });
  });

  it('a saved office-event response cannot pay twice or replay rewards', () => {
    const c = ensureTreasury(holder()); const event = getOfficeEvent(c, 'office:storm');
    if (!event) throw new Error('Missing event');
    const n = take(resolveOfficeEvent(c, event, 'fund'));
    expect(n.treasury?.balance).toBe(1760000);
    const restored = parseCareer(JSON.stringify(n)); if (!restored) throw new Error('Save failed');
    expect(resolveOfficeEvent(restored, event, 'fund').ok).toBe(false);
    expect(restored.treasury?.transactions).toHaveLength(2);
  });
});
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
