import { z } from 'zod';

/** Cycle-free save schema for childbirth attempts, the political manager contract, dynasty prestige and retirement. */
export const managerContractSchema = z.object({
  quarters: z.union([z.literal(4), z.literal(8)]),
  remaining: z.number().int().min(0),
  retainer: z.number().nonnegative(),
  signed: z.string(),
});
export const retirementSchema = z.object({
  date: z.string(), legacy: z.number(), summary: z.array(z.string()).default([]),
});
export const dynastySchema = z.object({
  generation: z.number().int().min(1).default(1),
  prestige: z.number().min(0).default(0),
  lastChildAttempt: z.string().optional(),
  childSerial: z.number().int().nonnegative().default(0),
  lastPeriod: z.string().optional(),
  manager: managerContractSchema.nullable().default(null),
  retired: retirementSchema.nullable().default(null),
  ancestors: z.array(z.object({ name: z.string(), legacy: z.number() })).default([]),
});
export type Dynasty = z.infer<typeof dynastySchema>;
export type ManagerContract = z.infer<typeof managerContractSchema>;
