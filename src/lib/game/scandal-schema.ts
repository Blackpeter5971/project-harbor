import { z } from 'zod';

/** Public lifecycle never replaces the independent finding. */
export const scandalSchema = z.object({
  id: z.string(), tenure: z.string(), date: z.string(), subject: z.string(),
  allegation: z.string(), status: z.enum(['alleged', 'cleared', 'proven']),
  finding: z.string().nullable().default(null),
  title: z.string().default('Official conduct allegation'),
  summary: z.string().default('An allegation awaits independent evidence.'),
  source: z.enum(['Investigative Reporter', 'Opposition Leak', 'Whistleblower', 'Legal Audit']).default('Whistleblower'),
  severity: z.enum(['Minor', 'Moderate', 'Severe']).default('Minor'),
  evidence: z.number().min(0).max(100).default(0),
  phase: z.enum(['Emerging', 'Active', 'Managed', 'Exploded']).default('Emerging'),
  trigger: z.enum(['office', 'business', 'promise', 'project', 'disaster', 'smear', 'corruption']).default('office'),
  lastProcessed: z.string().default(''), reported: z.array(z.string()).default([]),
  /** Phase 4B: the player's single chosen response and its saved outcome (never rerolled). */
  response: z.enum(['deny', 'press', 'settle', 'audit']).nullable().default(null),
  responseDate: z.string().nullable().default(null),
  resolution: z.enum(['defused', 'contained', 'backfired']).nullable().default(null),
  /** Last quarter end whose gradual fallout was applied (replay guard). */
  falloutTurn: z.string().default(''),
  /** Fix Phase 2: ids of related allegations folded into this one scrutiny case. */
  related: z.array(z.string()).default([]),
  /** Quarter end when the case became Resolved/Historical (kept forever as a record). */
  closedAt: z.string().default(''),
});
export type Scandal = z.infer<typeof scandalSchema>;