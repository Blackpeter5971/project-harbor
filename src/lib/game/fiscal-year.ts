import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { currentBudget, ensureTreasury, indicators, revenueBase, revenueWithTaxes, type TaxStance } from './budget';
import { shiftLoyalty, type Deltas } from './support-groups';
import { tenureKey } from './support';
import { usd } from './campaign';

/** Annual Q1 tax proposal. Choice ids map onto the existing budget tax stance so
 * quarterly treasury revenue keeps a single source of truth (currentBudget). */
export const taxPolicies = [
  { id: 'low', stance: 'cut', label: 'Low Tax' },
  { id: 'balanced', stance: 'hold', label: 'Balanced' },
  { id: 'progressive', stance: 'raise', label: 'Progressive High Tax' },
] as const satisfies readonly { id: string; stance: TaxStance; label: string }[];
export type TaxPolicyId = (typeof taxPolicies)[number]['id'];

export const taxReactions: Record<TaxPolicyId, { business: number; labor: number; services: number; deltas: Deltas }> = {
  low: { business: 4, labor: -2, services: -3, deltas: { business: 4, labor: -2, rural: 1 } },
  balanced: { business: 0, labor: 0, services: 0, deltas: {} },
  progressive: { business: -4, labor: 3, services: 3, deltas: { business: -4, labor: 3, youth: 1 } },
};

/** 0.8–1.2 multiplier from the existing employment indicator. */
export const economicHealth = (c: Career) => Math.round((0.8 + (indicators(c).employment / 100) * 0.4) * 1000) / 1000;

/** Start-of-year replenishment: 5% of projected annual revenue scaled by economic health,
 * capped at the jurisdiction's revenue base so the treasury can never overflow. */
export function projectTax(c: Career, id: TaxPolicyId) {
  const policy = taxPolicies.find(p => p.id === id)!;
  const revenue = revenueWithTaxes(c, policy.stance);
  const replenishment = Math.max(0, Math.round(revenue * 0.05 * economicHealth(c)));
  return { revenue, replenishment, reaction: taxReactions[id] };
}

export const fiscalKey = (c: Career) => `${tenureKey(c)}|fiscal|${c.date.slice(0, 4)}`;

export function adoptTaxPolicy(c: Career, id: string): { ok: true; career: Career; message: string } | { ok: false; message: string } {
  const policy = taxPolicies.find(p => p.id === id);
  if (!policy) return { ok: false, message: 'Choose a listed tax policy.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough actions.' };
  const n = ensureTreasury(c), t = n.treasury;
  if (!t) return { ok: false, message: 'No public treasury for this office.' };
  const key = fiscalKey(n);
  if (t.transactions.some(x => x.key === key)) return { ok: false, message: 'This year’s budget was already adopted.' };
  const { replenishment, reaction } = projectTax(n, policy.id);
  const cap = revenueBase(n);
  const credit = Math.max(0, Math.min(replenishment, cap - t.balance));
  const year = Number(n.date.slice(0, 4));
  const budget = { ...(n.budget ?? { spending: {}, proposals: [] }), year, taxes: policy.stance, revenue: 0, spending: n.budget?.spending ?? {}, proposals: n.budget?.proposals ?? [] };
  let next: Career = { ...n, actions: n.actions - ACTION_COST, budget, treasury: { ...t, balance: t.balance + credit, transactions: [...t.transactions, { key, tenure: t.tenure, date: n.date, label: `Annual fiscal replenishment (${policy.label})`, amount: credit }] } };
  next = { ...next, budget: { ...budget, revenue: currentBudget(next).revenue } };
  next = shiftLoyalty(next, reaction.deltas, `${year} ${policy.label} budget`);
  const signed = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
  return { ok: true, career: next, message: `${policy.label} budget adopted: +${usd(credit)} Treasury; Business ${signed(reaction.business)}, Labor ${signed(reaction.labor)}, Services ${signed(reaction.services)}.` };
}
