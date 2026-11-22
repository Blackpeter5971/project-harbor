import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { activities, activityEnergy, advanceTurn, doActivity } from '@/lib/game/gameplay';
import { canBuyEnergy, rechargeEnergy } from '@/lib/game/energy';
import { ACTION_COST, BASE_TURN_ENERGY, ENERGY_RECHARGES, MAX_ENERGY, POST_COST, RECHARGE_THRESHOLD, turnEnergyFor } from '@/lib/game/energy-costs';
import { publishPost } from '@/lib/game/social-media';

const base = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Energy Player', party: 'Democrat' }), money: 50000, experience: 100, reputation: 40, relationships: 30, position: 'committee', skills: { communication: 30, knowledge: 30, leadership: 30 } });
const withDiet = (c: Career, tierId: 'budget' | 'standard' | 'premium' | 'organic_chef'): Career => ({ ...c, life: c.life ? { ...c.life, diet: { ...c.life.diet, tierId } } : c.life });

describe('Turn energy', () => {
  it('starts a new career at 100% energy', () => {
    expect(BASE_TURN_ENERGY).toBe(100);
    expect(base().actions).toBe(100);
  });

  it.each([['budget', 95], ['standard', 100], ['premium', 105], ['organic_chef', 110]] as const)('%s diet refills energy to %i%% on turn advance', (diet, expected) => {
    expect(turnEnergyFor(diet)).toBe(expected);
    const next = advanceTurn({ ...withDiet(base(), diet), actions: 0 }).career;
    expect(next.actions).toBe(expected);
  });

  it('charges 5% for an S post', () => {
    expect(POST_COST).toBe(5);
    const r = publishPost(base(), 'policy', 'Testing energy');
    if (!r.ok) throw new Error(r.message);
    expect(r.career.actions).toBe(95);
  });

  it('charges 10/15/20% for small, medium and big political activities', () => {
    expect(activityEnergy('meeting')).toBe(10);
    expect(activityEnergy('campaign')).toBe(15);
    expect(activityEnergy('speech')).toBe(20);
    expect(ACTION_COST).toBe(15);
    for (const id of ['meeting', 'campaign']) {
      const a = activities.find(x => x.id === id)!;
      const r = doActivity(base(), a.id);
      if (!r.ok) throw new Error(r.message);
      expect(r.career.actions).toBe(100 - activityEnergy(id));
    }
  });
});

describe('Coin recharges', () => {
  it('cannot be bought at or above 50% energy', () => {
    expect(RECHARGE_THRESHOLD).toBe(50);
    expect(canBuyEnergy({ ...base(), actions: 50 })).toBe(false);
    expect(rechargeEnergy({ ...base(), actions: 50 }, 'weekend', 999).ok).toBe(false);
    expect(canBuyEnergy({ ...base(), actions: 49 })).toBe(true);
  });

  it.each([['weekend', 5, 10], ['fitness', 25, 50], ['vacation', 50, 110]])('%s costs %i coins and adds %i%% energy', (id, coins, energy) => {
    const r0 = ENERGY_RECHARGES.find(r => r.id === id)!;
    expect(r0.coins).toBe(coins);
    const r = rechargeEnergy({ ...base(), actions: 40 }, id, 1000);
    if (!r.ok) throw new Error(r.message);
    expect(r.career.actions).toBe(40 + energy);
  });

  it('allows overcharge past 100% but caps at 300%', () => {
    const r = rechargeEnergy({ ...base(), actions: 49 }, 'vacation', 1000);
    if (!r.ok) throw new Error(r.message);
    expect(r.career.actions).toBe(159);
    expect(MAX_ENERGY).toBe(300);
  });

  it('rejects when coins are short and never touches cash or bank balances', () => {
    const c = { ...base(), actions: 20 };
    expect(rechargeEnergy(c, 'fitness', 24).ok).toBe(false);
    const r = rechargeEnergy(c, 'fitness', 25);
    if (!r.ok) throw new Error(r.message);
    expect(r.career.money).toBe(c.money);
    expect(JSON.stringify(r.career.banking ?? null)).toBe(JSON.stringify(c.banking ?? null));
    expect(r.career.ledger).toEqual(c.ledger);
  });
});

describe('Legacy save backfill', () => {
  it('converts leftover legacy actions ×20 and tags energyModel 1', () => {
    const legacy = { ...base(), actions: 3 } as Record<string, unknown>;
    delete legacy['energyModel'];
    const loaded = parseCareer(JSON.stringify(legacy));
    expect(loaded?.actions).toBe(60);
    expect(loaded?.energyModel).toBe(1);
    expect(parseCareer(JSON.stringify(loaded))?.actions).toBe(60);
  });
});
