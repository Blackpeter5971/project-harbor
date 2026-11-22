import { z } from 'zod';

/** Zod-only, cycle-free save schema for the HeartBeat dating app. */
export const heartbeatMessageSchema = z.object({
  id: z.string(), date: z.string(), fromMe: z.boolean(), text: z.string().max(240),
});
export const heartbeatMatchSchema = z.object({
  personId: z.string(), matchedOn: z.string(), firstDate: z.string().nullable().default(null),
  messages: z.array(heartbeatMessageSchema).max(40).default([]),
});
export const heartbeatDecisionSchema = z.object({
  personId: z.string(), choice: z.enum(['like', 'pass']), matched: z.boolean(), date: z.string(),
});
export const heartbeatSchema = z.object({
  /** Persisted mutation guard; rendered stale requests cannot replay an action. */
  revision: z.number().int().nonnegative().default(0),
  decisions: z.array(heartbeatDecisionSchema).default([]),
  matches: z.array(heartbeatMatchSchema).default([]),
});
export type HeartBeatState = z.infer<typeof heartbeatSchema>;
export type HeartBeatMatch = z.infer<typeof heartbeatMatchSchema>;
export type HeartBeatMessage = z.infer<typeof heartbeatMessageSchema>;
