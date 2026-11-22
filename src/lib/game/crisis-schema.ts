import { z } from 'zod';

export const crisisTypes = ['economic', 'health', 'natural_disaster', 'utility_failure', 'worker_strike', 'project_failure'] as const;
export const crisisSchema = z.object({
  id: z.string(),
  type: z.enum(crisisTypes),
  title: z.string(),
  description: z.string(),
  jurisdiction: z.enum(['city', 'state', 'federal']),
  severity: z.number().int().min(1).max(3),
  status: z.enum(['active', 'resolved', 'escalated']),
  turnCreated: z.string().regex(/^\d{4}-\d{2}-01$/),
  durationRemaining: z.number().int().nonnegative(),
  selectedResponseId: z.string().nullable().default(null),
  lastProcessed: z.string().default(''),
  tenure: z.string().default(''),
  projectId: z.string().nullable().default(null),
  trajectory: z.enum(['unaddressed', 'stabilizing', 'contained', 'prolonged', 'negotiating']).default('unaddressed'),
  responseDate: z.string().nullable().default(null),
  indicatorEffects: z.object({ services: z.number().finite().default(0), infrastructure: z.number().finite().default(0), employment: z.number().finite().default(0) }).default({}),
  resolutionDate: z.string().nullable().default(null),
  outcome: z.enum(['managed', 'neglected']).nullable().default(null),
  neglectedTurns: z.number().int().nonnegative().default(0),
  projectEffectsApplied: z.boolean().default(false),
  reportedEvents: z.array(z.string()).default([]),
});
export const crisisGenerationSchema = z.object({
  lastProcessed: z.string().default(''),
  nextEligibleTurn: z.string().default(''),
}).default({});
export type Crisis = z.infer<typeof crisisSchema>;