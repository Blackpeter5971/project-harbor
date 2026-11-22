import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { bankOf, bankingTurn, creditProfile, netWorthBreakdown } from '@/lib/game/banking';
import { buyProperty, sellProperty } from '@/lib/game/housing';
import { businessAction, createBusiness } from '@/lib/game/business';
import { normalizeBusiness } from '@/lib/game/business-schema';
import { quarterlySimulation } from '@/lib/game/business-engine';
import { MAX_LOCATIONS, ownerStake } from '@/lib/game/business-growth';
import type { Result } from '@/lib/game/gameplay';

const ok = (r: Result): Career => { if (!r.ok) throw new Error(r.message); return r.career; };
const base = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Wealth Tester' }, () => .5), money: 500000, job: null });
const withCompany = () => ok(createBusiness(base(), { sector: 'retail', name: 'Crossia Market', focus: 'Groceries', investment: 100000 }));
const co = (c: Career) => normalizeBusiness(c.businesses[0]!);
const act = (c: Career, r: Record<string, unknown>) => businessAction(c, { ...r, id: co(c).id, revision: c.businessRevision ?? 0 } as never);

describe('Phase 4 wealth rules', () => {
  it('net worth = cash + savings + business equity + owned home − debts', () => {
    const c = ok(buyProperty(withCompany(), 'apartment'));
    const w = netWorthBreakdown({ ...c, life: c.life ? { ...c.life, medicalDebt: 5000 } : c.life });
    expect(w.realEstate).toBe(95000);
    expect(w.businessEquity).toBe(100000);
    expect(w.total).toBe(w.cash + w.savings + 100000 + 95000 - w.debts);
    expect(w.debts).toBeGreaterThanOrEqual(5000);
  });
  it('selling a home pays 90% of its price and moves the player into the basic room', () => {
    const owner = ok(buyProperty(base(), 'apartment'));
    const sold = ok(sellProperty(owner));
    expect(sold.money).toBe(owner.money + 85500);
    expect(sold.housing?.status).toBe('renting');
    expect(sold.housing?.currentPropertyId).toBe('room');
  });
  it('an unemployed player with net worth can borrow', () => {
    expect(creditProfile(base()).cap).toBeGreaterThan(0);
  });
  it('8 straight missed loan quarters forecloses, settles debt and crashes credit', () => {
    let c: Career = ok(buyProperty(base(), 'apartment'));
    const loan = { id: 'loan:1', principal: 50000, rate: .05, turns: 12, opened: c.date, nextDue: c.date, payment: 5000, total: 60000, remaining: 60000, elapsed: 0, arrears: 0, fees: 0 };
    c = { ...c, money: 0, banking: { ...bankOf(c), loans: [loan] } };
    const before = creditProfile(c).score;
    for (let i = 0; i < 7; i++) {
      const [y, m] = c.date.split('-').map(Number);
      const end = new Date(Date.UTC(y!, m! + 2, 1)).toISOString().slice(0, 10);
      c = { ...bankingTurn(c, c.date, end).career, date: end };
    }
    expect(bankOf(c).missedStreak).toBe(7);
    expect(c.housing?.status).toBe('owning');
    const [y, m] = c.date.split('-').map(Number);
    const end = new Date(Date.UTC(y!, m! + 2, 1)).toISOString().slice(0, 10);
    c = { ...bankingTurn(c, c.date, end).career, date: end };
    expect(c.housing?.status).toBe('renting');
    expect(bankOf(c).loans.every(l => l.remaining === 0)).toBe(true);
    expect(bankOf(c).foreclosedOn).toBe(end);
    expect(creditProfile(c).score).toBeLessThan(before - 200);
  });
});

describe('Phase 4 business rules', () => {
  it('a new company starts with no products', () => {
    expect(co(withCompany()).products).toHaveLength(0);
  });
  it('annual manufacturing volume caps quarterly sales at a quarter of the run', () => {
    let c = withCompany();
    c = ok(act(c, { type: 'launch-product', draft: { name: 'Grocery Basket', tier: 'standard', price: 20, annualVolume: 400 } }));
    c = ok(act(c, { type: 'hire-staff', count: 5 }));
    const f = quarterlySimulation(co(c), c);
    expect(f.sold).toBeLessThanOrEqual(100);
  });
  it('marketing spend raises demand and is charged quarterly', () => {
    let c = withCompany();
    c = ok(act(c, { type: 'launch-product', draft: { name: 'Grocery Basket', tier: 'standard', price: 25 } }));
    const before = quarterlySimulation(co(c), c);
    c = ok(act(c, { type: 'marketing', annual: 40000 }));
    const after = quarterlySimulation(co(c), c);
    expect(after.demanded).toBeGreaterThan(before.demanded);
    expect(after.marketing).toBe(10000);
  });
  it(`allows up to ${MAX_LOCATIONS} locations`, () => {
    let c = { ...withCompany() };
    c = { ...c, businesses: [{ ...co(c), account: 1e9, operatingCash: 1e9 }] };
    for (let i = 0; i < MAX_LOCATIONS - 1; i++) c = ok(act(c, { type: 'open-branch' }));
    expect(co(c).branches).toBe(24);
    expect(act(c, { type: 'open-branch' }).ok).toBe(false);
  });
  it('investors can never take more than 49% and only one pitch per quarter', () => {
    const c = withCompany();
    const r = act(c, { type: 'pitch-investors', stake: .25 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(act(r.career, { type: 'pitch-investors', stake: .05 }).ok).toBe(false);
      expect(ownerStake(co(r.career))).toBeGreaterThanOrEqual(.75);
    }
  });
});
