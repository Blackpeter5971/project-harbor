import type { Career } from './career';
import type { Result } from './gameplay';
import { changeBusinessCash, normalizeBusiness, type Business } from './business-schema';
import type { BusinessSector } from './business-sectors';
import { rand } from './campaign';

/** Pure growth rules: branches, annual marketing, GM automation and outside investors. */
export const MAX_LOCATIONS = 25;
export const BRANCH_BASE_COST = 25000;
export const BRANCH_UPKEEP = 1500;
export const BRANCH_DEMAND = 0.12;
export const MAX_MARKETING_BUDGET = 5_000_000;
export const MAX_INVESTOR_STAKE = 0.49;
export const PITCH_STAKES = [0.05, 0.1, 0.15, 0.25] as const;

export const sectorProducts: Record<BusinessSector, string[]> = {
  media: ['Daily Newspaper', 'Podcast Network', 'Magazine Subscription', 'Streaming News Channel'],
  'real-estate': ['Apartment Lease', 'Office Space Lease', 'Property Management Plan', 'Vacation Rental'],
  construction: ['Home Renovation', 'Roofing Contract', 'Commercial Build-Out', 'Road Paving'],
  technology: ['Business Software License', 'Mobile App', 'Cloud Hosting Plan', 'Smart Home Device'],
  transportation: ['Freight Delivery', 'Courier Service', 'Moving Service', 'Charter Bus Trip'],
  hospitality: ['Dinner Menu', 'Catering Package', 'Hotel Night', 'Coffee & Pastry'],
  retail: ['Grocery Basket', 'Household Essentials', 'Clothing Line', 'Home Goods'],
  manufacturing: ['Kitchen Appliance', 'Furniture Set', 'Auto Parts', 'Packaged Snacks'],
  agriculture: ['Fresh Produce Crate', 'Dairy Supply', 'Grain Bushel', 'Organic Meat Box'],
  finance: ['Financial Plan', 'Tax Preparation', 'Business Consulting', 'Wealth Management'],
  healthcare: ['Clinic Visit', 'Physical Therapy', 'Dental Checkup', 'Home Care Visit'],
  entertainment: ['Concert Ticket', 'Film Production', 'Theme Night Event', 'Game Release'],
};

export const branchCount = (b: Pick<Business, 'branches' | 'expansions'>) => (b.branches ?? 0) + ((b.expansions ?? []).includes('branch') ? 1 : 0);
export const locations = (b: Pick<Business, 'branches' | 'expansions'>) => 1 + branchCount(b);
export const nextBranchCost = (b: Pick<Business, 'branches' | 'expansions'>) => Math.round(BRANCH_BASE_COST * (1 + 0.1 * branchCount(b)));
/** Owner share after investor stakes. */
export const ownerStake = (b: Pick<Business, 'investors'>) => Math.max(0, 1 - (b.investors ?? []).reduce((s, i) => s + i.stake, 0));
/** Extra demand from opened branches (the legacy branch expansion is already counted in expansion effects) and annual ads. */
export function marketingLift(annual: number) { return annual > 0 ? Math.min(0.6, 0.15 * Math.log2(1 + annual / 10000)) : 0; }
export function growthEffects(b: Pick<Business, 'branches' | 'marketingBudget'>) {
  const branches = b.branches ?? 0, marketing = b.marketingBudget ?? 0;
  return { demand: 1 + branches * BRANCH_DEMAND + marketingLift(marketing), upkeep: branches * BRANCH_UPKEEP, marketing: Math.round(marketing / 4 * 100) / 100 };
}

export type GrowthRequest =
  | { type: 'open-branch'; id: string }
  | { type: 'marketing'; id: string; annual: number }
  | { type: 'gm-automation'; id: string; enabled: boolean }
  | { type: 'pitch-investors'; id: string; stake: number };

/** Offer terms for selling equity; deterministic per company, quarter and round so reloads cannot reroll. */
export function pitchQuote(c: Career, x: Business, stake: number, valuation: number) {
  const b = normalizeBusiness(x), round = (b.investors ?? []).length;
  const profitable = b.quarterlyHistory.some(q => q.netProfit > 0);
  const chance = Math.max(0.1, Math.min(0.9, 0.3 + b.reputation / 200 + (profitable ? 0.2 : 0) - stake * 0.6));
  const offer = Math.round(Math.max(25000, valuation) * stake * (0.9 + b.reputation / 250));
  const roll = rand(`${b.id}|${c.date}|pitch|${round}`);
  return { chance, offer, accepted: roll < chance };
}

export function growthAction(c: Career, request: GrowthRequest, valuation: (b: Business) => number): Result {
  const existing = c.businesses.find(b => b.id === request.id);
  if (!existing) return { ok: false, message: 'Business not found.' };
  const b = normalizeBusiness(existing);
  const save = (u: Business, message: string): Result => ({ ok: true, message, career: { ...c, businesses: c.businesses.map(x => x.id === b.id ? u : x) } });
  if (request.type === 'open-branch') {
    if (locations(b) >= MAX_LOCATIONS) return { ok: false, message: `${b.name} already operates the maximum ${MAX_LOCATIONS} locations.` };
    const cost = nextBranchCost(b);
    if (b.account < cost) return { ok: false, message: `${b.name} needs $${Math.round(cost - b.account).toLocaleString('en-US')} more company cash to open a branch.` };
    const paid = changeBusinessCash(b, -cost);
    return save({ ...paid, branches: (b.branches ?? 0) + 1, ledger: [{ month: c.date, label: `New branch location #${locations(b) + 1}`, amount: -cost }, ...paid.ledger] }, `${b.name} opened location #${locations(b) + 1}.`);
  }
  if (request.type === 'marketing') {
    const annual = Math.round(request.annual);
    if (!Number.isFinite(request.annual) || annual < 0 || annual > MAX_MARKETING_BUDGET) return { ok: false, message: 'Set an annual marketing budget between $0 and $5,000,000.' };
    if (annual === (b.marketingBudget ?? 0)) return { ok: false, message: 'That marketing budget is already saved.' };
    return save({ ...b, marketingBudget: annual }, annual ? `Annual marketing budget set to $${annual.toLocaleString('en-US')} (billed quarterly).` : 'Marketing spend stopped.');
  }
  if (request.type === 'gm-automation') {
    if (request.enabled && !b.generalManager && !b.managerId) return { ok: false, message: 'Hire a General Manager first.' };
    return save({ ...b, gmAutomation: request.enabled }, request.enabled ? 'Your General Manager now handles staffing each quarter.' : 'You are back in charge of routine staffing.');
  }
  if (!PITCH_STAKES.some(s => s === request.stake)) return { ok: false, message: 'Choose a 5%, 10%, 15% or 25% stake.' };
  if (b.lastPitch === c.date) return { ok: false, message: 'You already pitched investors this quarter.' };
  if (1 - ownerStake(b) + request.stake > MAX_INVESTOR_STAKE + 1e-9) return { ok: false, message: 'You must keep a majority (at least 51%) of the company.' };
  const q = pitchQuote(c, b, request.stake, valuation(b));
  if (!q.accepted) return save({ ...b, lastPitch: c.date }, 'The angel investors passed on this round. Build reputation or profits and try again next quarter.');
  const investors = [...(b.investors ?? []), { id: `${b.id}-inv-${(b.investors ?? []).length + 1}`, name: `Angel round ${(b.investors ?? []).length + 1}`, stake: request.stake, amount: q.offer, date: c.date }];
  const account = b.account + q.offer;
  return save({ ...b, investors, lastPitch: c.date, account, operatingCash: account, financialDistress: account < 0, additionalCapital: b.additionalCapital + q.offer, valuation: b.valuation + q.offer, ledger: [{ month: c.date, label: `Angel investment · ${Math.round(request.stake * 100)}% equity`, amount: q.offer }, ...b.ledger] }, `Investors bought ${Math.round(request.stake * 100)}% of ${b.name} for $${q.offer.toLocaleString('en-US')}.`);
}
