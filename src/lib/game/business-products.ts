import type { Career } from './career';
import { changeBusinessCash, normalizeBusiness, productTiers, type Business, type BusinessProduct } from './business-schema';
import { sectorById, type BusinessSector } from './business-sectors';
import type { Result } from './gameplay';
import { expansionEffects } from './business-expansions';

export type ProductTier = typeof productTiers[number];
export const qualityTiers: { id: ProductTier; name: string; multiplier: number; setupMultiplier: number }[] = [
  { id: 'standard', name: 'Standard', multiplier: 1, setupMultiplier: 1 },
  { id: 'premium', name: 'Premium', multiplier: 1.6, setupMultiplier: 2 },
  { id: 'signature', name: 'Signature', multiplier: 2.5, setupMultiplier: 3.5 },
];
const prices: Record<BusinessSector, number> = { media: 20, 'real-estate': 1500, construction: 2500, technology: 100, transportation: 150, hospitality: 35, retail: 25, manufacturing: 120, agriculture: 40, finance: 300, healthcare: 200, entertainment: 75 };
export const MAX_PRODUCT_PRICE = 10000000;
export function productEconomics(b: Business, tier: ProductTier) {
  const n = normalizeBusiness(b), s = sectorById(n.sector), quality = qualityTiers.find(q => q.id === tier) ?? qualityTiers[0];
  const multiplier = quality?.multiplier ?? 1;
  const marketPrice = Math.round(prices[n.sector] * multiplier * 100) / 100;
  return { marketPrice, unitCost: Math.round(marketPrice * (1 - (s?.margin ?? .2)) * .65 * 100) / 100,
    setupCost: Math.round((s?.overhead ?? 7000) * .5 * (quality?.setupMultiplier ?? 1)) };
}
export function productDemand(b: Business, p: Pick<BusinessProduct, 'price' | 'tier' | 'active'>): { rating: 'Low' | 'Moderate' | 'High' | 'Viral'; score: number } {
  if (!p.active) return { rating: 'Low', score: 0 };
  const market = productEconomics(b, p.tier).marketPrice;
  const reputation = Math.max(0, Math.min(100, b.reputation));
  const score = Math.round(Math.max(0, Math.min(100, 50 + reputation * .4 + (1 - p.price / market) * 60)));
  return { score, rating: score >= 85 ? 'Viral' : score >= 65 ? 'High' : score >= 35 ? 'Moderate' : 'Low' };
}
export type ProductDraft = { name: string; tier: ProductTier; price: number; annualVolume?: number };
export const MAX_ANNUAL_VOLUME = 100_000_000;
const validVolume = (v: number | undefined) => v === undefined || (Number.isInteger(v) && v >= 0 && v <= MAX_ANNUAL_VOLUME);
export type ProductRequest = { type: 'launch-product'; id: string; draft: ProductDraft } | { type: 'price-product'; id: string; productId: string; price: number } | { type: 'availability-product'; id: string; productId: string; active: boolean } | { type: 'volume-product'; id: string; productId: string; annualVolume: number };
const validPrice = (price: number) => Number.isFinite(price) && price >= .01 && price <= MAX_PRODUCT_PRICE && Math.abs(price * 100 - Math.round(price * 100)) < .000001;
/** Saved catalog edits only. No sales, payroll or turn simulation is introduced here. */
export function productAction(c: Career, request: ProductRequest): Result {
  const existing = c.businesses.find(b => b.id === request.id);
  if (!existing) return { ok: false, message: 'Business not found.' };
  const b = normalizeBusiness(existing);
  let updated: Business;
  if (request.type === 'launch-product') {
    const name = request.draft.name.trim();
    if (!name || name.length > 48 || !productTiers.includes(request.draft.tier)) return { ok: false, message: 'Enter a product name and valid quality tier.' };
    if (!validVolume(request.draft.annualVolume)) return { ok: false, message: 'Enter a whole annual manufacturing volume up to 100,000,000 units.' };
    if (!validPrice(request.draft.price)) return { ok: false, message: 'Enter a unit price from $0.01 to $10,000,000, with at most two decimal places.' };
    if (b.products.some(p => p.name.toLowerCase() === name.toLowerCase())) return { ok: false, message: 'This company already has a product with that name.' };
    if (request.draft.tier !== 'standard' && !expansionEffects(b).premiumUnlocked) return { ok: false, message: 'Build an R&D Facility to unlock Premium and Signature products.' };
    const setupCost = productEconomics(b, request.draft.tier).setupCost;
    if (b.operatingCash < setupCost) return { ok: false, message: 'Company operating cash cannot cover this setup cost.' };
    let suffix = b.products.length + 1;
    while (b.products.some(p => p.id === `${b.id}-product-${suffix}`)) suffix++;
    const product: BusinessProduct = { id: `${b.id}-product-${suffix}`, name, tier: request.draft.tier, price: request.draft.price, active: true, launched: c.date, setupCost, ...(request.draft.annualVolume !== undefined ? { annualVolume: request.draft.annualVolume } : {}) };
    updated = { ...changeBusinessCash(b, -setupCost), products: [...b.products, product], ledger: [{ month: c.date, label: `Product setup · ${name}`, amount: -setupCost }, ...b.ledger] };
  } else {
    const p = b.products.find(p => p.id === request.productId);
    if (!p) return { ok: false, message: 'Product not found.' };
    if (request.type === 'volume-product') {
      if (!validVolume(request.annualVolume)) return { ok: false, message: 'Enter a whole annual manufacturing volume up to 100,000,000 units.' };
      if (p.annualVolume === request.annualVolume) return { ok: false, message: 'That product setting is already saved.' };
      const u = { ...b, products: b.products.map(x => x.id === p.id ? { ...x, annualVolume: request.annualVolume } : x) };
      return { ok: true, message: 'Annual manufacturing volume saved.', career: { ...c, businesses: c.businesses.map(x => x.id === b.id ? u : x) } };
    }
    if (request.type === 'price-product' && !validPrice(request.price)) return { ok: false, message: 'Enter a valid unit price with at most two decimal places.' };
    if (request.type === 'price-product' ? p.price === request.price : p.active === request.active) return { ok: false, message: 'That product setting is already saved.' };
    updated = { ...b, products: b.products.map(p => p.id !== request.productId ? p : request.type === 'price-product' ? { ...p, price: request.price } : { ...p, active: request.active }) };
  }
  return { ok: true, message: request.type === 'launch-product' ? `${request.draft.name.trim()} launched. Setup paid from company cash.` : 'Product settings saved.', career: { ...c, businesses: c.businesses.map(x => x.id === b.id ? updated : x) } };
}