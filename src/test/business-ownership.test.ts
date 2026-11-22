import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft } from '@/lib/game/career';
import { advanceTurn } from '@/lib/game/gameplay';
import { startBusiness, withdrawDividend, injectFunds, quarterlyForecast, mediaCompanies } from '@/lib/game/business';

const rich = () => ({ ...createCareer({ ...defaultDraft, name: 'Ada' }), money: 150_000 });
const ok = (r: ReturnType<typeof startBusiness>) => { if (!r.ok) throw new Error(r.message); return r.career; };

describe('business ownership', () => {
  it('starting a business deducts the upfront cost from personal cash into the business account', () => {
    const c = ok(startBusiness(rich(), 'local-retail'));
    expect(c.money).toBe(75_000);
    expect(c.businesses[0]?.account).toBe(75_000);
  });
  it('cannot start a business without enough personal cash', () => {
    expect(startBusiness({ ...rich(), money: 1000 }, 'local-retail').ok).toBe(false);
  });
  it('a turn adds quarterly profit to the business only, once', () => {
    const c = ok(startBusiness(rich(), 'local-retail'));
    const b = c.businesses[0]; if (!b) throw new Error('No company');
    const profit = quarterlyForecast(b, c).profit;
    expect(profit).toBe(-7000);
    const campaign = c.campaign, treasury = c.treasury, warChest = c.warChest;
    const next = advanceTurn(c).career;
    expect(next.businesses[0]?.account).toBe(75_000 + profit);
    expect(next.campaign).toEqual(campaign); expect(next.treasury).toEqual(treasury); expect(next.warChest).toBe(warChest);
  });
  it('dividends move cash from business to personal; injections the reverse', () => {
    const c = ok(startBusiness(rich(), 'local-retail'));
    const b = c.businesses[0]; if (!b) throw new Error('No company');
    expect(withdrawDividend(c, b.id, 5000).ok).toBe(false);
    const earned = { ...c, businesses: [{ ...b, account: 85000, operatingCash: 85000, retainedEarnings: 10000 }] }, profit = 10000;
    const d = ok(withdrawDividend(earned, b.id, profit));
    expect(d.money).toBe(earned.money + profit); expect(d.businesses[0]?.account).toBe(75_000);
    expect(withdrawDividend(d, b.id, 20_000).ok).toBe(false);
    const i = ok(injectFunds(d, b.id, 2000));
    expect(i.money).toBe(d.money - 2000); expect(i.businesses[0]?.account).toBe(77_000);
  });
  it('newspapers are tagged as media companies', () => {
    const c = ok(startBusiness(rich(), 'newspaper'));
    expect(mediaCompanies(c).length).toBe(1);
  });
});
