import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { collectObligations, essentialObligations } from '@/lib/game/obligations';
import { ensureLife } from '@/lib/game/life';
import { creditProfile } from '@/lib/game/banking';

const make = (over: Partial<Career> = {}): Career => ensureLife({ ...createCareer({ ...defaultDraft, name: 'Bills' }), ...over });
const room = { currentPropertyId: 'room', status: 'renting' as const, monthlyRent: 150, arrears: 0, missedQuarters: 0, lastRentPeriod: '', since: '', history: [] };

describe('Essential quarterly obligations', () => {
  it('modest room renter owes $150 utilities + $300 levy; luxury owner owes $2,500 + upkeep', () => {
    expect(essentialObligations(make({ housing: room }))).toMatchObject({ rent: 450, utilities: 150, levies: 300, maintenance: 0, total: 900 });
    const estate = essentialObligations(make({ housing: { ...room, currentPropertyId: 'estate', status: 'owning', monthlyRent: 0 } }));
    expect(estate).toMatchObject({ rent: 0, utilities: 2500, maintenance: 350, total: 3150 });
  });

  it('deducts the previewed bills from personal cash once per quarter', () => {
    const c = make({ housing: room, money: 5000 });
    const o = essentialObligations(c);
    const r = collectObligations(c, '2026-01-01');
    expect(r.career.money).toBe(5000 - (o.total - o.rent));
    expect(collectObligations(r.career, '2026-01-01').career.money).toBe(r.career.money);
  });

  it('zero cash records arrears, shuts off utilities and lowers credit without crashing', () => {
    const c = make({ housing: room, money: 0 });
    const r = collectObligations(c, '2026-01-01');
    expect(r.career.life!.billArrears).toBe(450);
    expect(r.career.life!.energy).toBeLessThan(c.life!.energy);
    expect(creditProfile(r.career).score).toBeLessThan(creditProfile(c).score);
  });

  it('older saves without bill fields load with no arrears', () => {
    const c = make();
    const { billArrears: _a, lastBillsPeriod: _b, ...legacy } = c.life!;
    const loaded = parseCareer(JSON.stringify({ ...c, life: legacy }));
    expect(loaded).not.toBeNull();
    expect(essentialObligations(ensureLife(loaded!)).arrears).toBe(0);
  });
});
