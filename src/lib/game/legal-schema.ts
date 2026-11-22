import { z } from 'zod';

export const legalStages = ['inquiry', 'formal', 'grand_jury', 'indicted', 'dismissed', 'acquitted', 'convicted'] as const;
export const counselTiers = ['none', 'public', 'firm', 'elite'] as const;

export const trialStrategies = ['plea', 'fight', 'political'] as const;
export const chargeTiers = ['minor', 'felony', 'high_felony'] as const;
export const verdictTypes = ['acquitted', 'dropped', 'censure', 'fined', 'prison'] as const;

/** Phase 6B — one trial per indictment. The verdict is written once and never re-rolled. */
export const trialSchema = z.object({
  courtDate: z.string(),
  tier: z.enum(chargeTiers),
  charges: z.array(z.string()).default([]),
  strategy: z.enum(trialStrategies).nullable().default(null),
  verdict: z.object({
    type: z.enum(verdictTypes), date: z.string(),
    fine: z.number().default(0), restitution: z.number().default(0), confiscated: z.number().default(0),
    /** Quarters; 0 means no custody. */
    sentence: z.number().int().min(0).default(0), life: z.boolean().default(false), death: z.boolean().default(false),
    removed: z.boolean().default(false), text: z.string(),
  }).nullable().default(null),
});
export type Trial = z.infer<typeof trialSchema>;

export const legalCaseSchema = z.object({
  id: z.string(), opened: z.string(),
  stage: z.enum(legalStages),
  /** Prosecution case strength from concrete evidence, 0–100. */
  strength: z.number().min(0).max(100),
  counsel: z.enum(counselTiers).default('none'),
  /** Defense effort, 0–100, from counsel plus contested evidence. */
  defense: z.number().min(0).max(100).default(0),
  role: z.enum(['official', 'candidate', 'citizen']),
  stageSince: z.string(),
  /** Quarters of delay won by counsel, consumed one per quarter instead of advancing. */
  delays: z.number().int().min(0).default(0),
  contestTurn: z.string().default(''),
  closed: z.string().nullable().default(null),
  history: z.array(z.object({ date: z.string(), text: z.string() })).default([]),
  trial: trialSchema.nullable().default(null),
});
export type LegalCase = z.infer<typeof legalCaseSchema>;

export const legalSchema = z.object({
  cases: z.array(legalCaseSchema).default([]),
  /** Quarter end already processed (replay guard). */
  lastTurn: z.string().default(''),
  /** Evidence dated on or before this was already tried (no double jeopardy). */
  adjudicated: z.string().default(''),
  /** Unpaid court debt when personal cash could not cover fines/restitution. */
  owed: z.number().default(0),
  /** Prison state flag for the upcoming Prison Mode. */
  prison: z.object({ caseId: z.string(), since: z.string(), quarters: z.number().int(), release: z.string(), life: z.boolean().default(false),
    /** Phase 7A: quarters (3-month turns) already served. */
    served: z.number().int().min(0).default(0),
    crime: z.string().default(''), tier: z.string().default(''),
    prisonRep: z.number().min(0).max(100).default(10),
    death: z.boolean().default(false), executionDate: z.string().default(''),
    succession: z.string().default(''),
    legalKnowledge: z.number().min(0).max(100).default(0),
    actionRevision: z.number().int().min(0).default(0),
    activityTurn: z.string().default(''),
    activityUses: z.array(z.string()).default([]),
    lastTurn: z.string().default(''),
    updates: z.array(z.object({ date: z.string(), kind: z.enum(['business', 'family', 'politics', 'prison']), text: z.string() })).default([]),
  }).nullable().default(null),
  /** Date the sentence of death was carried out; the career is over. */
  executed: z.string().default(''),
  /** Released or completed sentences, kept for the record. */
  served: z.array(z.object({ caseId: z.string(), since: z.string(), released: z.string(), quarters: z.number(), felony: z.boolean().default(false), pardoned: z.boolean().default(false) })).default([]),
});
export type Legal = z.infer<typeof legalSchema>;
