import type { Career } from './career';
import type { Result } from './gameplay';
import { housingCatalog } from './housing';
import { vehicleModelById } from './vehicles';
import { registerScandal } from './scandals';

/** Personal income tax, property levies and filing stance. Personal cash only; treasury credited when one exists. */
export type TaxStance = 'honest' | 'loophole' | 'evade';
export const TAX_BRACKETS = [{ upTo: 15_000, rate: 0.1 }, { upTo: 50_000, rate: 0.2 }, { upTo: Infinity, rate: 0.35 }] as const;
export const PROPERTY_TAX_RATE = 0.005;
export const LUXURY_VEHICLE_MIN = 50_000;
export const VEHICLE_TAX_RATE = 0.0025;
export const LOOPHOLE_SHARE = 0.5;
export const EXPOSURE_BY_STANCE: Record<TaxStance, number> = { honest: 0, loophole: 10, evade: 30 };
export const AUDIT_EXPOSURE = 70;
export const AUDIT_PENALTY = 0.5;
export const stanceInfo: Record<TaxStance, { label: string; hint: string }> = {
  honest: { label: 'Standard Honest Filing', hint: 'Pay in full. No risk, +1 reputation.' },
  loophole: { label: 'Aggressive Deductions', hint: 'Pay 50%. +10 exposure (audit risk).' },
  evade: { label: 'Conceal / Evade', hint: 'Pay nothing. +30 exposure and a paper trail.' },
};

const NON_INCOME = /loan|withdraw|transfer|sale|sold|liquidation|refund|opening|deposit|matur|principal|proceeds/i;
export const addMonths = (d: string, m: number) => { const [y, mo, rest] = [Number(d.slice(0, 4)), Number(d.slice(5, 7)), d.slice(7)]; const t = y * 12 + (mo - 1) + m; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}${rest}`; };

export function progressiveTax(income: number): number {
  let tax = 0, low = 0;
  for (const b of TAX_BRACKETS) { if (income <= low) break; tax += (Math.min(income, b.upTo) - low) * b.rate; low = b.upTo; }
  return Math.round(tax);
}

export const taxableIncome = (c: Career, periodStart: string) => {
  const end = addMonths(periodStart, 3);
  return Math.round(c.ledger.filter(e => e.amount > 0 && e.month >= periodStart && e.month < end && !NON_INCOME.test(e.label)).reduce((s, e) => s + e.amount, 0));
};

export function propertyTax(c: Career): number {
  const h = c.housing;
  const home = h?.status === 'owning' ? (housingCatalog.find(p => p.id === h.currentPropertyId)?.purchasePrice ?? 0) * PROPERTY_TAX_RATE : 0;
  const cars = (c.life?.vehicles ?? []).reduce((s, v) => { const p = vehicleModelById(v.modelId)?.purchasePrice ?? 0; return s + (p >= LUXURY_VEHICLE_MIN ? p * VEHICLE_TAX_RATE : 0); }, 0);
  return Math.round(home + cars);
}

export const taxStance = (c: Career): TaxStance => c.life?.taxStance ?? 'honest';

export interface TaxBill { income: number; incomeTax: number; propertyTax: number; liability: number; due: number; stance: TaxStance }
export function taxBill(c: Career, periodStart: string): TaxBill {
  const income = taxableIncome(c, periodStart), incomeTax = progressiveTax(income), pt = propertyTax(c), liability = incomeTax + pt, stance = taxStance(c);
  const due = stance === 'honest' ? liability : stance === 'loophole' ? Math.round(liability * LOOPHOLE_SHARE) : 0;
  return { income, incomeTax, propertyTax: pt, liability, due, stance };
}

export function setTaxStance(c: Career, stance: TaxStance): Result {
  if (!c.life) return { ok: false, message: 'Your household is not set up yet.' };
  if (taxStance(c) === stance) return { ok: false, message: 'That filing stance is already selected.' };
  return { ok: true, message: `Filing stance set: ${stanceInfo[stance].label}.`, career: { ...c, life: { ...c.life, taxStance: stance } } };
}

const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;

/** Once per quarter (life.lastTaxPeriod): withhold tax from personal cash, record evasion exposure, and audit when exposure is high. */
export function collectTaxes(c: Career, periodStart: string): { career: Career; notices: string[] } {
  const life = c.life;
  if (!life || (life.lastTaxPeriod && periodStart <= life.lastTaxPeriod)) return { career: c, notices: [] };
  const b = taxBill(c, periodStart);
  const notices: string[] = [];
  const paid = Math.min(b.due, Math.max(0, Math.floor(c.money)));
  const shortfall = b.due - paid;
  const hidden = b.liability - b.due;
  let n: Career = { ...c, money: c.money - paid, ledger: paid > 0 ? [{ month: periodStart, label: 'Income & property tax (quarterly)', amount: -paid }, ...c.ledger] : c.ledger, life: { ...life, lastTaxPeriod: periodStart, unpaidTax: (life.unpaidTax ?? 0) + hidden + shortfall } };
  if (paid > 0 && n.treasury) n = { ...n, treasury: { ...n.treasury, balance: n.treasury.balance + paid, transactions: [...n.treasury.transactions, { key: `tax|${periodStart}`, tenure: n.treasury.tenure, date: periodStart, label: 'Personal income & property tax from the officeholder', amount: paid }] } };
  if (b.liability === 0) { notices.push('Taxes: nothing owed this quarter.'); return { career: n, notices }; }
  const gain = hidden > 0 ? EXPOSURE_BY_STANCE[b.stance] : 0;
  if (b.stance === 'honest' && shortfall === 0) { n = { ...n, reputation: Math.min(100, n.reputation + 1) }; notices.push(`Taxes: ${fmt(paid)} paid in full (income ${fmt(b.incomeTax)}, property ${fmt(b.propertyTax)}). +1 reputation.`); }
  else if (b.stance === 'loophole') notices.push(`Taxes: ${fmt(paid)} paid using aggressive deductions; ${fmt(hidden)} written off. Audit risk rising.`);
  else if (b.stance === 'evade') notices.push(`Taxes: ${fmt(hidden)} concealed from the authorities. A paper trail now exists.`);
  if (shortfall > 0) notices.push(`Taxes: ${fmt(shortfall)} unpaid — not enough personal cash.`);
  if (gain > 0) {
    const k = n.corruption ?? { reserve: 0, exposure: 0, txns: [], bribeTurn: '', darkMoneyTurn: '', lastTurn: '', lastAudit: '', launderTurn: '', influenceTurn: '', embezzleTurn: '', whistled: [] };
    const txn = { id: `tax|${periodStart}`, date: periodStart, amount: hidden, kind: 'tax_evasion' as const, source: b.stance === 'evade' ? 'Undeclared income' : 'Offshore deduction scheme', destination: 'personal' as const, favor: '', risk: b.stance === 'evade' ? 'High' as const : 'Medium' as const, evidence: gain };
    n = { ...n, corruption: { ...k, exposure: Math.min(100, k.exposure + gain), txns: [txn, ...k.txns].slice(0, 60) } };
  }
  return auditTaxes(n, periodStart, notices);
}

/** High exposure with hidden tax triggers an audit: back taxes + 50% fine, a scandal, and a Severe case at very high exposure. */
function auditTaxes(c: Career, date: string, notices: string[]): { career: Career; notices: string[] } {
  const owed = c.life?.unpaidTax ?? 0, exposure = c.corruption?.exposure ?? 0;
  if (owed <= 0 || exposure < AUDIT_EXPOSURE) return { career: c, notices };
  const demand = Math.round(owed * (1 + AUDIT_PENALTY));
  const paid = Math.min(demand, Math.max(0, Math.floor(c.money)));
  let n: Career = { ...c, money: c.money - paid, ledger: paid > 0 ? [{ month: date, label: 'Tax audit: back taxes + penalty', amount: -paid }, ...c.ledger] : c.ledger, life: { ...c.life!, unpaidTax: 0, billArrears: (c.life!.billArrears ?? 0) + (demand - paid) } };
  if (paid > 0 && n.treasury) n = { ...n, treasury: { ...n.treasury, balance: n.treasury.balance + paid, transactions: [...n.treasury.transactions, { key: `tax-audit|${date}`, tenure: n.treasury.tenure, date, label: 'Tax audit recovery', amount: paid }] } };
  n = registerScandal(n, { id: `tax|audit|${date}`, date, title: 'Tax Evasion Allegations', summary: `Tax authorities say ${fmt(owed)} in personal taxes went undeclared and demanded ${fmt(demand)} including penalties.`, source: 'Legal Audit', severity: exposure >= 85 ? 'Severe' : 'Moderate', evidence: Math.round(exposure), trigger: 'corruption' });
  notices.push(`Tax audit: ${fmt(demand)} demanded in back taxes and penalties${demand > paid ? ` (${fmt(demand - paid)} added to arrears)` : ''}. Reporters are covering "Tax Evasion Allegations".`);
  return { career: n, notices };
}
