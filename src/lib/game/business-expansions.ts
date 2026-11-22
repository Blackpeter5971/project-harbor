import type { Business } from './business-schema';

export type ExpansionId = 'branch' | 'machinery' | 'marketing' | 'rnd';
/** Company-funded growth projects. Upfront cost is paid once from company cash; upkeep is added to quarterly overhead. */
export const expansionProjects: { id: ExpansionId; name: string; cost: number; upkeep: number; benefit: string; demand: number; unitCost: number; reputation: number }[] = [
  { id: 'branch', name: 'Regional Branch Office', cost: 25000, upkeep: 1500, benefit: '+25% market demand ceiling', demand: .25, unitCost: 0, reputation: 0 },
  { id: 'machinery', name: 'Machinery & Tech Upgrade', cost: 20000, upkeep: 1000, benefit: '−15% production cost per unit', demand: 0, unitCost: .15, reputation: 0 },
  { id: 'marketing', name: 'Marketing & Advertising Campaign', cost: 10000, upkeep: 500, benefit: '+15% demand and +10 reputation', demand: .15, unitCost: 0, reputation: 10 },
  { id: 'rnd', name: 'R&D Facility', cost: 30000, upkeep: 2000, benefit: 'Unlocks Premium and Signature products', demand: 0, unitCost: 0, reputation: 0 },
];
export const expansionById = (id: string) => expansionProjects.find(e => e.id === id);
const owned = (b: Pick<Business, 'expansions'>) => expansionProjects.filter(e => (b.expansions ?? []).includes(e.id));
/** Read-only effects shared by projections and settlement. */
export function expansionEffects(b: Pick<Business, 'expansions'>) {
  const list = owned(b);
  return {
    demand: 1 + list.reduce((s, e) => s + e.demand, 0),
    unitCost: 1 - list.reduce((s, e) => s + e.unitCost, 0),
    upkeep: list.reduce((s, e) => s + e.upkeep, 0),
    premiumUnlocked: list.some(e => e.id === 'rnd'),
  };
}
