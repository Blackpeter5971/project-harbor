import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { createCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { DEFAULT_HEALTH, dietCatalog, ensureLife, quarterlyDietCost, selectDiet } from '@/lib/game/life';

const fresh = () => createCareer({ ...defaultDraft, name: 'Healthy' });

describe('Health & diet save safety', () => {
  it('older saves without health or diet load with health 85 and the standard diet', () => {
    const { health: _h, life: _l, ...legacy } = { ...fresh(), money: 777 };
    const c = parseCareer(JSON.stringify(legacy))!;
    expect(c.money).toBe(777);
    expect(c.health).toBe(85);
    expect(c.life!.diet).toEqual({ tierId: 'standard', monthlyCost: 350, healthDeltaPerQuarter: 0 });
    expect(c.life!.insurance).toEqual({ planId: 'none', monthlyCost: 0, coverage: 0 });
  });
  it('new careers start with health 85 and standard diet, and round-trip unchanged', () => {
    const c = fresh();
    expect(c.health).toBe(DEFAULT_HEALTH);
    expect(parseCareer(JSON.stringify(c))).toEqual(c);
  });
  it('bad saved values fall back safely', () => {
    const c = ensureLife({ ...fresh(), health: Number.NaN, life: null });
    expect(c.health).toBe(85);
    expect(c.life!.diet.tierId).toBe('standard');
  });
});

describe('Diet tiers', () => {
  it('has the four tiers with the agreed prices, health effects and local images', () => {
    expect(dietCatalog.map(d => [d.id, d.monthlyCost, d.healthDeltaPerQuarter])).toEqual([
      ['budget', 150, -2], ['standard', 350, 0], ['premium', 750, 2], ['organic_chef', 1500, 4],
    ]);
    for (const d of dietCatalog) {
      expect(d.asset).toMatch(/^\/images\/life\/.+\.jpg$/);
      expect(existsSync(`public${d.asset}`)).toBe(true);
      expect(quarterlyDietCost(d)).toBe(d.monthlyCost * 3);
    }
  });
  it('selecting a tier updates monthly cost and quarterly health impact without touching any money', () => {
    const c = { ...fresh(), money: 5000, warChest: 500 };
    const r = selectDiet(c, 'organic_chef');
    if (!r.ok) throw new Error(r.message);
    expect(r.career.life!.diet).toEqual({ tierId: 'organic_chef', monthlyCost: 1500, healthDeltaPerQuarter: 4 });
    expect(r.career.money).toBe(5000);
    expect(r.career.warChest).toBe(500);
    expect(r.career.treasury).toEqual(c.treasury);
    expect(selectDiet(r.career, 'organic_chef').ok).toBe(false);
    expect(selectDiet(c, 'caviar').ok).toBe(false);
  });
});

import { applyHealthEmergency, emergencyCatalog, rollHealthEmergency, visitClinic, selectInsurance as enroll } from '@/lib/game/life';

describe('Insurance, clinics and emergencies (2C)', () => {
  const rich = (over: object = {}) => ({ ...fresh(), money: 10_000, ...over });
  const insured = (plan: string, over: object = {}) => { const r = enroll(rich(over), plan); if (!r.ok) throw new Error(r.message); return r.career; };

  it('enrolling deducts the quarter premium from personal cash and sets the tier', () => {
    const b = insured('basic_hmo');
    expect(b.money).toBe(9_700);
    expect(b.life!.insurance).toEqual({ planId: 'basic_hmo', monthlyCost: 100, coverage: 0.5 });
    expect(b.ledger[0]!.amount).toBe(-300);
    const e = insured('comprehensive_ppo');
    expect(e.money).toBe(8_950);
    expect(e.life!.insurance.coverage).toBe(0.9);
  });

  it('clinic visits charge personal cash, apply insured pricing and cap health at 100', () => {
    const u = visitClinic(rich({ health: 60 }), 'checkup');
    if (!u.ok) throw new Error(u.message);
    expect(u.career.money).toBe(9_750);
    expect(u.career.health).toBe(70);
    const i = visitClinic(insured('basic_hmo', { health: 60 }), 'checkup');
    if (!i.ok) throw new Error(i.message);
    expect(i.career.money).toBe(9_700 - 50);
    const r = visitClinic(rich({ health: 90 }), 'retreat');
    if (!r.ok) throw new Error(r.message);
    expect(r.career.money).toBe(8_500);
    expect(r.career.health).toBe(100);
    expect(visitClinic(rich({ health: 100 }), 'checkup').ok).toBe(false);
    expect(visitClinic({ ...fresh(), money: 100, health: 50 }, 'checkup').ok).toBe(false);
  });

  it('emergencies apply 100% / 50% / 10% out-of-pocket by plan', () => {
    const inf = emergencyCatalog.find(e => e.id === 'infection')!; // $4,000
    expect(applyHealthEmergency(rich({ health: 40 }), inf).billed).toBe(4000);
    expect(applyHealthEmergency(insured('basic_hmo', { health: 40 }), inf).billed).toBe(2000);
    expect(applyHealthEmergency(insured('comprehensive_ppo', { health: 40 }), inf).billed).toBe(400);
  });

  it('only low health risks emergencies; unpaid bills become debt and cost health', () => {
    expect(rollHealthEmergency(rich({ health: 50 }), () => 0)).toBeNull();
    expect(rollHealthEmergency(rich({ health: 49 }), () => 0)).not.toBeNull();
    expect(rollHealthEmergency(rich({ health: 20 }), () => 0.99)).toBeNull();
    const o = applyHealthEmergency({ ...fresh(), money: 1000, health: 40 }, emergencyCatalog[1]!);
    expect(o.career.money).toBe(0);
    expect(o.debt).toBe(3000);
    expect(o.career.life!.medicalDebt).toBe(3000);
    expect(o.career.health).toBe(40 - 10 - 5);
  });

  it('medical costs never touch campaign or government funds', () => {
    const base = rich({ health: 40, warChest: 50_000 }) as ReturnType<typeof fresh>;
    const steps = [enroll(base, 'basic_hmo'), visitClinic(base, 'retreat')];
    for (const s of steps) { if (!s.ok) throw new Error(s.message); expect(s.career.warChest).toBe(base.warChest); expect(s.career.campaign).toEqual(base.campaign); expect((s.career as any).treasury).toEqual((base as any).treasury); }
    const o = applyHealthEmergency({ ...base, money: 0 }, emergencyCatalog[2]!);
    expect(o.career.warChest).toBe(base.warChest);
    expect(o.career.campaign).toEqual(base.campaign);
  });
});

import { collectLiving } from '@/lib/game/life';
import { advanceTurn } from '@/lib/game/gameplay';

describe('Quarterly living costs (2D)', () => {
  const base = (over: object = {}) => ({ ...fresh(), money: 10_000, ...over }) as ReturnType<typeof fresh>;
  const never = () => 0.99;
  it('charges 3 months of groceries and insurance once per period and drifts health by diet', () => {
    const r = enroll(base(), 'basic_hmo'); if (!r.ok) throw new Error(r.message);
    const d = selectDiet(r.career, 'budget'); if (!d.ok) throw new Error(d.message);
    const same = collectLiving(d.career, d.career.date, never);
    expect(same.career.money).toBe(d.career.money - 450 - 1200 - 150 - 450); // + transit fare + essential bills // premium prepaid for the enrolment quarter
    const next = collectLiving(same.career, '2026-04-01', never);
    expect(next.career.money).toBe(same.career.money - 450 - 300 - 1200 - 150 - 450);
    expect(next.notices.slice(0, 3)).toEqual(['Groceries: $450 paid (Budget Groceries).', 'Healthcare: $300 paid (Basic Plan).', 'Lifestyle: $1,200 paid (Balanced / Comfortable).']);
    expect(next.career.health).toBe(85 - 4);
    expect(collectLiving(next.career, '2026-04-01', never).career).toBe(next.career);
  });
  it('unaffordable food costs health -10 and records arrears and frugal mode', () => {
    const o = collectLiving(base({ money: 400 }), '2026-04-01', never);
    expect(o.career.money).toBe(0);
    expect(o.career.health).toBe(72); // -3 utility shutoff
    expect(o.career.life!.foodArrears).toBe(650);
    expect(o.career.life!.frugal).toBe(true);
  });
  it('advanceTurn bills living costs into the report without touching campaign money', () => {
    const c = base({ warChest: 5000 });
    const r = advanceTurn(c);
    expect(r.events).toContain('Groceries: $1,050 paid (Balanced Home Cooking).');
    expect(r.career.warChest).toBe(5000);
  });
});
