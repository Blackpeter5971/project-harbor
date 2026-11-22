import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/game/life', async orig => ({ ...(await orig<typeof import('@/lib/game/life')>()), collectLiving: (career: unknown) => ({ career, notices: [] }) }));
import { existsSync } from 'node:fs';
import { createCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { currentHousing, ensureHousing, housingCatalog, propertyById, startingHousing } from '@/lib/game/housing';

describe('Housing catalog', () => {
  it('offers exactly five curated properties with valid local assets and prices', () => {
    expect(housingCatalog).toHaveLength(5);
    for (const p of housingCatalog) {
      expect(p.monthlyRent).toBeGreaterThan(0);
      expect(p.purchasePrice).toBeGreaterThan(p.monthlyRent);
      expect(p.asset).toMatch(/^\/images\/housing\/.+\.jpg$/);
      expect(existsSync(`public${p.asset}`)).toBe(true);
    }
    expect(housingCatalog.map(p => p.id)).toEqual(['room', 'apartment', 'condo', 'house', 'estate']);
  });
  it('scales prices from budget to luxury', () => {
    const rents = housingCatalog.map(p => p.monthlyRent);
    expect([...rents].sort((a, b) => a - b)).toEqual(rents);
    expect(housingCatalog.at(0)!.monthlyRent).toBeLessThanOrEqual(200);
    expect(housingCatalog.at(-1)!.purchasePrice).toBeGreaterThanOrEqual(1000000);
  });
});

describe('Starting accommodation by background', () => {
  it('gives most backgrounds the basic starter rental at $200/mo', () => {
    for (const bg of ['Nobody', 'Working-Class Family', 'Self-Made'] as const) {
      const h = startingHousing(bg);
      expect(h).toMatchObject({ currentPropertyId: 'room', status: 'renting', monthlyRent: 200, arrears: 0, history: [] });
    }
  });
  it('gives Wealthy Family a comfortable downtown condo rental', () => {
    expect(startingHousing('Wealthy Family')).toMatchObject({ currentPropertyId: 'condo', status: 'renting', monthlyRent: 1200 });
  });
  it('gives Political Dynasty an owned family home with no rent', () => {
    expect(startingHousing('Political Dynasty')).toMatchObject({ currentPropertyId: 'house', status: 'owning', monthlyRent: 0 });
  });
  it('assigns matching housing on character creation', () => {
    expect(createCareer({ ...defaultDraft, name: 'Alex', background: 'Political Dynasty' }).housing?.currentPropertyId).toBe('house');
    expect(createCareer({ ...defaultDraft, name: 'Sam', background: 'Nobody' }).housing?.monthlyRent).toBe(200);
  });
});

describe('Save safety', () => {
  it('loads older saves without housing and assigns defaults without touching other stats', () => {
    const legacy = createCareer({ ...defaultDraft, name: 'Legacy Player', background: 'Wealthy Family' });
    const raw = JSON.parse(JSON.stringify(legacy));
    delete raw.housing;
    raw.money = 4321;
    raw.reputation = 12;
    const parsed = parseCareer(JSON.stringify(raw));
    expect(parsed).not.toBeNull();
    expect(parsed!.housing).toMatchObject({ currentPropertyId: 'condo', status: 'renting', monthlyRent: 1200 });
    expect(parsed!.money).toBe(4321);
    expect(parsed!.reputation).toBe(12);
  });
  it('preserves existing housing on reload', () => {
    const c = createCareer({ ...defaultDraft, name: 'Saver' });
    c.housing = { currentPropertyId: 'estate', status: 'owning', monthlyRent: 0, arrears: 0, history: [{ propertyId: 'room', from: '2026-01-01', to: '2027-01-01', status: 'renting' }] };
    const parsed = parseCareer(JSON.stringify(c));
    expect(parsed!.housing?.currentPropertyId).toBe('estate');
    expect(parsed!.housing?.history).toHaveLength(1);
  });
  it('ensureHousing fills missing housing and leaves existing housing untouched', () => {
    const c = createCareer({ ...defaultDraft, name: 'Hold' });
    const noHousing = { ...c, housing: null };
    expect(ensureHousing(noHousing).housing?.currentPropertyId).toBe('room');
    const owned = { ...c, housing: { currentPropertyId: 'estate', status: 'owning' as const, monthlyRent: 0, arrears: 0, history: [] } };
    expect(ensureHousing(owned)).toBe(owned);
  });
  it('currentHousing resolves the catalog property for display', () => {
    const c = createCareer({ ...defaultDraft, name: 'View' });
    const { property, state } = currentHousing(c);
    expect(property).toBe(propertyById('room'));
    expect(state.status).toBe('renting');
  });
});

import { buyProperty, collectRent, rentProperty } from '@/lib/game/housing';

describe('Rental contracts, purchases and arrears', () => {
  const base = (money: number) => ({ ...createCareer({ ...defaultDraft, name: 'Tenant' }), money, warChest: 40_000, treasury: { tenure: 't', balance: 900_000, lastProcessedEnd: '', transactions: [] } });
  const ok = (r: ReturnType<typeof rentProperty>) => { if (!r.ok) throw new Error(r.message); return r.career; };

  it('renting charges 3 months of rent from personal money once and records it', () => {
    const c = ok(rentProperty(base(2000), 'apartment'));
    expect(c.money).toBe(2000 - 1350);
    expect(c.housing).toMatchObject({ currentPropertyId: 'apartment', status: 'renting', monthlyRent: 450 });
    expect(c.ledger[0]).toMatchObject({ amount: -1350 });
    expect(rentProperty(c, 'apartment').ok).toBe(false);
  });

  it('buying outright sets rent to $0 and owning status', () => {
    const c = ok(buyProperty(base(100_000), 'apartment'));
    expect(c.money).toBe(5000);
    expect(c.housing).toMatchObject({ currentPropertyId: 'apartment', status: 'owning', monthlyRent: 0 });
    expect(c.ledger[0]).toMatchObject({ amount: -95_000 });
    expect(collectRent(c, '2026-04-01').career).toBe(c);
    expect(rentProperty(c, 'apartment').ok).toBe(false);
  });

  it('rejects unaffordable rentals and purchases without changes', () => {
    const c = base(1349);
    const r1 = rentProperty(c, 'apartment'), r2 = buyProperty(c, 'apartment');
    expect(r1.ok || r2.ok).toBe(false);
    expect(c.money).toBe(1349);
    expect(c.ledger).toHaveLength(0);
  });

  it('switching rentals never double-bills a quarter', () => {
    const a = ok(rentProperty(base(10_000), 'apartment'));
    const b = ok(rentProperty(a, 'condo'));
    expect(b.money).toBe(10_000 - 1350 - 3600);
    expect(collectRent(b, b.date).career.money).toBe(b.money);
    const paid = collectRent(b, '2026-04-01').career;
    expect(paid.money).toBe(b.money - 3600);
    expect(collectRent(paid, '2026-04-01').career.money).toBe(paid.money);
  });

  it('personal housing payments never touch campaign or treasury funds', () => {
    const c0 = base(500_000);
    const c = ok(buyProperty(ok(rentProperty(c0, 'condo')), 'house'));
    expect(c.warChest).toBe(40_000);
    expect(c.treasury).toEqual(c0.treasury);
    expect(c.campaign).toEqual(c0.campaign);
    expect(buyProperty(base(0), 'room').ok).toBe(false);
  });

  it('warns after one missed quarter and evicts after two, carrying arrears', () => {
    const c = ok(rentProperty(base(3600), 'condo'));
    expect(c.money).toBe(0);
    const one = collectRent(c, '2026-04-01');
    expect(one.notice).toMatch(/warning/i);
    expect(one.career.housing).toMatchObject({ arrears: 3600, missedQuarters: 1, currentPropertyId: 'condo' });
    const two = collectRent(one.career, '2026-07-01');
    expect(two.evicted).toBe(true);
    expect(two.career.housing).toMatchObject({ currentPropertyId: 'room', arrears: 7200, missedQuarters: 0 });
  });
});

import { advanceTurn } from '@/lib/game/gameplay';
// Pay/accounting tests isolate income from personal taxes (covered in taxes.test.ts).
vi.mock('@/lib/game/taxes', async (orig) => ({ ...(await orig<typeof import('@/lib/game/taxes')>()), collectTaxes: (c: unknown) => ({ career: c, notices: [] }) }));


describe('Quarterly turn rent', () => {
  const tenant = (money: number) => ({ ...createCareer({ ...defaultDraft, name: 'Turn Tenant' }), money });
  it('charges 3 months of rent once per turn and reports it', () => {
    const c = tenant(1000);
    const due = c.housing!.monthlyRent * 3;
    const r = advanceTurn(c).career;
    expect(r.money).toBe(1000 - due);
    expect(r.report!.lines).toContain(`Housing: Paid $${due.toLocaleString('en-US')} rent for ${propertyById(c.housing!.currentPropertyId).name}.`);
    expect(advanceTurn(r).career).toBe(r);
    expect(collectRent(r, c.date).career).toBe(r);
  });
  it('takes available cash, adds the rest to arrears and warns', () => {
    const c = tenant(100);
    const due = c.housing!.monthlyRent * 3;
    const r = advanceTurn(c).career;
    expect(r.money).toBe(0);
    expect(r.housing!.arrears).toBe(due - 100);
    expect(r.report!.lines).toContain(`Housing Warning: Missed quarterly rent payment ($${(due - 100).toLocaleString('en-US')} in arrears).`);
  });
  it('charges owners nothing', () => {
    const c = { ...tenant(500), housing: { ...startingHousing('Political Dynasty') } };
    expect(advanceTurn(c).career.money).toBe(500);
  });
});
