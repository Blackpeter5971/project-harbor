import type { Career } from './career';
import { normalizeBusiness, type Business } from './business-schema';
import { sectorById } from './business-sectors';
import { productDemand, productEconomics } from './business-products';
import { activeManager, ownerUnavailable, staffingEconomics } from './business-workforce';
import { rand } from './campaign';
import { expansionEffects } from './business-expansions';
import { growthEffects } from './business-growth';

const cash = (n: number) => Math.round(n * 100) / 100;
export function corporateTaxRate(state?: string) {
  return state === 'California' ? .0884 : state === 'New York' ? .065 : ['Texas', 'Nevada', 'Wyoming', 'South Dakota'].includes(state ?? '') ? 0 : .06;
}
/** Shared projection/settlement math; market draws are deterministic per company and quarter. */
export function quarterlySimulation(business: Business, c?: Career, period = c?.date ?? (business.lastProcessedEnd || business.founded)) {
  const b = normalizeBusiness(business), sector = sectorById(b.sector), manager = activeManager(c, b);
  const efficiency = manager ? .85 + manager.quality * .003 : ownerUnavailable(c) ? .5 : 1;
  const x = expansionEffects(b), g = growthEffects(b);
  const market = 1 + (rand(`${b.id}|${period}|business-market`) * 2 - 1) * (sector?.volatility ?? .2);
  const staff = staffingEconomics(b), capacity = Math.floor(b.employees.length * staff.capacityPerEmployee * efficiency);
  const active = b.products.filter(p => p.active);
  const baseDemand = (sector?.revenue ?? 45000) / productEconomics(b, 'standard').marketPrice;
  const demand = active.map(p => {
    const quality = p.tier === 'signature' ? 1.2 : p.tier === 'premium' ? 1.1 : 1;
    return { product: p, demanded: Math.max(0, Math.floor(baseDemand / Math.max(1, active.length) * productDemand(b, p).score / 60 * quality * market * x.demand * g.demand)) };
  });
  // Products with an annual manufacturing volume can never sell more than one quarter of that run.
  const sellable = demand.map(d => ({ ...d, cap: d.product.annualVolume !== undefined ? Math.min(d.demanded, Math.floor(d.product.annualVolume / 4)) : d.demanded }));
  const demanded = demand.reduce((s, d) => s + d.demanded, 0), wanted = sellable.reduce((s, d) => s + d.cap, 0);
  const sold = Math.min(wanted, capacity);
  // Allocate the same finite capacity proportionally; rounding leftovers never exceed demand or volume.
  const rows = sellable.map(d => ({ ...d, sold: wanted ? Math.floor(d.cap * sold / wanted) : 0 }));
  let remaining = sold - rows.reduce((s, r) => s + r.sold, 0);
  for (const row of rows) { if (remaining > 0 && row.sold < row.cap) { row.sold++; remaining--; } }
  // Manufactured runs are paid for even when unsold (bounded by staff capacity share).
  const qVol = (r: typeof rows[number]) => r.product.annualVolume !== undefined ? Math.floor(r.product.annualVolume / 4) : r.cap;
  const planned = rows.reduce((s, r) => s + qVol(r), 0);
  const made = rows.map(r => r.product.annualVolume !== undefined ? Math.max(r.sold, Math.min(qVol(r), planned ? Math.floor(capacity * qVol(r) / planned) : 0)) : r.sold);
  const revenue = cash(rows.reduce((s, r) => s + r.sold * r.product.price, 0));
  const production = cash(rows.reduce((s, r, i) => s + (made[i] ?? r.sold) * productEconomics(b, r.product.tier).unitCost * x.unitCost, 0));
  const staffPayroll = cash(b.employees.reduce((s, e) => s + e.quarterlySalary, 0)), managerPayroll = manager?.quarterlySalary ?? 0;
  const payroll = staffPayroll + managerPayroll, overhead = (sector?.overhead ?? 7000) + x.upkeep + g.upkeep, marketing = g.marketing;
  const expenses = cash(payroll + production + overhead + marketing), operatingIncome = cash(revenue - expenses);
  const taxRate = corporateTaxRate(c?.character.state), taxes = cash(Math.max(0, operatingIncome) * taxRate);
  return { revenue, expenses, profit: cash(operatingIncome - taxes), operatingIncome, taxes, taxRate, totalExpenses: cash(expenses + taxes), production, overhead, marketing, payroll, staffPayroll, managerPayroll, capacity, demanded, sold, efficiency, manager, market, rows };
}