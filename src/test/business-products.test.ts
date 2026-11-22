import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { businessAction, createBusiness, distributableProfit } from '@/lib/game/business';
import { normalizeBusiness } from '@/lib/game/business-schema';
import { productDemand, productEconomics } from '@/lib/game/business-products';
import { businessFinance } from '@/lib/game/business-finance';
import type { Result } from '@/lib/game/gameplay';
const ok = (r: Result): Career => { if (!r.ok) throw new Error(r.message); return r.career; };
const owned = () => ok(createBusiness({ ...createCareer({ ...defaultDraft, name: 'Product Owner' }, () => .5), money: 200000 }, { sector: 'retail', name: 'Crossia Market', focus: 'Groceries', investment: 75000 }));
const company = (c: Career) => { const b = c.businesses[0]; if (!b) throw new Error('Missing company'); return normalizeBusiness(b); };
const launch = (c: Career) => businessAction(c, { type: 'launch-product', id: company(c).id, draft: { name: 'Fresh Box', tier: 'standard', price: 25 }, revision: c.businessRevision ?? 0 });
describe('Company product catalog', () => {
  it('deducts setup only from company operating cash, records expense and preserves locked capital', () => {
    const c = owned(), n = ok(launch(c)), b = company(n);
    expect(b.account).toBe(71500); expect(b.operatingCash).toBe(71500);
    expect(b.retainedEarnings).toBe(-3500); expect(b.initialInvestment).toBe(75000);
    expect(b.products[0]).toMatchObject({ name: 'Fresh Box', tier: 'standard', price: 25, active: true, setupCost: 3500 });
    expect(b.ledger[0]?.amount).toBe(-3500); expect(distributableProfit(b)).toBe(0);
    expect(n.money).toBe(c.money); expect(n.ledger).toEqual(c.ledger);
    expect(n.campaign).toEqual(c.campaign); expect(n.treasury).toEqual(c.treasury); expect(n.warChest).toBe(c.warChest); expect(n.crime).toEqual(c.crime); expect(n.corruption).toEqual(c.corruption);
  });
  it('requires enough company cash even when the owner is wealthy', () => {
    const c = owned(), b = company(c);
    expect(launch({ ...c, businesses: [{ ...b, account: 3499, operatingCash: 3499 }] }).ok).toBe(false);
    expect(launch({ ...c, money: 0 }).ok).toBe(true);
  });
  it('quality tiers increase market guidance and setup cost', () => {
    const b = company(owned());
    expect(productEconomics(b, 'standard')).toMatchObject({ marketPrice: 25, setupCost: 3500 });
    expect(productEconomics(b, 'premium')).toMatchObject({ marketPrice: 40, setupCost: 7000 });
    expect(productEconomics(b, 'signature')).toMatchObject({ marketPrice: 62.5, setupCost: 12250 });
  });
  it('demand changes with price competitiveness and reputation, spanning all ratings', () => {
    const b = company(owned()), p = { tier: 'standard' as const, active: true };
    expect(productDemand(b, { ...p, price: 50 }).rating).toBe('Low');
    expect(productDemand(b, { ...p, price: 25 }).rating).toBe('Moderate');
    expect(productDemand(b, { ...p, price: 20 }).rating).toBe('High');
    expect(productDemand(b, { ...p, price: 10 }).rating).toBe('Viral');
    expect(productDemand({ ...b, reputation: 100 }, { ...p, price: 25 }).rating).toBe('Viral');
  });
  it('saves price edits without changing company cash or quarterly outcomes', () => {
    const c = ok(launch(owned())), b = company(c), p = b.products[0]; if (!p) throw new Error('Missing product');
    const n = ok(businessAction(c, { type: 'price-product', id: b.id, productId: p.id, price: 20, revision: 1 }));
    expect(company(n).products[0]?.price).toBe(20); expect(company(n).account).toBe(b.account);
    expect(company(n).lastProcessed).toBe(b.lastProcessed); expect(company(n).quarterlyHistory).toEqual(b.quarterlyHistory);
    expect(n.date).toBe(c.date); expect(n.job).toEqual(c.job); expect(n.workMonths).toBe(c.workMonths);
  });
  it('discontinues and reactivates the same saved product without refunding setup', () => {
    const c = ok(launch(owned())), b = company(c), p = b.products[0]; if (!p) throw new Error('Missing product');
    const n = ok(businessAction(c, { type: 'availability-product', id: b.id, productId: p.id, active: false, revision: 1 }));
    expect(company(n).products[0]?.active).toBe(false); expect(productDemand(b, { ...p, active: false }).score).toBe(0);
    const restored = ok(businessAction(n, { type: 'availability-product', id: b.id, productId: p.id, active: true, revision: 2 }));
    expect(company(restored).products).toHaveLength(1); expect(company(restored).account).toBe(71500);
  });
  it('rejects stale launches, duplicate names and invalid prices', () => {
    const c = owned(), n = ok(launch(c)), b = company(n);
    expect(businessAction(n, { type: 'launch-product', id: b.id, draft: { name: 'Other', tier: 'standard', price: 25 }, revision: 0 }).ok).toBe(false);
    expect(launch(n).ok).toBe(false);
    for (const price of [NaN, Infinity, 0, -1, .001, 10000001]) expect(businessAction(c, { type: 'launch-product', id: b.id, draft: { name: 'Invalid', tier: 'standard', price }, revision: 0 }).ok).toBe(false);
  });
  it('keeps products scoped to their company', () => {
    const c = ok(createBusiness(owned(), { sector: 'retail', name: 'Second', focus: 'Goods', investment: 75000 }));
    const n = ok(launch(c)); expect(n.businesses[1]).toEqual(c.businesses[1]);
    const p = company(n).products[0]; if (!p) throw new Error('Missing product');
    const second = n.businesses[1]; if (!second) throw new Error('Missing second company');
    expect(businessAction(n, { type: 'price-product', id: second.id, productId: p.id, price: 20, revision: 1 }).ok).toBe(false);
  });
  it('reloads products and safely defaults older saves to an empty catalog', () => {
    const c = ok(launch(owned())), saved = parseCareer(JSON.stringify(c));
    expect(saved?.businesses[0]?.products).toEqual(company(c).products);
    const { products, ...old } = company(c);
    const legacy = parseCareer(JSON.stringify({ ...c, businesses: [old] }));
    expect(legacy?.businesses[0]?.products).toEqual([]); expect(legacy?.businesses[0]?.account).toBe(71500);
  });
  it('finance line items reconcile to existing overhead without new taxes or settlement', () => {
    const c = owned(), b = company(c), f = businessFinance(b);
    expect(f.items.reduce((s, i) => s + i.amount, 0)).toBe(7000);
    expect(f.taxes).toBe(0); expect(f.revenue - f.expenses - f.taxes).toBe(f.netRetainedProfit);
    expect(company(c)).toEqual(b);
  });
});