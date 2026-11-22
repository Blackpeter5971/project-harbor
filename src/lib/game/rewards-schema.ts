import { z } from 'zod';
/** Cycle-free save schema for rewards (claims, missions). */
export const missionSchema = z.object({
  id: z.string(), cycle: z.number(), title: z.string(), detail: z.string(),
  metric: z.enum(['reputation', 'relationships', 'experience', 'money', 'followers', 'laws', 'wins']),
  baseline: z.number(), target: z.number(), difficulty: z.enum(['routine', 'challenging', 'high-stakes', 'historic']),
  coins: z.number(), cash: z.number(), attribute: z.object({ key: z.enum(['reputation', 'relationships', 'experience', 'leadership', 'communication', 'knowledge']), amount: z.number() }).nullable(),
  status: z.enum(['active', 'completed']),
});
export const rewardsSchema = z.object({
  claimed: z.array(z.string()).default([]),
  mission: missionSchema.nullable().default(null),
  declinedCycles: z.array(z.number()).default([]),
  completedMissions: z.array(z.string()).default([]),
});
