import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { ensureLife } from '@/lib/game/life';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { vehicleModels, possessionCatalog, startingVehicles, monthlyTransportCost, normalizeVehicleState } from '@/lib/game/vehicles';

describe('vehicles & possessions save safety', () => {
  it('older saves without vehicle fields load with empty defaults', () => {
    const c = createCareer({ ...defaultDraft, name: 'Ada' });
    const { vehicles, activeVehicleId, possessions, ...oldLife } = c.life!;
    const loaded = parseCareer(JSON.stringify({ ...c, life: oldLife }))!;
    expect(loaded.life!.vehicles).toEqual([]);
    expect(loaded.life!.activeVehicleId).toBeNull();
    expect(loaded.life!.possessions).toEqual([]);
    expect(loaded.money).toBe(c.money);
  });
  it('saves with no life at all get default vehicle state', () => {
    const c = createCareer({ ...defaultDraft, name: 'Ada' });
    const life = ensureLife({ ...c, life: null }).life!;
    expect(life.vehicles).toEqual([]);
    expect(life.activeVehicleId).toBeNull();
  });
  it('drops unknown models and dangling active ids', () => {
    const s = normalizeVehicleState({ vehicles: [{ id: 'x', modelId: 'rocket' }], activeVehicleId: 'x', possessions: [{ id: 'p', itemId: 'yacht' }] });
    expect(s).toEqual({ vehicles: [], activeVehicleId: null, possessions: [] });
  });
});

describe('catalog', () => {
  it('has the five tiers with the specified prices and upkeep', () => {
    expect(vehicleModels.map(v => [v.purchasePrice, v.monthlyUpkeep])).toEqual([[0, 50], [4500, 120], [28000, 350], [75000, 800], [180000, 2500]]);
  });
  it('every item has a local asset that exists', () => {
    for (const i of [...vehicleModels, ...possessionCatalog]) {
      expect(i.asset.startsWith('/images/life/')).toBe(true);
      expect(existsSync(join(process.cwd(), 'public', i.asset))).toBe(true);
    }
    expect(possessionCatalog.length).toBeGreaterThanOrEqual(3);
  });
});

describe('starting transport', () => {
  it('dynasty and wealthy start with a car, others on transit', () => {
    expect(startingVehicles('Political Dynasty').vehicles[0]!.modelId).toBe('armored_sedan');
    expect(startingVehicles('Wealthy Family').vehicles[0]!.modelId).toBe('executive_suv');
    for (const b of ['Nobody', 'Working-Class Family', 'Self-Made'] as const) {
      const s = startingVehicles(b);
      expect(s.vehicles).toEqual([]);
      expect(monthlyTransportCost(s)).toBe(50);
    }
  });
  it('new careers get starter vehicle without spending personal cash', () => {
    const c = createCareer({ ...defaultDraft, name: 'Ada', background: 'Wealthy Family' });
    expect(c.life!.activeVehicleId).toBe(c.life!.vehicles?.[0]?.id);
    expect(c.money).toBe(50_000);
    expect(parseCareer(JSON.stringify(c))!.life!.vehicles).toHaveLength(1);
  });
});

import { buyVehicle, sellVehicle, serviceVehicle, buyPossession, resaleValue, campaignTravelRelief, wardrobeReputationBonus } from '@/lib/game/vehicles';
import type { Career } from '@/lib/game/career';

const rich = (money: number, bg: Career['character']['background'] = 'Nobody'): Career => ({ ...createCareer({ ...defaultDraft, name: 'Tx', background: bg }), money, warChest: 9999, treasury: null });
const ok = (r: ReturnType<typeof buyVehicle>) => { if (!r.ok) throw new Error(r.message); return r.career; };

describe('vehicle transactions', () => {
  it('buying deducts once, records ledger, adds active vehicle at 100%', () => {
    const c = ok(buyVehicle(rich(5000), 'economy_sedan'));
    expect(c.money).toBe(500);
    expect(c.ledger[0]).toMatchObject({ amount: -4500 });
    expect(c.life!.vehicles).toHaveLength(1);
    expect(c.life!.vehicles?.[0]?.condition).toBe(100);
    expect(c.life!.activeVehicleId).toBe(c.life!.vehicles?.[0]?.id);
  });
  it('selling credits 50–70% residual and returns to transit', () => {
    const c = ok(buyVehicle(rich(28000), 'executive_suv'));
    const id = c.life!.vehicles![0]!.id;
    const worn = { ...c, life: { ...c.life!, vehicles: [{ ...c.life!.vehicles![0]!, condition: 50 }] } };
    const s = ok(sellVehicle(worn, id));
    expect(resaleValue('executive_suv', 50)).toBe(16800);
    expect(s.money).toBe(16800);
    expect(s.life!.vehicles).toEqual([]);
    expect(s.life!.activeVehicleId).toBeNull();
    expect(resaleValue('executive_suv', 100)).toBe(19600);
    expect(resaleValue('executive_suv', 0)).toBe(14000);
  });
  it('servicing restores condition, capped at 100', () => {
    const c = ok(buyVehicle(rich(6000), 'economy_sedan'));
    const id = c.life!.vehicles![0]!.id;
    const worn = { ...c, life: { ...c.life!, vehicles: [{ ...c.life!.vehicles![0]!, condition: 90 }] } };
    const t = ok(serviceVehicle(worn, id, 'tuneup'));
    expect(t.life!.vehicles![0]!.condition).toBe(100);
    expect(t.money).toBe(1500 - 150);
    const low = { ...c, life: { ...c.life!, vehicles: [{ ...c.life!.vehicles![0]!, condition: 20 }] } };
    const o = ok(serviceVehicle(low, id, 'overhaul'));
    expect(o.life!.vehicles![0]!.condition).toBe(100);
    expect(o.money).toBe(1500 - 600);
  });
  it('unaffordable transactions are rejected with no deduction', () => {
    const c = rich(4499);
    const r = buyVehicle(c, 'economy_sedan');
    expect(r.ok).toBe(false);
    expect(c.money).toBe(4499);
    expect(buyPossession(rich(100), 'tailored_suit').ok).toBe(false);
    const owned = ok(buyVehicle(rich(4500), 'economy_sedan'));
    const worn = { ...owned, life: { ...owned.life!, vehicles: [{ ...owned.life!.vehicles![0]!, condition: 10 }] } };
    expect(serviceVehicle(worn, worn.life!.vehicles![0]!.id, 'tuneup').ok).toBe(false);
  });
  it('never touches campaign funds or treasury', () => {
    const c = rich(200000);
    const camp = { funds: 777 } as unknown as Career['campaign'];
    const base = { ...c, campaign: camp };
    const a = ok(buyVehicle(base, 'chauffeur_limo'));
    const b = ok(sellVehicle(a, a.life!.vehicles![0]!.id));
    for (const x of [a, b]) { expect(x.campaign).toBe(camp); expect(x.warChest).toBe(9999); expect(x.treasury).toBeNull(); }
  });
  it('perks: executive vehicle eases campaign travel, suit boosts reputation checks', () => {
    const c = ok(buyVehicle(rich(28000), 'executive_suv'));
    expect(campaignTravelRelief(c)).toBe(0);
    expect(campaignTravelRelief({ ...c, campaign: {} as Career['campaign'] })).toBe(1);
    const s = ok(buyPossession(rich(2500), 'tailored_suit'));
    expect(wardrobeReputationBonus(s)).toBe(1);
    expect(s.money).toBe(0);
  });
});

import { collectTransport } from '@/lib/game/vehicles';
import { advanceTurn } from '@/lib/game/gameplay';

describe('quarterly transport billing', () => {
  it('bills 3 months of active upkeep once, wears the car and reports it', () => {
    const c = ok(buyVehicle(rich(5000), 'economy_sedan'));
    const r = collectTransport(c, '2026-01-01');
    expect(r.career.money).toBe(500 - 360);
    expect(r.career.life!.vehicles![0]!.condition).toBe(95);
    expect(r.notices[0]).toBe('Transportation: $360 paid for Used Economy Sedan upkeep & fuel.');
    expect(r.career.ledger[0]).toMatchObject({ amount: -360 });
    const again = collectTransport(r.career, '2026-01-01');
    expect(again.career).toBe(r.career);
    expect(again.notices).toEqual([]);
  });
  it('charges $150 transit when no car', () => {
    const r = collectTransport(rich(1000), '2026-01-01');
    expect(r.career.money).toBe(850);
  });
  it('breakdown below 30% adds +5 stress and a warning', () => {
    const c = ok(buyVehicle(rich(5000), 'economy_sedan'));
    const worn = { ...c, life: { ...c.life!, stress: 20, vehicles: [{ ...c.life!.vehicles![0]!, condition: 32 }] } };
    const r = collectTransport(worn, '2026-04-01');
    expect(r.career.life!.vehicles![0]!.condition).toBe(27);
    expect(r.career.life!.stress).toBe(25);
    expect(r.notices.some(x => x.startsWith('Breakdown Warning'))).toBe(true);
  });
  it('unaffordable upkeep flags overdue, charges nothing and suspends perks', () => {
    const c = ok(buyVehicle(rich(28000), 'executive_suv'));
    const r = collectTransport(c, '2026-01-01');
    expect(r.career.money).toBe(0);
    expect(r.career.life!.maintenanceOverdue).toBe(true);
    expect(campaignTravelRelief({ ...r.career, campaign: {} as Career['campaign'] })).toBe(0);
    expect(r.career.campaign).toBe(c.campaign);
  });
  it('advanceTurn bills transport exactly once and survives a save round-trip', () => {
    const c = ok(buyVehicle(rich(50000), 'economy_sedan'));
    const t = advanceTurn(c);
    const next = t.career;
    expect(t.events).toContain('Transportation: $360 paid for Used Economy Sedan upkeep & fuel.');
    const tx = next.ledger.filter(l => l.label.startsWith('Transportation'));
    expect(tx).toHaveLength(1);
    expect(tx[0]!.amount).toBe(-360);
    const reloaded = parseCareer(JSON.stringify(next))!;
    expect(reloaded.life!.lastTransportPeriod).toBe(c.date);
    expect(collectTransport(reloaded, c.date).career.money).toBe(reloaded.money);
  });
});
