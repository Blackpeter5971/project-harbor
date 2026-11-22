import { z } from 'zod';

export const projectCategories = [
  { id: 'transportation', name: 'Roads and transportation', project: 'Road and transit renewal', cityCost: 400_000, turns: 2 },
  { id: 'healthcare', name: 'Hospitals and healthcare', project: 'Public hospital expansion', cityCost: 800_000, turns: 4 },
  { id: 'education', name: 'Schools and education', project: 'School modernization', cityCost: 600_000, turns: 3 },
  { id: 'water', name: 'Water supply', project: 'Water supply renewal', cityCost: 500_000, turns: 3 },
  { id: 'electricity', name: 'Electricity infrastructure', project: 'Electricity grid modernization', cityCost: 700_000, turns: 4 },
  { id: 'housing', name: 'Public housing', project: 'Public housing development', cityCost: 900_000, turns: 4 },
] as const;
export const publicProjectSchema = z.object({
  id: z.string(), name: z.string(),
  category: z.enum(['transportation', 'healthcare', 'education', 'water', 'electricity', 'housing']),
  jurisdiction: z.enum(['city', 'state', 'federal']),
  tenure: z.string(), catalogId: z.string(),
  totalCost: z.number().finite().positive(), fundingCommitted: z.number().finite().nonnegative(),
  durationTurns: z.number().int().min(2).max(8), progress: z.number().min(0).max(100),
  status: z.enum(['proposed', 'approved', 'in_progress', 'completed', 'paused', 'cancelled']),
  startDate: z.string().nullable(), expectedCompletionDate: z.string().nullable(),
  paymentMode: z.enum(['escrow', 'staged']).default('escrow'),
  constructionSpent: z.number().finite().nonnegative().default(0),
  lastProcessedEnd: z.string().default(''),
  pauseReason: z.string().nullable().default(null),
  completionDate: z.string().nullable().default(null),
  benefitsApplied: z.boolean().default(false),
  cancelledDate: z.string().nullable().default(null),
  /** Phase 5B contract award; null until a contractor is chosen. */
  contract: z.object({
    contractor: z.string(), businessId: z.string().nullable(),
    method: z.enum(['open_tender', 'direct']), selfDealing: z.boolean(), conflict: z.boolean(),
    awarded: z.string(), paid: z.number().default(0), lastPaidEnd: z.string().default(''),
  }).nullable().default(null),
});
export type PublicProject = z.infer<typeof publicProjectSchema>;
export type ProjectJurisdiction = PublicProject['jurisdiction'];

export function projectBenefit(p: Pick<PublicProject, 'category' | 'jurisdiction'>) {
  const infrastructure = ['transportation', 'water', 'electricity'].includes(p.category);
  const scale = { city: 1, state: 1.25, federal: 1.5 }[p.jurisdiction];
  return {
    services: infrastructure ? 0 : 3 * scale,
    infrastructure: infrastructure ? 3 * scale : 0,
    employment: scale,
    approval: Math.round(((p.category === 'healthcare' || p.category === 'housing' ? 1.2 : 1) + (scale - 1) * 0.8) * 10) / 10,
  };
}

/** Annual allocations must continue to cover unfinished multi-year contracts. */
export const outstandingProjectAllocation = (projects: PublicProject[] = []) => projects
  .filter(p => ['approved', 'in_progress', 'paused'].includes(p.status))
  .reduce((sum, p) => sum + Math.max(0, p.fundingCommitted - (p.constructionSpent ?? 0)), 0);