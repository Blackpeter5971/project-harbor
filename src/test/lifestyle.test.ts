import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { createCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { ensureLife } from '@/lib/game/life';
import { lifestyleCatalog, projectedVitality, quarterlyLifestyleCost, selectLifestyle } from '@/lib/game/lifestyle';

const fresh = () => ensureLife(createCareer({ ...defaultDraft, name: 'Vital' }));

describe('Lifestyle save safety', () => {
  it('older saves load with 80 energy, 20 stress and the balanced lifestyle', () => {
    const c0 = fresh();
    const { energy: _e, stress: _s, lifestyle: _l, ...oldLife } = c0.life!;
    const c = parseCareer(JSON.stringify({ ...c0, money: 321, life: oldLife }))!;
    expect(c.money).toBe(321);
    expect(c.life!.energy).toBe(80);
    expect(c.life!.stress).toBe(20);
    expect(c.life!.lifestyle).toEqual({ tierId: 'balanced', monthlyCost: 400, stressReductionPerQuarter: -5, energyBonusPerQuarter: 3 });
    expect(c.life!.diet.tierId).toBe(c0.life!.diet.tierId);
  });
  it('new careers round-trip unchanged', () => { const c = fresh(); expect(parseCareer(JSON.stringify(c))).toEqual(c); });
});

describe('Lifestyle tiers', () => {
  it('has four tiers with agreed prices, vitality deltas and local images', () => {
    expect(lifestyleCatalog.map(t => [t.id, t.monthlyCost, t.stressReductionPerQuarter, t.energyBonusPerQuarter])).toEqual([
      ['minimalist', 100, -2, 0], ['balanced', 400, -5, 3], ['affluent', 1200, -10, 6], ['luxury', 3500, -18, 10]]);
    for (const t of lifestyleCatalog) {
      expect(t.asset).toMatch(/^\/images\/life\/.+\.jpg$/);
      expect(existsSync(`public${t.asset}`)).toBe(true);
      expect(quarterlyLifestyleCost(t)).toBe(t.monthlyCost * 3);
    }
  });
  it('selecting a tier updates the monthly cost and projected vitality without charging or touching campaign money', () => {
    const c = { ...fresh(), money: 20_000, warChest: 999 };
    const r = selectLifestyle(c, 'luxury'); if (!r.ok) throw new Error(r.message);
    expect(r.career.life!.lifestyle.monthlyCost).toBe(3500);
    expect(r.career.money).toBe(20_000);
    expect(r.career.warChest).toBe(999);
    expect(projectedVitality(r.career)).toEqual({ energy: 90, stress: 2 });
    expect(selectLifestyle({ ...c, money: 10_499 }, 'luxury').ok).toBe(false);
  });
});

import { focusMultiplier, isBurnedOut, takeRestAction } from '@/lib/game/lifestyle';

describe('Recreation & burnout (3C)', () => {
  const withLife = (money: number, energy: number, stress: number, over: object = {}) => { const c = fresh(); return { ...c, money, ...over, life: { ...c.life!, energy, stress } }; };
  it('recreation deducts personal cash, restores energy and lowers stress', () => {
    const g = takeRestAction(withLife(1000, 50, 50), 'getaway'); if (!g.ok) throw new Error(g.message);
    expect([g.career.money, g.career.life!.energy, g.career.life!.stress]).toEqual([500, 60, 35]);
    expect(g.career.ledger[0]!.amount).toBe(-500);
    const f = takeRestAction(withLife(1000, 50, 50, { health: 70 }), 'fitness'); if (!f.ok) throw new Error(f.message);
    expect([f.career.money, f.career.health, f.career.life!.energy, f.career.life!.stress]).toEqual([750, 71, 65, 45]);
    const v = takeRestAction(withLife(5000, 50, 50), 'vacation'); if (!v.ok) throw new Error(v.message);
    expect([v.career.money, v.career.life!.energy, v.career.life!.stress]).toEqual([2000, 75, 15]);
    expect(takeRestAction(withLife(2999, 50, 50), 'vacation').ok).toBe(false);
  });
  it('clamps vitality to 0–100', () => {
    const v = takeRestAction(withLife(5000, 90, 10, { health: 100 }), 'vacation'); if (!v.ok) throw new Error(v.message);
    expect([v.career.life!.energy, v.career.life!.stress]).toEqual([100, 0]);
    const f = takeRestAction(withLife(5000, 90, 10, { health: 100 }), 'fitness'); if (!f.ok) throw new Error(f.message);
    expect(f.career.health).toBe(100);
  });
  it('burnout applies only above 80 stress or below 20 energy, and rest clears it', () => {
    expect(isBurnedOut(withLife(0, 20, 80))).toBe(false);
    expect(isBurnedOut(withLife(0, 19, 20))).toBe(true);
    expect(isBurnedOut(withLife(0, 80, 81))).toBe(true);
    expect(focusMultiplier(withLife(0, 80, 81))).toBe(0.85);
    expect(focusMultiplier(withLife(0, 80, 20))).toBe(1);
    const r = takeRestAction(withLife(5000, 50, 90), 'vacation'); if (!r.ok) throw new Error(r.message);
    expect(isBurnedOut(r.career)).toBe(false);
  });
  it('leisure never touches campaign funds or treasury', () => {
    const c = withLife(5000, 50, 50, { warChest: 777 });
    const r = takeRestAction(c, 'vacation'); if (!r.ok) throw new Error(r.message);
    expect(r.career.warChest).toBe(777);
    expect(r.career.campaign).toEqual(c.campaign);
    expect(r.career.treasury).toEqual(c.treasury);
  });
});

import { collectLiving, vitalityDrift } from '@/lib/game/life';
import { advanceTurn } from '@/lib/game/gameplay';

describe('Quarterly lifestyle & vitality (3D)', () => {
  const never = () => 0.99;
  const make = (money: number, over: object = {}) => ({ ...fresh(), money, ...over });
  it('charges 3 months of lifestyle once per turn and applies drift', () => {
    const c = make(10_000);
    const d = vitalityDrift(c);
    const r = collectLiving(c, '2026-04-01', never);
    expect(r.notices).toContain('Lifestyle: $1,200 paid (Balanced / Comfortable).');
    expect(r.career.money).toBe(10_000 - 1050 - 1200 - 150 - 450); // + transit fare + essential bills
    expect(r.career.life!.energy).toBe(80 + 3 + d.energy);
    expect(r.career.life!.stress).toBe(20 - 5 + d.stress);
    expect(collectLiving(r.career, '2026-04-01', never).career).toBe(r.career);
  });
  it('higher office adds stress; better housing reduces it', () => {
    const base = make(0);
    const pres = { ...base, office: { id: 'president', title: 'President', jurisdiction: 'US', since: '', party: 'Independent' as const, elected: '', termEnd: '', margin: 0 } };
    expect(vitalityDrift(pres).stress - vitalityDrift(base).stress).toBe(10);
    const lux = { ...base, housing: { ...base.housing!, currentPropertyId: 'estate' } };
    expect(vitalityDrift(lux).stress).toBeLessThan(vitalityDrift(base).stress);
  });
  it('unaffordable lifestyle downgrades to Frugal with +10 stress', () => {
    const c = make(1100);
    const d = vitalityDrift(c);
    const r = collectLiving(c, '2026-04-01', never);
    expect(r.career.life!.lifestyle.tierId).toBe('minimalist');
    expect(r.career.life!.stress).toBe(20 + 10 + d.stress);
    expect(r.career.money).toBe(0);
  });
  it('advanceTurn reports lifestyle and leaves campaign funds untouched', () => {
    const c = make(20_000, { warChest: 4321 });
    const r = advanceTurn(c);
    expect(r.events).toContain('Lifestyle: $1,200 paid (Balanced / Comfortable).');
    expect(r.events.some(e => e.startsWith('Well-being:') || e.startsWith('Burnout Warning:'))).toBe(true);
    expect(r.career.warChest).toBe(4321);
  });
});
